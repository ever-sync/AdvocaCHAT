import { getRequiredEnv } from "./supabase.ts";

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function getCryptoKey() {
  const source = new TextEncoder().encode(getRequiredEnv("APP_ENCRYPTION_KEY"));
  const digest = await crypto.subtle.digest("SHA-256", source);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plainText: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getCryptoKey();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plainText),
  );

  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(payload: string) {
  const [ivBase64, cipherBase64] = payload.split(".");
  if (!ivBase64 || !cipherBase64) {
    throw new Error("Invalid encrypted payload.");
  }

  const key = await getCryptoKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivBase64) },
    key,
    base64ToBytes(cipherBase64),
  );

  return new TextDecoder().decode(decrypted);
}
