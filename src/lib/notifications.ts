import { sendMail } from "@/lib/mail";
import { uniqueNormalizedEmails } from "@/lib/mail/recipients";
import {
  emailMetaTable,
  emailNoticeBox,
  emailParagraph,
  escapeHtml,
  renderEmailLayout,
} from "@/lib/mail/templates";

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

type AccountMailInput = {
  to: string;
  tenantName: string;
  tenantCode: string;
  memberName: string;
  loginUrl: string;
};

function appBaseUrl() {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

function caseDashboardUrl(caseExternalId: string) {
  const shortId = caseExternalId.toLowerCase().replace("caso-", "");
  return `${appBaseUrl()}/dashboard/casos/${shortId}`;
}

function truncatePreview(text: string, maxLength = 220) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

type CaseMailBase = {
  to: string;
  tenantName: string;
  caseExternalId: string;
};

type WhistleblowerTrackingMailInput = CaseMailBase & {
  trackingToken?: string;
  questionPreview?: string;
};

type ParticipantMailInput = CaseMailBase & {
  inviteToken: string;
  attempt?: number;
};

type CommitteeCaseMailInput = {
  to: string[];
  tenantName: string;
  caseExternalId: string;
  category?: string;
  reason?: string;
};

async function sendCommitteeCaseMail(input: {
  recipients: string[];
  tenantName: string;
  caseExternalId: string;
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  tag: string;
  tone?: "default" | "warning" | "critical";
}) {
  const recipients = uniqueNormalizedEmails(input.recipients);
  if (recipients.length === 0) return { provider: "noop" as const, delivered: false };

  const html = renderEmailLayout({
    preheader: input.preheader,
    eyebrow: input.eyebrow,
    title: input.title,
    tenantName: input.tenantName,
    bodyHtml: input.bodyHtml,
    cta: {
      label: input.ctaLabel,
      href: caseDashboardUrl(input.caseExternalId),
    },
  });

  return sendMail({
    to: recipients,
    subject: input.subject,
    html,
    tags: [input.tag, input.caseExternalId],
  });
}

export async function sendCommitteePreConclusionReadyNotification(input: CommitteeCaseMailInput) {
  return sendCommitteeCaseMail({
    recipients: input.to,
    tenantName: input.tenantName,
    caseExternalId: input.caseExternalId,
    subject: `[${input.tenantName}] Pre-conclusão pronta — ${input.caseExternalId}`,
    preheader: `Pacote de pre-conclusão disponível para o caso ${input.caseExternalId}.`,
    eyebrow: "Deliberação do conselho",
    title: "Pre-conclusão pronta para revisão",
    bodyHtml:
      emailParagraph(
        "O pacote de pre-conclusão foi gerado automaticamente e está disponível para revisão antes da publicação ao comitê.",
      ) +
      emailMetaTable([
        { label: "Caso", value: input.caseExternalId },
        ...(input.category ? [{ label: "Categoria", value: input.category }] : []),
      ]) +
      emailNoticeBox("Revise o pacote e publique para votação quando a investigação estiver adequada."),
    ctaLabel: "Revisar pre-conclusão",
    tag: "committee-pre-conclusion-ready",
  });
}

export async function sendCommitteeVoteRequiredNotification(
  input: CommitteeCaseMailInput & { origin?: string },
) {
  const originLabel =
    input.origin === "abandonment-confirmation"
      ? "Confirmação de abandono pelo conselho"
      : "Publicação da investigação";
  return sendCommitteeCaseMail({
    recipients: input.to,
    tenantName: input.tenantName,
    caseExternalId: input.caseExternalId,
    subject: `[${input.tenantName}] Votação aberta — ${input.caseExternalId}`,
    preheader: `O caso ${input.caseExternalId} aguarda voto do comitê.`,
    eyebrow: "Votação do comitê",
    title: "Caso aguardando deliberação",
    bodyHtml:
      emailParagraph(
        "A pre-conclusão foi publicada e o caso entrou em votação. Registre seu voto no painel com trilha de auditoria.",
      ) +
      emailMetaTable([
        { label: "Caso", value: input.caseExternalId },
        { label: "Origem", value: originLabel },
      ]),
    ctaLabel: "Registrar voto",
    tag: "committee-vote-required",
  });
}

export async function sendCommitteeAbandonmentPendingNotification(input: CommitteeCaseMailInput) {
  return sendCommitteeCaseMail({
    recipients: input.to,
    tenantName: input.tenantName,
    caseExternalId: input.caseExternalId,
    subject: `[${input.tenantName}] Abandono pendente — ${input.caseExternalId}`,
    preheader: `Caso ${input.caseExternalId} aguarda confirmação de abandono.`,
    eyebrow: "Ação do conselho",
    title: "Abandono aguardando confirmação",
    bodyHtml:
      emailParagraph(
        "O denunciante não respondeu dentro da janela planejada. O caso foi encaminhado para pre-conclusão e precisa de confirmação do conselho antes da votação.",
      ) +
      emailMetaTable([{ label: "Caso", value: input.caseExternalId }]) +
      emailNoticeBox(
        "Confirme o encaminhamento por abandono ou retome a investigação conforme a política da organização.",
        "warning",
      ),
    ctaLabel: "Revisar abandono",
    tag: "committee-abandonment-pending",
  });
}

export async function sendCommitteeParticipantFollowupExhaustedNotification(
  input: CommitteeCaseMailInput & { exhaustedCount: number },
) {
  return sendCommitteeCaseMail({
    recipients: input.to,
    tenantName: input.tenantName,
    caseExternalId: input.caseExternalId,
    subject: `[${input.tenantName}] Participante sem resposta — ${input.caseExternalId}`,
    preheader: `${input.exhaustedCount} participante(s) sem resposta após lembretes no caso ${input.caseExternalId}.`,
    eyebrow: "Participante externo",
    title: "Follow-up de participante esgotado",
    bodyHtml:
      emailParagraph(
        `Um ou mais participantes externos não responderam após o limite de lembretes automáticos (${input.exhaustedCount} neste ciclo).`,
      ) +
      emailMetaTable([
        { label: "Caso", value: input.caseExternalId },
        { label: "Sem resposta", value: String(input.exhaustedCount) },
      ]) +
      emailNoticeBox(
        "Avalie se o caso deve seguir com os dados disponíveis ou se há outro canal de contato.",
        "warning",
      ),
    ctaLabel: "Abrir caso",
    tag: "committee-participant-exhausted",
  });
}

export async function sendCommitteeSlaAlertNotification(
  input: CommitteeCaseMailInput & {
    alertType: "overdue" | "due_today";
    dueLabel: string;
  },
) {
  const isOverdue = input.alertType === "overdue";
  return sendCommitteeCaseMail({
    recipients: input.to,
    tenantName: input.tenantName,
    caseExternalId: input.caseExternalId,
    subject: isOverdue
      ? `[${input.tenantName}] SLA estourado — ${input.caseExternalId}`
      : `[${input.tenantName}] SLA vence hoje — ${input.caseExternalId}`,
    preheader: isOverdue
      ? `Prazo SLA ultrapassado no caso ${input.caseExternalId}.`
      : `Prazo SLA vence hoje no caso ${input.caseExternalId}.`,
    eyebrow: "Alerta de SLA",
    title: isOverdue ? "SLA ultrapassado" : "SLA vence hoje",
    bodyHtml:
      emailParagraph(
        isOverdue
          ? "Um prazo operacional do caso foi ultrapassado e requer atenção do conselho."
          : "Um prazo operacional do caso vence ainda hoje.",
      ) +
      emailMetaTable([
        { label: "Caso", value: input.caseExternalId },
        { label: "Prazo", value: input.dueLabel },
        ...(input.category ? [{ label: "Categoria", value: input.category }] : []),
      ]) +
      emailNoticeBox("Toda ação no painel é auditada.", isOverdue ? "critical" : "warning"),
    ctaLabel: "Ver caso",
    tag: isOverdue ? "committee-sla-overdue" : "committee-sla-due-today",
  });
}

export async function sendCommitteeCaseReturnedNotification(input: CommitteeCaseMailInput) {
  return sendCommitteeCaseMail({
    recipients: input.to,
    tenantName: input.tenantName,
    caseExternalId: input.caseExternalId,
    subject: `[${input.tenantName}] Caso devolvido à investigação — ${input.caseExternalId}`,
    preheader: `O caso ${input.caseExternalId} retornou para investigação após voto do comitê.`,
    eyebrow: "Deliberação do conselho",
    title: "Caso retornou à investigação",
    bodyHtml:
      emailParagraph(
        "O comitê registrou rejeição da pre-conclusão. O caso voltou para investigação e pode exigir novas diligências.",
      ) +
      emailMetaTable([{ label: "Caso", value: input.caseExternalId }]),
    ctaLabel: "Continuar investigação",
    tag: "committee-case-returned",
  });
}

export async function sendWhistleblowerPreConclusionNotification(input: CaseMailBase) {
  const trackingUrl = `${appBaseUrl()}/acompanhar`;
  const subject = `[${input.tenantName}] Caso em pre-conclusão — ${input.caseExternalId}`;
  const html = renderEmailLayout({
    preheader: `O caso ${input.caseExternalId} entrou em fase de pre-conclusão.`,
    eyebrow: "Atualização do caso",
    title: "Seu caso entrou em pre-conclusão",
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        "A investigação concluiu a etapa de diálogo e o caso segue para síntese e deliberação do conselho, com proteção de sigilo.",
      ) +
      emailMetaTable([{ label: "Caso", value: input.caseExternalId }]) +
      emailNoticeBox("Consulte o portal para ver o andamento. O resultado final será comunicado quando o caso for encerrado."),
    cta: {
      label: "Consultar andamento",
      href: trackingUrl,
    },
  });

  return sendMail({
    to: [input.to],
    subject,
    html,
    text: `Caso ${input.caseExternalId} em pre-conclusão. Acompanhe em ${trackingUrl}`,
    tags: ["whistleblower-pre-conclusion", input.caseExternalId],
  });
}

