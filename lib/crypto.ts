import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const algorithm = "aes-256-gcm";

function encryptionKey() {
  // The development fallback is intentionally only for a local preview. Set
  // ENCRYPTION_KEY in Vercel before saving any real provider credentials.
  return createHash("sha256")
    .update(process.env.ENCRYPTION_KEY || "chesstutor-local-development-key")
    .digest();
}

export function encryptSecret(value: string) {
  if (!value) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSecret(payload: string) {
  if (!payload) return "";
  try {
    const [ivValue, tagValue, encryptedValue] = payload.split(".");
    if (!ivValue || !tagValue || !encryptedValue) return "";
    const decipher = createDecipheriv(algorithm, encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}
