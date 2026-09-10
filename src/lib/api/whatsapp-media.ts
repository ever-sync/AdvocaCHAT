import { getCurrentTenantId } from "@/lib/api/tenant";
import {
  isSupabaseConfigured,
  requireSupabase,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase";

const BUCKET = "whatsapp-media";
/** 50 MB — alinhado ao bucket */
export const WHATSAPP_MEDIA_MAX_BYTES = 50 * 1024 * 1024;

function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^\w.\-() ]/g, "_").slice(0, 120) || "file";
}

export type UploadProgress = {
  /** 0..1 (apenas durante upload de fato; antes/depois pode nao acionar). */
  ratio: number;
  loaded: number;
  total: number;
};

export type UploadOptions = {
  /** Cancelar mid-flight (ex.: usuario trocou de chat). */
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
};

/**
 * Faz upload do arquivo para o bucket `whatsapp-media` e devolve a URL pública HTTPS.
 * Caminho: `{tenant_id}/{uuid}_{nome}`.
 *
 * Quando `signal` ou `onProgress` sao informados usamos XHR direto (REST do
 * Supabase Storage) para obter cancelamento e barra de progresso, que o
 * supabase-js `.upload()` nao expoe. Sem essas options, mantemos o caminho
 * antigo via SDK.
 */
export async function uploadWhatsappMediaFile(
  file: File,
  options?: UploadOptions,
): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase nao configurado.");
  }

  if (file.size > WHATSAPP_MEDIA_MAX_BYTES) {
    throw new Error(`Arquivo muito grande (max ${WHATSAPP_MEDIA_MAX_BYTES / (1024 * 1024)} MB).`);
  }

  const tenantId = await getCurrentTenantId();
  const supabase = requireSupabase();
  const path = `${tenantId}/${crypto.randomUUID()}_${sanitizeFileName(file.name)}`;
  const contentType = file.type || "application/octet-stream";

  const wantsXhr = Boolean(options?.signal) || typeof options?.onProgress === "function";

  if (wantsXhr) {
    await uploadViaXhr(path, file, contentType, options ?? {});
  } else {
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    });
    if (error) {
      throw new Error(error.message);
    }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function uploadViaXhr(
  path: string,
  file: File,
  contentType: string,
  options: UploadOptions,
): Promise<void> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase nao configurado.");
  }

  const supabase = requireSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? supabaseAnonKey;

  const url = `${supabaseUrl}/storage/v1/object/${BUCKET}/${encodeURI(path)}`;

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("apikey", supabaseAnonKey as string);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("Cache-Control", "3600");

    xhr.upload.onprogress = (event) => {
      if (!options.onProgress) return;
      if (event.lengthComputable) {
        options.onProgress({
          ratio: event.total > 0 ? event.loaded / event.total : 0,
          loaded: event.loaded,
          total: event.total,
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let message = `Falha no upload (HTTP ${xhr.status}).`;
      try {
        const parsed = JSON.parse(xhr.responseText);
        if (parsed?.message) message = String(parsed.message);
        else if (parsed?.error) message = String(parsed.error);
      } catch {
        if (xhr.responseText) message = xhr.responseText.slice(0, 200);
      }
      reject(new Error(message));
    };

    xhr.onerror = () => reject(new Error("Falha de rede no upload."));
    xhr.ontimeout = () => reject(new Error("Tempo esgotado no upload."));
    xhr.onabort = () => reject(new DOMException("Upload cancelado.", "AbortError"));

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }
      options.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(file);
  });
}
