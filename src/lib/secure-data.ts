import {
  hashFieldValue,
  protectField,
  revealField,
  isFieldEncryptionEnabled,
} from "@/lib/field-crypto";

export { isFieldEncryptionEnabled };

export function hashSensitiveValue(raw: string) {
  return hashFieldValue(raw);
}

export function encryptSensitiveText(raw: string) {
  return protectField("SENSITIVE_TEXT", raw);
}

export function decryptSensitiveText(payload: string) {
  return revealField("SENSITIVE_TEXT", payload);
}