export async function sendWhistleblowerCaseResolvedNotification(input: CaseMailBase) {
  const trackingUrl = `${appBaseUrl()}/acompanhar`;
  const subject = `[${input.tenantName}] Caso encerrado — ${input.caseExternalId}`;
  const html = renderEmailLayout({
    preheader: `O caso ${input.caseExternalId} foi encerrado pelo conselho.`,
    eyebrow: "Resumo final",
    title: "Caso encerrado",
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        "O conselho concluiu a deliberação deste caso. O encerramento foi registrado com trilha de auditoria imutável.",
      ) +
      emailMetaTable([{ label: "Caso", value: input.caseExternalId }]) +
      emailNoticeBox(
        "O detalhamento completo está disponível no portal de acompanhamento com seu token. Por sigilo, este e-mail não inclui o conteúdo da decisão.",
      ),
    cta: {
      label: "Ver resumo no portal",
      href: trackingUrl,
    },
  });

  return sendMail({
    to: [input.to],
    subject,
    html,
    text: `Caso ${input.caseExternalId} encerrado. Consulte o resumo em ${trackingUrl}`,
    tags: ["whistleblower-resolved", input.caseExternalId],
  });
}

export async function sendWhistleblowerReportConfirmationNotification(
  input: WhistleblowerTrackingMailInput,
) {
  const trackingUrl = `${appBaseUrl()}/acompanhar`;
  const subject = `[${input.tenantName}] Denúncia registrada — ${input.caseExternalId}`;
  const html = renderEmailLayout({
    preheader: `Sua denúncia ${input.caseExternalId} foi recebida com sucesso.`,
    eyebrow: "Confirmação de registro",
    title: "Denúncia recebida com segurança",
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        "Sua denúncia foi registrada com trilha de auditoria imutável e tratamento sigiloso. Guarde o token abaixo — ele é a única forma de acompanhar o andamento sem expor sua identidade.",
      ) +
      emailMetaTable([
        { label: "Caso", value: input.caseExternalId },
        { label: "Token", value: input.trackingToken ?? "—" },
        { label: "Portal", value: "Acompanhamento anônimo" },
      ]) +
      emailNoticeBox(
        "Não compartilhe este token. Ele não identifica você perante a organização, mas permite consultar atualizações do caso.",
      ),
    cta: {
      label: "Abrir portal de acompanhamento",
      href: trackingUrl,
    },
    footerNote:
      "Mensagem automática do JobComplaint. Se você não registrou esta denúncia, ignore este e-mail.",
  });

  return sendMail({
    to: [input.to],
    subject,
    html,
    text: `Denúncia ${input.caseExternalId} registrada. Token: ${input.trackingToken ?? ""}. Acompanhe em ${trackingUrl}`,
    tags: ["whistleblower-confirmation", input.caseExternalId],
  });
}

