import { hashFieldValue, protectField, revealField } from "@/lib/field-crypto";

export function hashNormalizedEmail(email: string) {
  return hashFieldValue(email);
}

export function encryptEmail(rawEmail: string) {
  return protectField("EMAIL", rawEmail);
}

export function decryptEmail(payload: string) {
  return revealField("EMAIL", payload);
}
