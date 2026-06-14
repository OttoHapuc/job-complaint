export type MailAddress = string;

export type MailMessage = {
  to: MailAddress[];
  subject: string;
  html: string;
  text?: string;
  tags?: string[];
};

export type MailSendResult = {
  provider: string;
  delivered: boolean;
  messageId?: string;
  blocked?: Array<{ email: string; code: string; detail: string }>;
};

export interface MailProvider {
  readonly id: string;
  send(message: MailMessage): Promise<MailSendResult>;
}