export async function sendWhistleblowerNewQuestionNotification(input: WhistleblowerTrackingMailInput) {
  const trackingUrl = `${appBaseUrl()}/acompanhar`;
  const preview = input.questionPreview ? truncatePreview(input.questionPreview) : null;
  const subject = `[${input.tenantName}] Nova pergunta no caso ${input.caseExternalId}`;
  const html = renderEmailLayout({
    preheader: `Há uma nova pergunta no caso ${input.caseExternalId}. Responda pelo portal com seu token.`,
    eyebrow: "Atualização do caso",
    title: "Nova pergunta da investigação",
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        "O Agente de Investigação precisa de mais informações para avançar com cautela. Acesse o portal com seu token e responda quando se sentir seguro(a).",
      ) +
      emailMetaTable([
        { label: "Caso", value: input.caseExternalId },
        ...(preview ? [{ label: "Pergunta", value: preview }] : []),
      ]) +
      emailNoticeBox(
        "O conteúdo completo da pergunta está disponível apenas no portal seguro. Não encaminhe este e-mail.",
      ),
    cta: {
      label: "Responder no portal",
      href: trackingUrl,
    },
  });

  return sendMail({
    to: [input.to],
    subject,
    html,
    text: `Nova pergunta no caso ${input.caseExternalId}. Acesse ${trackingUrl} com seu token.`,
    tags: ["whistleblower-question", input.caseExternalId],
  });
}

