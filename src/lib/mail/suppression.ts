import { EmailSuppressionReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEmailAddress } from "@/lib/mail/email-address";

export async function isEmailSuppressedLocally(email: string): Promise<boolean> {
  const normalized = normalizeEmailAddress(email);
  const row = await prisma.emailSuppression.findUnique({
    where: { email: normalized },
    select: { id: true },
  });
  return Boolean(row);
}

export async function registerEmailSuppression(input: {
  email: string;
  reason: EmailSuppressionReason;
  source?: string;
  detail?: string;
}) {
  const normalized = normalizeEmailAddress(input.email);
  return prisma.emailSuppression.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      reason: input.reason,
      source: input.source,
      detail: input.detail,
    },
    update: {
      reason: input.reason,
      source: input.source,
      detail: input.detail,
    },
  });
}

export async function registerEmailSuppressions(
  emails: string[],
  reason: EmailSuppressionReason,
  source?: string,
  detail?: string,
) {
  const unique = [...new Set(emails.map((email) => normalizeEmailAddress(email)))];
  await Promise.all(
    unique.map((email) =>
      registerEmailSuppression({
        email,
        reason,
        source,
        detail,
      }),
    ),
  );
  return unique;
}
