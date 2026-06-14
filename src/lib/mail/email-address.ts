const EMAIL_FORMAT_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "tempmail.com",
  "yopmail.com",
  "10minutemail.com",
  "throwaway.email",
  "sharklasers.com",
  "trashmail.com",
  "getnada.com",
  "maildrop.cc",
  "dispostable.com",
]);

export function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase();
}

export function isPlausibleEmailAddress(email: string) {
  const normalized = normalizeEmailAddress(email);
  if (!EMAIL_FORMAT_RE.test(normalized)) return false;
  const domain = normalized.split("@")[1];
  if (!domain || isDisposableDomain(domain)) return false;
  return true;
}

export function isDisposableDomain(domain: string) {
  const normalized = domain.trim().toLowerCase();
  if (DISPOSABLE_DOMAINS.has(normalized)) return true;
  return DISPOSABLE_DOMAINS.has(normalized.split(".").slice(-2).join("."));
}

export function hasValidEmailFormat(email: string) {
  return EMAIL_FORMAT_RE.test(normalizeEmailAddress(email));
}

export function extractEmailDomain(email: string) {
  return normalizeEmailAddress(email).split("@")[1] ?? "";
}
