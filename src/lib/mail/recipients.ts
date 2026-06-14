import { normalizeEmailAddress } from "@/lib/mail/email-address";

export function uniqueNormalizedEmails(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values
        .map((value) => (value ? normalizeEmailAddress(value) : ""))
        .filter((value) => value.length > 0),
    ),
  ];
}

export function dedupeRecipientsByEmail<T extends { email: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = normalizeEmailAddress(item.email);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
