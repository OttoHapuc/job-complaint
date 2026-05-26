import { randomBytes, createHash } from "crypto";

const TOKEN_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomTokenSegment(length: number) {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += TOKEN_CHARS[bytes[i] % TOKEN_CHARS.length];
  }
  return out;
}

export function generateWhistleblowerToken() {
  return `${randomTokenSegment(4)}-${randomTokenSegment(4)}-${randomTokenSegment(4)}`;
}

export function hashWhistleblowerToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken() {
  return `${randomTokenSegment(6)}${randomTokenSegment(6)}${randomTokenSegment(6)}`;
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(`invite:${token}`).digest("hex");
}

export function generateCaseExternalId() {
  return `CASO-${randomTokenSegment(4)}`;
}

export function mapCategoryFromNarrative(narrative: string) {
  const text = narrative.toLowerCase();

  if (text.includes("assédio sexual") || text.includes("assedio sexual")) return "Assédio Sexual";
  if (text.includes("assédio") || text.includes("assedio")) return "Assédio Moral";
  if (text.includes("fraude") || text.includes("irregularidade financeira")) return "Fraude Financeira";
  if (text.includes("discrimina")) return "Discriminação";
  if (text.includes("conflito de interesse")) return "Conflito de Interesses";

  return "Outras Violações";
}