export async function sendWhistleblowerEngagementReminderNotification(
  input: WhistleblowerTrackingMailInput & { hasPendingQuestion: boolean },
) {
  const trackingUrl = `${appBaseUrl()}/acompanhar`;
  const subject = input.hasPendingQuestion
    ? `[${input.tenantName}] Lembrete: resposta pendente — ${input.caseExternalId}`
    : `[${input.tenantName}] Seu caso segue em análise — ${input.caseExternalId}`;
  const html = renderEmailLayout({
    preheader: input.hasPendingQuestion
      ? `Há uma resposta pendente no caso ${input.caseExternalId}.`
      : `O caso ${input.caseExternalId} continua em análise.`,
    eyebrow: "Lembrete de acompanhamento",
    title: input.hasPendingQuestion ? "Resposta pendente no seu caso" : "Seu caso segue em análise",
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        input.hasPendingQuestion
          ? "Identificamos uma pergunta aguardando sua resposta. Quando puder, acesse o portal com seu token para que a investigação possa avançar."
          : "Seu caso continua em análise pelo Agente de Investigação. Você receberá novas atualizações conforme o andamento.",
      ) +
      emailMetaTable([{ label: "Caso", value: input.caseExternalId }]),
    cta: {
      label: "Acessar portal de acompanhamento",
      href: trackingUrl,
    },
  });

  return sendMail({
    to: [input.to],
    subject,
    html,
    text: `Acompanhe o caso ${input.caseExternalId} em ${trackingUrl}`,
    tags: ["whistleblower-reminder", input.caseExternalId],
  });
}

