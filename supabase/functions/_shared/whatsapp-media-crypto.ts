/**
 * Descriptografia de midia do WhatsApp.
 *
 * Mensagens de midia entregues por webhooks do WhatsApp/uazapi vem em URLs
 * publicas mas com o conteudo cifrado (`.enc`, ou path `mmg.whatsapp.net/...`).
 * Cada mensagem traz uma `mediaKey` em base64 que, combinada com um info
 * string especifico ao tipo de midia, gera (via HKDF-SHA256) os parametros
 * para AES-256-CBC + HMAC-SHA256.
 *
 * Algoritmo (mesmo usado pelo Baileys):
 *   1. expandedKey = HKDF-SHA256(mediaKey, 112 bytes, info)
 *   2. iv         = expandedKey[ 0:16]
 *   3. cipherKey  = expandedKey[16:48]
 *   4. macKey     = expandedKey[48:80]
 *   5. encrypted  = downloadedBytes[0:-10]
 *   6. mac        = downloadedBytes[-10:]    (truncado em 10 bytes)
 *   7. verifica HMAC-SHA256(macKey, iv || encrypted)[0:10] === mac
 *   8. decrypted  = AES-256-CBC-decrypt(cipherKey, iv, encrypted)
 *
 * Refs:
 *   - https://github.com/WhiskeySockets/Baileys/blob/master/src/Utils/messages-media.ts
 */

export type WhatsappMediaKind = "image" | "video" | "audio" | "document" | "sticker";

const HKDF_INFO: Record<WhatsappMediaKind, string> = {
  image: "WhatsApp Image Keys",
  video: "WhatsApp Video Keys",
  audio: "WhatsApp Audio Keys",
  document: "WhatsApp Document Keys",
  /* Sticker reaproveita as chaves de imagem (igual Baileys). */
  sticker: "WhatsApp Image Keys",
};

function base64ToBytes(value: string): Uint8Array {
  const cleaned = value.replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * HKDF-SHA256 para derivar `length` bytes a partir do `keyMaterial`. WebCrypto
 * exige um `salt` (opcional via spec; aqui usamos zero-filled de 32 bytes igual
 * a libsignal/Baileys quando salt nao e fornecido).
 */
async function hkdfExpand(
  keyMaterial: Uint8Array,
  info: string,
  length: number,
): Promise<Uint8Array> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    keyMaterial as BufferSource,
    "HKDF",
    false,
    ["deriveBits"],
  );

  const salt = new Uint8Array(32);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as BufferSource,
      info: new TextEncoder().encode(info),
    },
    baseKey,
    length * 8,
  );

  return new Uint8Array(derivedBits);
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data as BufferSource);
  return new Uint8Array(signature);
}

async function aesCbcDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "AES-CBC", length: 256 },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: iv as BufferSource },
    cryptoKey,
    ciphertext as BufferSource,
  );
  return new Uint8Array(plaintext);
}

export type DecryptionInput = {
  encryptedBytes: Uint8Array;
  mediaKey: string | Uint8Array;
  mediaKind: WhatsappMediaKind;
  /**
   * Quando `true`, ignora a verificacao de HMAC. WhatsApp por vezes serve URLs
   * que nao incluem o MAC truncado no fim (caminhos `o1/v/...`); nesse caso
   * a verificacao falharia mas a descriptografia ainda eh valida. Usamos como
   * fallback se a verificacao do MAC falhar.
   */
  skipMacCheck?: boolean;
};

/**
 * Descriptografa bytes brutos baixados de uma URL `.enc` do WhatsApp, usando a
 * `mediaKey` (base64) que veio na mensagem e o tipo de midia.
 *
 * Lanca se a `mediaKey` for invalida ou se o HMAC nao bater (e nao foi pedido
 * para ignorar). Na pratica chamamos com `skipMacCheck: false` primeiro e, se
 * falhar, tentamos com `true`.
 */
export async function decryptWhatsappMedia(input: DecryptionInput): Promise<Uint8Array> {
  const mediaKeyBytes =
    typeof input.mediaKey === "string" ? base64ToBytes(input.mediaKey) : input.mediaKey;
  if (mediaKeyBytes.length !== 32) {
    throw new Error(`mediaKey invalida: esperado 32 bytes, recebido ${mediaKeyBytes.length}`);
  }

  const expanded = await hkdfExpand(mediaKeyBytes, HKDF_INFO[input.mediaKind], 112);
  const iv = expanded.slice(0, 16);
  const cipherKey = expanded.slice(16, 48);
  const macKey = expanded.slice(48, 80);

  const enc = input.encryptedBytes;
  if (enc.length <= 10) {
    throw new Error(`payload encriptado curto demais: ${enc.length} bytes`);
  }

  const ciphertext = enc.slice(0, enc.length - 10);
  const mac = enc.slice(enc.length - 10);

  if (!input.skipMacCheck) {
    const ivPlusCipher = new Uint8Array(iv.length + ciphertext.length);
    ivPlusCipher.set(iv, 0);
    ivPlusCipher.set(ciphertext, iv.length);
    const computedMac = (await hmacSha256(macKey, ivPlusCipher)).slice(0, 10);
    if (!timingSafeEqual(mac, computedMac)) {
      throw new Error("HMAC da midia nao confere — mediaKey ou bytes corrompidos");
    }
  }

  return await aesCbcDecrypt(cipherKey, iv, ciphertext);
}

/**
 * Conveniencia: baixa a URL e descriptografa em uma chamada. Tenta com
 * verificacao de MAC primeiro, se falhar tenta sem (URLs `o1/v/...` em alguns
 * casos servem o arquivo sem o MAC truncado).
 */
export async function fetchAndDecryptWhatsappMedia(params: {
  encryptedUrl: string;
  mediaKey: string;
  mediaKind: WhatsappMediaKind;
}): Promise<Uint8Array> {
  const response = await fetch(params.encryptedUrl);
  if (!response.ok) {
    throw new Error(`download falhou: HTTP ${response.status}`);
  }
  const encryptedBytes = new Uint8Array(await response.arrayBuffer());

  try {
    return await decryptWhatsappMedia({
      encryptedBytes,
      mediaKey: params.mediaKey,
      mediaKind: params.mediaKind,
    });
  } catch (firstError) {
    try {
      return await decryptWhatsappMedia({
        encryptedBytes,
        mediaKey: params.mediaKey,
        mediaKind: params.mediaKind,
        skipMacCheck: true,
      });
    } catch {
      throw firstError;
    }
  }
}
