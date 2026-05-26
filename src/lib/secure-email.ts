import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const KEY_SIZE = 32;
const IV_SIZE = 12;

function getEncryptionKey() {
  const configured = process.env.INVITE_EMAIL_ENCRYPTION_KEY?.trim();
  if (configured) {
    try {
      const fromBase64 = Buffer.from(configured, "base64");
      if (fromBase64.length >= KEY_SIZE) {
        return fromBase64.subarray(0, KEY_SIZE);
      }
    } catch {
      // fallback below
    }
    return createHash("sha256").update(configured).digest();
  }

  const fallback = process.env.JWT_SECRET ?? "unsafe-dev-key";
  return createHash("sha256").update(`invite:${fallback}`).digest();
}

export function hashNormalizedEmail(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function encryptEmail(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const key = getEncryptionKey();
  const iv = randomBytes(IV_SIZE);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(email, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptEmail(payload: string) {
  const [ivB64, authTagB64, encryptedB64] = payload.split(".");
  if (!ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error("Formato de e-mail criptografado inválido.");
  }
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