export async function sendWhistleblowerAbandonmentNotification(input: CaseMailBase) {
  const trackingUrl = `${appBaseUrl()}/acompanhar`;
  const subject = `[${input.tenantName}] Caso encaminhado para pre-conclusão — ${input.caseExternalId}`;
  const html = renderEmailLayout({
    preheader: `O caso ${input.caseExternalId} seguirá para pre-conclusão com os dados disponíveis.`,
    eyebrow: "Atualização do caso",
    title: "Caso encaminhado para pre-conclusão",
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        "Não recebemos novas respostas dentro da janela planejada de acompanhamento. O caso seguirá para pre-conclusão com as informações já registradas.",
      ) +
      emailMetaTable([{ label: "Caso", value: input.caseExternalId }]) +
      emailNoticeBox(
        "Você ainda pode consultar o histórico no portal. O conselho analisará o caso conforme a política da organização.",
        "warning",
      ),
    cta: {
      label: "Consultar andamento",
      href: trackingUrl,
    },
  });

  return sendMail({
    to: [input.to],
    subject,
    html,
    text: `Caso ${input.caseExternalId} encaminhado para pre-conclusão. Consulte em ${trackingUrl}`,
    tags: ["whistleblower-abandonment", input.caseExternalId],
  });
}

export async function sendParticipantFollowupReminderNotification(input: ParticipantMailInput) {
  const inviteUrl = `${appBaseUrl()}/convite/${input.inviteToken}`;
  const attemptLabel =
    input.attempt && input.attempt > 1 ? ` (lembrete ${input.attempt})` : "";
  const subject = `[${input.tenantName}] Lembrete: convite pendente — ${input.caseExternalId}`;
  const html = renderEmailLayout({
    preheader: `Lembrete para colaborar no caso ${input.caseExternalId}.`,
    eyebrow: "Lembrete de convite",
    title: "Ainda aguardamos sua colaboração",
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        `Este é um lembrete${attemptLabel} para que você possa contribuir com informações em um caso corporativo tratado com sigilo.`,
      ) +
      emailMetaTable([
        { label: "Caso", value: input.caseExternalId },
        { label: "Status", value: "Convite pendente" },
      ]) +
      emailNoticeBox(
        "O link abaixo é exclusivo para você. Se já respondeu, ignore este lembrete.",
        "warning",
      ),
    cta: {
      label: "Abrir convite seguro",
      href: inviteUrl,
    },
  });

  const result = await sendMail({
    to: [input.to],
    subject,
    html,
    text: `Lembrete de convite para o caso ${input.caseExternalId}: ${inviteUrl}`,
    tags: ["participant-followup", input.caseExternalId],
  });

  return {
    provider: result.provider,
    delivered: result.delivered,
    inviteUrl,
    blocked: result.blocked,
  };
}

export async function sendParticipantInviteAcceptedNotification(input: ParticipantMailInput) {
  const inviteUrl = `${appBaseUrl()}/convite/${input.inviteToken}`;
  const subject = `[${input.tenantName}] Convite aceito — ${input.caseExternalId}`;
  const html = renderEmailLayout({
    preheader: `Convite aceito no caso ${input.caseExternalId}. Responda ao questionário quando puder.`,
    eyebrow: "Participante externo",
    title: "Convite aceito com sucesso",
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        "Registramos a aceitação do seu convite. Agora você pode responder ao questionário de forma segura e individual.",
      ) +
      emailMetaTable([{ label: "Caso", value: input.caseExternalId }]) +
      emailNoticeBox("Suas respostas são tratadas com sigilo e trilha de auditoria."),
    cta: {
      label: "Responder questionário",
      href: inviteUrl,
    },
  });

  return sendMail({
    to: [input.to],
    subject,
    html,
    text: `Convite aceito no caso ${input.caseExternalId}. Continue em ${inviteUrl}`,
    tags: ["participant-accepted", input.caseExternalId],
  });
}

