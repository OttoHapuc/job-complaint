import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

type InviteMailInput = {
  to: string;
  tenantName: string;
  caseExternalId: string;
  inviteToken: string;
};

type CriticalCaseNotificationInput = {
  to: string[];
  tenantName: string;
  caseExternalId: string;
  category: string;
  risk: string;
  reason: string;
};

const mailProvider = (process.env.MAIL_PROVIDER || "log").toLowerCase();
const isDev = process.env.NODE_ENV !== "production";
const sesRegion = process.env.AWS_SES_REGION || process.env.AWS_REGION || "";
const fromEmail = process.env.AWS_SES_FROM_EMAIL || "no-reply@jobcomplaint.local";

const sesClient =
  mailProvider === "ses" && sesRegion
    ? new SESClient({
        region: sesRegion,
        credentials:
          process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
              }
            : undefined,
      })
    : null;

async function sendEmailWithSes(params: {
  to: string[];
  subject: string;
  html: string;
}) {
  if (!sesClient) {
    throw new Error("SES não configurado. Defina MAIL_PROVIDER=ses e AWS_SES_REGION.");
  }

  await sesClient.send(
    new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: params.to },
      Message: {
        Subject: { Data: params.subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: params.html, Charset: "UTF-8" },
        },
      },
    }),
  );
}

function logOnly(channel: string, payload: Record<string, unknown>) {
  console.info(`[${channel}:dev-log]`, payload);
}

export async function sendInviteNotification(input: InviteMailInput) {
  const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/convite/${input.inviteToken}`;
  const subject = `[${input.tenantName}] Convite para colaborar no caso ${input.caseExternalId}`;
  const html = `<p>Você foi convidado(a) a colaborar com informações em um caso corporativo.</p>
      <p><strong>Caso:</strong> ${input.caseExternalId}</p>
      <p>Acesse com a chave única: <a href="${inviteUrl}">${inviteUrl}</a></p>`;

  if (mailProvider !== "ses" || isDev) {
    logOnly("invite-email", {
      to: input.to,
      tenant: input.tenantName,
      case: input.caseExternalId,
      inviteUrl,
      provider: mailProvider,
    });
    return { provider: "dev-log" as const, delivered: false, inviteUrl };
  }

  await sendEmailWithSes({
    to: [input.to],
    subject,
    html,
  });

  return { provider: "ses" as const, delivered: true, inviteUrl };
}

export async function sendCriticalCaseNotification(input: CriticalCaseNotificationInput) {
  if (input.to.length === 0) return { provider: "noop" as const, delivered: false };

  const subject = `[${input.tenantName}] Caso crítico ${input.caseExternalId}`;
  const html = `<p>Um novo caso foi classificado como crítico para ação imediata do conselho.</p>
    <p><strong>Caso:</strong> ${input.caseExternalId}</p>
    <p><strong>Categoria:</strong> ${input.category}</p>
    <p><strong>Risco:</strong> ${input.risk}</p>
    <p><strong>Motivo da elevação:</strong> ${input.reason}</p>`;

  if (mailProvider !== "ses" || isDev) {
    logOnly("critical-case", {
      to: input.to,
      tenant: input.tenantName,
      case: input.caseExternalId,
      category: input.category,
      risk: input.risk,
      reason: input.reason,
      provider: mailProvider,
    });
    return { provider: "dev-log" as const, delivered: false };
  }

  await sendEmailWithSes({
    to: input.to,
    subject,
    html,
  });

  return { provider: "ses" as const, delivered: true };
}
