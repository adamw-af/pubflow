/**
 * AES-GCM encryption for OAuth tokens stored in Convex.
 * Key is a base64-encoded 32-byte secret in TOKEN_ENCRYPTION_KEY env var.
 */

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function getKey(): Promise<CryptoKey> {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY env var is not set");
  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(raw),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Returns "base64iv.base64ciphertext" */
export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptToken(encrypted: string): Promise<string> {
  const [ivB64, ciphertextB64] = encrypted.split(".");
  if (!ivB64 || !ciphertextB64) throw new Error("Invalid encrypted token format");
  const key = await getKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivB64) },
    key,
    base64ToBytes(ciphertextB64)
  );
  return new TextDecoder().decode(plaintext);
}