export async function sendParticipantResponseReceivedNotification(input: CaseMailBase) {
  const subject = `[${input.tenantName}] Resposta registrada — ${input.caseExternalId}`;
  const html = renderEmailLayout({
    preheader: `Sua resposta no caso ${input.caseExternalId} foi registrada.`,
    eyebrow: "Participante externo",
    title: "Resposta recebida com sucesso",
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        "Sua contribuição foi registrada no processo de investigação. Agradecemos pela colaboração.",
      ) +
      emailMetaTable([{ label: "Caso", value: input.caseExternalId }]) +
      emailNoticeBox(
        "Se houver perguntas adicionais, você receberá novo convite ou lembrete por este canal.",
      ),
  });

  return sendMail({
    to: [input.to],
    subject,
    html,
    text: `Resposta registrada no caso ${input.caseExternalId}.`,
    tags: ["participant-response", input.caseExternalId],
  });
}

export async function sendInviteNotification(input: InviteMailInput) {
  const inviteUrl = `${appBaseUrl()}/convite/${input.inviteToken}`;
  const subject = `[${input.tenantName}] Convite para colaborar no caso ${input.caseExternalId}`;
  const html = renderEmailLayout({
    preheader: `Convite seguro para colaborar no caso ${input.caseExternalId}.`,
    eyebrow: "Convite de participante",
    title: "Você foi convidado(a) a colaborar",
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        "Você recebeu um convite individual para fornecer informações em um caso corporativo tratado com sigilo e trilha de auditoria.",
      ) +
      emailMetaTable([
        { label: "Caso", value: input.caseExternalId },
        { label: "Acesso", value: "Link único e pessoal" },
      ]) +
      emailNoticeBox(
        "Este link é exclusivo para você. Não encaminhe o e-mail. O acesso expira conforme a política de convites da organização.",
      ),
    cta: {
      label: "Abrir convite seguro",
      href: inviteUrl,
    },
    footerNote:
      "Mensagem automática do JobComplaint. Se você não esperava este convite, ignore este e-mail.",
  });

  const result = await sendMail({
    to: [input.to],
    subject,
    html,
    text: `Convite para o caso ${input.caseExternalId}: ${inviteUrl}`,
    tags: ["invite", input.caseExternalId],
  });

  return {
    provider: result.provider,
    delivered: result.delivered,
    inviteUrl,
    blocked: result.blocked,
  };
}

export async function sendCriticalCaseNotification(input: CriticalCaseNotificationInput) {
  const recipients = uniqueNormalizedEmails(input.to);
  if (recipients.length === 0) return { provider: "noop" as const, delivered: false };

  const dashboardUrl = `${appBaseUrl()}/dashboard/casos`;
  const subject = `[${input.tenantName}] Caso crítico ${input.caseExternalId}`;
  const html = renderEmailLayout({
    preheader: `Caso ${input.caseExternalId} classificado como crítico — ação imediata do conselho.`,
    eyebrow: "Alerta operacional",
    title: "Caso crítico para ação imediata",
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        "Um novo caso foi classificado como <strong>crítico</strong> e requer atenção prioritária do conselho.",
      ) +
      emailMetaTable([
        { label: "Caso", value: input.caseExternalId },
        { label: "Categoria", value: input.category },
        { label: "Risco", value: input.risk },
        { label: "Motivo", value: input.reason },
      ]) +
      emailNoticeBox(
        "Acesse o painel para revisar o caso e registrar as providências. Toda ação é auditada.",
        "critical",
      ),
    cta: {
      label: "Abrir caixa de casos",
      href: dashboardUrl,
    },
  });

  const result = await sendMail({
    to: recipients,
    subject,
    html,
    tags: ["critical-case", input.caseExternalId],
  });

  return {
    provider: result.provider,
    delivered: result.delivered,
    blocked: result.blocked,
  };
}

