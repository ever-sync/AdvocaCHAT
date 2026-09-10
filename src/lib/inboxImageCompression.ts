/**
 * Compressao client-side de imagens antes do upload.
 *
 * Heuristica:
 *   - so JPEG/PNG/WebP entram (HEIC/AVIF/GIF passam direto).
 *   - so arquivos acima de COMPRESS_MIN_BYTES sao processados.
 *   - dimensoes redimensionadas para caber em MAX_DIMENSION (lado maior).
 *   - exporta JPEG com QUALITY (boa relacao tamanho/qualidade visual em foto).
 *   - se o resultado for >= ao original, devolve o original (PNGs com pouca
 *     entropia frequentemente nao melhoram).
 *
 * Roda em browser. Se algum passo falhar (canvas, decode, OOM), devolve o
 * original silenciosamente.
 */
const MAX_DIMENSION = 1920;
const QUALITY = 0.85;
/** Abaixo deste tamanho nao vale a pena recomprimir. */
const COMPRESS_MIN_BYTES = 1 * 1024 * 1024;
const COMPRESSIBLE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export type ImageCompressionResult = {
  file: File;
  originalSize: number;
  compressed: boolean;
};

export async function maybeCompressImage(file: File): Promise<ImageCompressionResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { file, originalSize: file.size, compressed: false };
  }
  if (file.size < COMPRESS_MIN_BYTES) {
    return { file, originalSize: file.size, compressed: false };
  }
  if (!COMPRESSIBLE_MIMES.has(file.type.toLowerCase())) {
    return { file, originalSize: file.size, compressed: false };
  }

  try {
    const bitmap = await loadBitmap(file);
    const { width, height } = scaleToFit(bitmap.width, bitmap.height, MAX_DIMENSION);

    if (width === bitmap.width && height === bitmap.height && file.type.toLowerCase() === "image/jpeg") {
      // Sem rescaling e ja e JPEG: tentar ainda assim re-encode com QUALITY
      // pode reduzir, mas frequentemente piora. Aborta.
      releaseBitmap(bitmap);
      return { file, originalSize: file.size, compressed: false };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      releaseBitmap(bitmap);
      return { file, originalSize: file.size, compressed: false };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    releaseBitmap(bitmap);

    const blob = await canvasToBlob(canvas, "image/jpeg", QUALITY);
    if (!blob) {
      return { file, originalSize: file.size, compressed: false };
    }
    if (blob.size >= file.size) {
      return { file, originalSize: file.size, compressed: false };
    }

    const baseName = file.name.replace(/\.[^.]+$/, "");
    const compressedFile = new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });

    return { file: compressedFile, originalSize: file.size, compressed: true };
  } catch {
    return { file, originalSize: file.size, compressed: false };
  }
}

function scaleToFit(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = Math.min(max / w, max / h);
  return {
    width: Math.max(1, Math.round(w * ratio)),
    height: Math.max(1, Math.round(h * ratio)),
  };
}

type BitmapLike = { width: number; height: number; close?: () => void };

async function loadBitmap(file: File): Promise<CanvasImageSource & BitmapLike> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return bitmap as unknown as CanvasImageSource & BitmapLike;
    } catch {
      // fallback abaixo
    }
  }
  return await loadImageElement(file);
}

function releaseBitmap(bitmap: BitmapLike) {
  if (typeof bitmap.close === "function") {
    try {
      bitmap.close();
    } catch {
      // ignore
    }
  }
}

function loadImageElement(file: File): Promise<CanvasImageSource & BitmapLike> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(
        Object.assign(img, {
          close: () => undefined,
        }) as unknown as CanvasImageSource & BitmapLike,
      );
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}
