import { resolveMailProvider } from "@/lib/mail/registry";
import type { MailMessage, MailSendResult } from "@/lib/mail/types";
import { verifyRecipientsForSend } from "@/lib/mail/verify";
import { logInfo, logWarn } from "@/lib/logger";

export type { MailMessage, MailProvider, MailSendResult } from "@/lib/mail/types";
export { dedupeRecipientsByEmail, uniqueNormalizedEmails } from "@/lib/mail/recipients";
export {
  isPlausibleEmailAddress,
  normalizeEmailAddress,
  verifyEmailForSend,
  verifyRecipientsForSend,
} from "@/lib/mail/verify";

function isProductionMailEnvironment() {
  return process.env.NODE_ENV === "production";
}

function simulateMailSend(
  message: MailMessage,
  allowed: string[],
  blocked: MailSendResult["blocked"],
): MailSendResult {
  logInfo("mail.send.simulated", {
    data: {
      nodeEnv: process.env.NODE_ENV ?? "development",
      to: allowed,
      subject: message.subject,
      tags: message.tags,
      textPreview: message.text?.slice(0, 240) ?? null,
      htmlLength: message.html.length,
      blockedCount: blocked?.length ?? 0,
    },
  });

  return {
    provider: "dev-simulated",
    delivered: true,
    messageId: `dev-sim-${Date.now()}`,
    blocked,
  };
}

export async function sendMail(message: MailMessage): Promise<MailSendResult> {
  const { allowed, blocked } = await verifyRecipientsForSend(message.to);
  const blockedList = blocked.length > 0 ? blocked : undefined;

  if (blocked.length > 0) {
    logWarn("mail.recipients.blocked", {
      data: {
        blockedCount: blocked.length,
        blocked: blocked.map((item) => ({ email: item.email, code: item.code })),
        tags: message.tags,
      },
    });
  }

  if (allowed.length === 0) {
    return {
      provider: isProductionMailEnvironment()
        ? (process.env.MAIL_PROVIDER ?? "ses")
        : "dev-simulated",
      delivered: false,
      blocked: blockedList,
    };
  }

  if (!isProductionMailEnvironment()) {
    return simulateMailSend(message, allowed, blockedList);
  }

  const provider = resolveMailProvider();
  const result = await provider.send({
    ...message,
    to: allowed,
  });

  return {
    ...result,
    blocked: blockedList,
  };
}
