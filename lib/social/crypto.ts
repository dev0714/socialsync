import crypto from "node:crypto";

// AES-256-GCM encryption for sensitive social tokens stored in `socialsync.social_accounts`.
// Tokens are only ever decrypted server-side when publishing; they are never returned to the client.
// The key is derived from SOCIAL_TOKEN_SECRET (any length) via SHA-256 to a fixed 32 bytes.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  const secret = process.env.SOCIAL_TOKEN_SECRET;
  if (!secret) {
    throw new Error("Missing required environment variable: SOCIAL_TOKEN_SECRET");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

// Returns a self-describing string: base64url(iv).base64url(authTag).base64url(ciphertext)
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptToken(payload: string): string {
  const key = getKey();
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Malformed encrypted token.");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function isTokenSecretConfigured(): boolean {
  return Boolean(process.env.SOCIAL_TOKEN_SECRET);
}