export async function sendMemberWelcomeNotification(input: AccountMailInput) {
  const subject = `[${input.tenantName}] Sua conta no JobComplaint foi criada`;
  const html = renderEmailLayout({
    preheader: `Conta criada em ${input.tenantName}. Defina sua senha no primeiro acesso.`,
    eyebrow: "Conta profissional",
    title: `Olá, ${escapeHtml(input.memberName)}`,
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        "Sua conta profissional foi criada pela organização. Você poderá acessar casos, resultados e a trilha de atividades conforme seu perfil.",
      ) +
      emailMetaTable([
        { label: "Organização", value: input.tenantName },
        { label: "Código", value: input.tenantCode },
      ]) +
      emailNoticeBox(
        "Use a <strong>senha temporária</strong> fornecida pela conta corporativa. No primeiro acesso, você <strong>deve criar uma senha pessoal</strong> antes de usar o sistema. Por segurança, a senha temporária não é enviada por e-mail.",
        "warning",
      ),
    cta: {
      label: "Acessar JobComplaint",
      href: input.loginUrl,
    },
  });

  return sendMail({
    to: [input.to],
    subject,
    html,
    text: `Conta criada em ${input.tenantName}. Acesse ${input.loginUrl} e defina uma nova senha no primeiro login.`,
    tags: ["member-welcome", input.tenantCode],
  });
}

export async function sendMemberPasswordResetNotification(input: AccountMailInput) {
  const subject = `[${input.tenantName}] Redefinição de senha obrigatória`;
  const html = renderEmailLayout({
    preheader: "Sua senha foi redefinida. Crie uma senha pessoal no próximo acesso.",
    eyebrow: "Segurança da conta",
    title: "Redefinição de senha necessária",
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        `Olá, <strong>${escapeHtml(input.memberName)}</strong>. A conta corporativa redefiniu sua senha de acesso ao JobComplaint.`,
      ) +
      emailNoticeBox(
        "Use a <strong>nova senha temporária</strong> informada pela conta corporativa. Em seguida, defina uma <strong>senha pessoal</strong> — o sistema bloqueará outras ações até concluir essa etapa. A senha temporária não é enviada por e-mail.",
        "warning",
      ),
    cta: {
      label: "Fazer login e trocar senha",
      href: input.loginUrl,
    },
  });

  return sendMail({
    to: [input.to],
    subject,
    html,
    text: `Senha redefinida em ${input.tenantName}. Acesse ${input.loginUrl} e defina uma nova senha.`,
    tags: ["member-password-reset", input.tenantCode],
  });
}

export async function sendOnboardingWelcomeNotification(input: {
  to: string;
  tenantName: string;
  tenantCode: string;
  loginUrl: string;
}) {
  const subject = `[${input.tenantName}] Organização criada no JobComplaint`;
  const html = renderEmailLayout({
    preheader: `Organização ${input.tenantName} criada com sucesso no JobComplaint.`,
    eyebrow: "Onboarding concluído",
    title: "Sua organização está pronta",
    tenantName: input.tenantName,
    bodyHtml:
      emailParagraph(
        "O ambiente foi provisionado com isolamento por tenant, plano inicial automático e trilha de auditoria imutável.",
      ) +
      emailMetaTable([
        { label: "Organização", value: input.tenantName },
        { label: "Código", value: input.tenantCode },
      ]) +
      emailNoticeBox(
        "Guarde suas credenciais com segurança. Todos os acessos, alterações de senha e ações administrativas são registrados.",
      ),
    cta: {
      label: "Entrar no painel",
      href: input.loginUrl,
    },
  });

  return sendMail({
    to: [input.to],
    subject,
    html,
    text: `Organização ${input.tenantName} criada. Acesse ${input.loginUrl}`,
    tags: ["onboarding-welcome", input.tenantCode],
  });
}
