import { CloudflareMailProvider } from "@/lib/mail/providers/cloudflare";
import { SesMailProvider } from "@/lib/mail/providers/ses";
import type { MailProvider } from "@/lib/mail/types";

export const MAIL_PROVIDER_IDS = ["ses", "cloudflare"] as const;
export type MailProviderId = (typeof MAIL_PROVIDER_IDS)[number];

const providerCache = new Map<string, MailProvider>();

function createProvider(id: MailProviderId): MailProvider {
  switch (id) {
    case "ses":
      return new SesMailProvider();
    case "cloudflare":
      return new CloudflareMailProvider();
    default:
      throw new Error(
        `MAIL_PROVIDER="${id}" não suportado. Valores permitidos: ses, cloudflare.`,
      );
  }
}

function normalizeProviderId(providerId?: string): MailProviderId {
  const id = (providerId ?? process.env.MAIL_PROVIDER ?? "ses").trim().toLowerCase();
  if (id === "ses" || id === "cloudflare") return id;
  throw new Error(
    `MAIL_PROVIDER="${id}" inválido. Use apenas "ses" (Amazon SES) ou "cloudflare" (Cloudflare Email).`,
  );
}

export function resolveMailProvider(providerId?: string): MailProvider {
  const id = normalizeProviderId(providerId);
  const cached = providerCache.get(id);
  if (cached) return cached;
  const provider = createProvider(id);
  providerCache.set(id, provider);
  return provider;
}

export function listMailProviders() {
  return MAIL_PROVIDER_IDS;
}
