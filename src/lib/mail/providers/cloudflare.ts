import type { MailMessage, MailProvider, MailSendResult } from "@/lib/mail/types";

type CloudflareSendResult = {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  result?: {
    delivered?: string[];
    permanent_bounces?: string[];
    queued?: string[];
  };
};

export class CloudflareMailProvider implements MailProvider {
  readonly id = "cloudflare";
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly fromEmail: string;

  constructor() {
    const accountId =
      process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
      process.env.R2_ACCOUNT_ID?.trim() ||
      "";
    const apiToken =
      process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim() ||
      process.env.CLOUDFLARE_API_TOKEN?.trim() ||
      "";
    const fromEmail = process.env.CLOUDFLARE_EMAIL_FROM?.trim() || "";

    if (!accountId) {
      throw new Error(
        "CLOUDFLARE_ACCOUNT_ID (ou R2_ACCOUNT_ID) é obrigatório para MAIL_PROVIDER=cloudflare.",
      );
    }
    if (!apiToken) {
      throw new Error(
        "CLOUDFLARE_EMAIL_API_TOKEN (ou CLOUDFLARE_API_TOKEN) é obrigatório para MAIL_PROVIDER=cloudflare.",
      );
    }
    if (!fromEmail) {
      throw new Error("CLOUDFLARE_EMAIL_FROM é obrigatório para MAIL_PROVIDER=cloudflare.");
    }

    this.accountId = accountId;
    this.apiToken = apiToken;
    this.fromEmail = fromEmail;
  }

  async send(message: MailMessage): Promise<MailSendResult> {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/email/sending/send`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: message.to,
        from: this.fromEmail,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as CloudflareSendResult;
    if (!response.ok || payload.success === false) {
      const detail =
        payload.errors?.map((item) => `${item.code}:${item.message}`).join(", ") ||
        `HTTP ${response.status}`;
      throw new Error(`Cloudflare Email falhou: ${detail}`);
    }

    const delivered = payload.result?.delivered?.length ?? 0;
    const queued = payload.result?.queued?.length ?? 0;
    return {
      provider: this.id,
      delivered: delivered > 0 || queued > 0,
      messageId: payload.result?.delivered?.[0] ?? payload.result?.queued?.[0],
    };
  }
}
