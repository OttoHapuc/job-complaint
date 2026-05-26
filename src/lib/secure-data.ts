import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const KEY_SIZE = 32;
const IV_SIZE = 12;
const VERSION = "v1";

function deriveKeyMaterial() {
  const explicitHash = process.env.SENSITIVE_DATA_TOKEN_HASH?.trim();
  if (explicitHash) return explicitHash;
  const inviteKey = process.env.INVITE_EMAIL_ENCRYPTION_KEY?.trim();
  if (inviteKey) return inviteKey;
  return process.env.JWT_SECRET ?? "unsafe-dev-key";
}

function getEncryptionKey() {
  const material = deriveKeyMaterial();
  return createHash("sha256").update(`sensitive:${material}`).digest().subarray(0, KEY_SIZE);
}

export function hashSensitiveValue(raw: string) {
  return createHash("sha256").update(raw.trim().toLowerCase()).digest("hex");
}

export function encryptSensitiveText(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  const key = getEncryptionKey();
  const iv = randomBytes(IV_SIZE);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION}.${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSensitiveText(payload: string) {
  const value = payload?.trim();
  if (!value) return "";
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    // Backward compatibility with existing plaintext rows.
    return value;
  }
  const [, ivB64, authTagB64, encryptedB64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

