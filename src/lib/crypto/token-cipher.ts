import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function getSecret(): string {
  const secret =
    process.env.OAUTH_TOKEN_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("Missing OAUTH_TOKEN_SECRET or BETTER_AUTH_SECRET");
  }
  return secret;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(getSecret()), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Invalid encrypted payload");
  }
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const encrypted = Buffer.from(dataPart, "base64url");
  const decipher = createDecipheriv(ALGORITHM, deriveKey(getSecret()), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
