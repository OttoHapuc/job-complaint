import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/** Domínios de proteção — cada um com formato/armadura distinta no banco. */
export type FieldCryptoDomain = "SENSITIVE_TEXT" | "EMAIL";

const SENSITIVE_VERSION = "v1";
const KEY_SIZE = 32;
const IV_SIZE = 12;

/**
 * Produção: criptografia ligada por padrão.
 * Desenvolvimento/teste: texto legível por padrão para apuração.
 * Override explícito: DB_FIELD_ENCRYPTION=true|false
 */
export function isFieldEncryptionEnabled() {
  const explicit = process.env.DB_FIELD_ENCRYPTION?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1" || explicit === "yes") return true;
  if (explicit === "false" || explicit === "0" || explicit === "no") return false;
  return process.env.NODE_ENV === "production";
}

function deriveSensitiveKeyMaterial() {
  const explicitHash = process.env.SENSITIVE_DATA_TOKEN_HASH?.trim();
  if (explicitHash) return explicitHash;
  const inviteKey = process.env.INVITE_EMAIL_ENCRYPTION_KEY?.trim();
  if (inviteKey) return inviteKey;
  return process.env.JWT_SECRET ?? "unsafe-dev-key";
}

function getSensitiveTextKey() {
  const material = deriveSensitiveKeyMaterial();
  return createHash("sha256").update(`sensitive:${material}`).digest().subarray(0, KEY_SIZE);
}

function getEmailKey() {
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

function encryptAesGcm(key: Buffer, plaintext: string) {
  const iv = randomBytes(IV_SIZE);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { iv, authTag, encrypted };
}

function decryptAesGcm(key: Buffer, iv: Buffer, authTag: Buffer, encrypted: Buffer) {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function isSensitiveTextEncrypted(payload: string) {
  const parts = payload.split(".");
  return parts.length === 4 && parts[0] === SENSITIVE_VERSION;
}

function isEmailEncrypted(payload: string) {
  const parts = payload.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

/** Protege valor antes de persistir. Hashes one-way não passam por aqui. */
export function protectField(domain: FieldCryptoDomain, raw: string) {
  const value = raw.trim();
  if (!value) return "";
  if (!isFieldEncryptionEnabled()) return value;

  if (domain === "SENSITIVE_TEXT") {
    const { iv, authTag, encrypted } = encryptAesGcm(getSensitiveTextKey(), value);
    return `${SENSITIVE_VERSION}.${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
  }

  const { iv, authTag, encrypted } = encryptAesGcm(getEmailKey(), value.toLowerCase());
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
}

/** Revela valor lido do banco (compatível com legado em texto claro). */
export function revealField(domain: FieldCryptoDomain, payload: string) {
  const value = payload?.trim();
  if (!value) return "";

  if (domain === "SENSITIVE_TEXT") {
    if (!isSensitiveTextEncrypted(value)) return value;
    const [, ivB64, authTagB64, encryptedB64] = value.split(".");
    return decryptAesGcm(
      getSensitiveTextKey(),
      Buffer.from(ivB64, "base64"),
      Buffer.from(authTagB64, "base64"),
      Buffer.from(encryptedB64, "base64"),
    );
  }

  if (!isEmailEncrypted(value)) return value;
  const [ivB64, authTagB64, encryptedB64] = value.split(".");
  return decryptAesGcm(
    getEmailKey(),
    Buffer.from(ivB64, "base64"),
    Buffer.from(authTagB64, "base64"),
    Buffer.from(encryptedB64, "base64"),
  );
}

/** Hash determinístico — sempre ativo (não reversível). */
export function hashFieldValue(raw: string) {
  return createHash("sha256").update(raw.trim().toLowerCase()).digest("hex");
}
