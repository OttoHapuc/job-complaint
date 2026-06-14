import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import type { MailMessage, MailProvider, MailSendResult } from "@/lib/mail/types";

export class SesMailProvider implements MailProvider {
  readonly id = "ses";
  private readonly client: SESClient;
  private readonly fromEmail: string;

  constructor() {
    const region = process.env.AWS_SES_REGION || process.env.AWS_REGION || "";
    if (!region) {
      throw new Error("AWS_SES_REGION ou AWS_REGION é obrigatório para MAIL_PROVIDER=ses.");
    }
    this.fromEmail = process.env.AWS_SES_FROM_EMAIL || "no-reply@jobcomplaint.local";
    this.client = new SESClient({
      region,
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    const response = await this.client.send(
      new SendEmailCommand({
        Source: this.fromEmail,
        Destination: { ToAddresses: message.to },
        Message: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: message.html, Charset: "UTF-8" },
            ...(message.text
              ? { Text: { Data: message.text, Charset: "UTF-8" } }
              : {}),
          },
        },
      }),
    );
    return {
      provider: this.id,
      delivered: true,
      messageId: response.MessageId,
    };
  }
}
