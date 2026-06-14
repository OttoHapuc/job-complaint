import { promises as dns } from "node:dns";
import { GetSuppressedDestinationCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { EmailSuppressionReason } from "@prisma/client";
import {
  extractEmailDomain,
  hasValidEmailFormat,
  isDisposableDomain,
  normalizeEmailAddress,
} from "@/lib/mail/email-address";
import { isEmailSuppressedLocally, registerEmailSuppression } from "@/lib/mail/suppression";

const mxCache = new Map<string, { ok: boolean; expiresAt: number }>();
const MX_CACHE_TTL_MS = 60 * 60 * 1000;

let sesSuppressionClient: SESv2Client | null = null;

export type EmailVerificationCode =
  | "INVALID_FORMAT"
  | "DISPOSABLE_DOMAIN"
  | "NO_MX_RECORD"
  | "LOCAL_SUPPRESSION"
  | "SES_SUPPRESSION";

export type EmailVerificationResult = {
  email: string;
  ok: boolean;
  code?: EmailVerificationCode;
  detail?: string;
};

function envFlag(name: string, defaultValue: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultValue;
  return raw === "1" || raw === "true" || raw === "yes";
}

async function domainHasMxRecords(domain: string) {
  const normalized = domain.trim().toLowerCase();
  const cached = mxCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ok;
  }

  try {
    const records = await dns.resolveMx(normalized);
    const ok = records.length > 0;
    mxCache.set(normalized, { ok, expiresAt: Date.now() + MX_CACHE_TTL_MS });
    return ok;
  } catch {
    mxCache.set(normalized, { ok: false, expiresAt: Date.now() + MX_CACHE_TTL_MS });
    return false;
  }
}

function getSesSuppressionClient() {
  if (sesSuppressionClient) return sesSuppressionClient;
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || "";
  if (!region) return null;
  sesSuppressionClient = new SESv2Client({
    region,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
  return sesSuppressionClient;
}

async function isSesSuppressed(email: string) {
  const client = getSesSuppressionClient();
  if (!client) return false;
  try {
    await client.send(
      new GetSuppressedDestinationCommand({
        EmailAddress: normalizeEmailAddress(email),
      }),
    );
    return true;
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "NotFoundException") return false;
    return false;
  }
}

export async function verifyEmailForSend(email: string): Promise<EmailVerificationResult> {
  const normalized = normalizeEmailAddress(email);

  if (!hasValidEmailFormat(normalized)) {
    return {
      email: normalized,
      ok: false,
      code: "INVALID_FORMAT",
      detail: "Formato de e-mail inválido.",
    };
  }

  const domain = extractEmailDomain(normalized);
  if (!domain) {
    return {
      email: normalized,
      ok: false,
      code: "INVALID_FORMAT",
      detail: "Domínio ausente.",
    };
  }

  if (isDisposableDomain(domain)) {
    await registerEmailSuppression({
      email: normalized,
      reason: EmailSuppressionReason.VALIDATION,
      source: "mail-verify",
      detail: "Domínio descartável.",
    });
    return {
      email: normalized,
      ok: false,
      code: "DISPOSABLE_DOMAIN",
      detail: "Domínio de e-mail descartável não permitido.",
    };
  }

  if (await isEmailSuppressedLocally(normalized)) {
    return {
      email: normalized,
      ok: false,
      code: "LOCAL_SUPPRESSION",
      detail: "Endereço bloqueado por bounce, complaint ou validação anterior.",
    };
  }

  const verifyMx = envFlag("MAIL_VERIFY_MX", process.env.NODE_ENV === "production");
  if (verifyMx) {
    const hasMx = await domainHasMxRecords(domain);
    if (!hasMx) {
      await registerEmailSuppression({
        email: normalized,
        reason: EmailSuppressionReason.VALIDATION,
        source: "mail-verify",
        detail: "Domínio sem registro MX.",
      });
      return {
        email: normalized,
        ok: false,
        code: "NO_MX_RECORD",
        detail: "Domínio não aceita e-mail (sem MX).",
      };
    }
  }

  const verifySes =
    envFlag("MAIL_VERIFY_SES_SUPPRESSION", true) &&
    (process.env.MAIL_PROVIDER ?? "ses").trim().toLowerCase() === "ses";
  if (verifySes) {
    const suppressed = await isSesSuppressed(normalized);
    if (suppressed) {
      await registerEmailSuppression({
        email: normalized,
        reason: EmailSuppressionReason.BOUNCE,
        source: "ses-suppression-list",
        detail: "Presente na suppression list da conta SES.",
      });
      return {
        email: normalized,
        ok: false,
        code: "SES_SUPPRESSION",
        detail: "Endereço na suppression list do Amazon SES.",
      };
    }
  }

  return { email: normalized, ok: true };
}

export async function verifyRecipientsForSend(emails: string[]) {
  const unique = [...new Set(emails.map((email) => normalizeEmailAddress(email)))];
  const results = await Promise.all(unique.map((email) => verifyEmailForSend(email)));
  const allowed = results.filter((item) => item.ok).map((item) => item.email);
  const blocked = results
    .filter((item) => !item.ok)
    .map((item) => ({
      email: item.email,
      code: item.code ?? "INVALID_FORMAT",
      detail: item.detail ?? "Bloqueado pela verificação de e-mail.",
    }));
  return { allowed, blocked };
}

export { isPlausibleEmailAddress, normalizeEmailAddress } from "@/lib/mail/email-address";
