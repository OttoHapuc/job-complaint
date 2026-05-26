import { PipelineAction, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateCaseExternalId,
  generateWhistleblowerToken,
  hashWhistleblowerToken,
} from "@/lib/security";
import { getTenantByCode } from "@/lib/tenancy";
import { createImmutableAuditEvent } from "@/lib/audit";
import { applyRateLimit } from "@/lib/rate-limit";
import { buildRateLimitKey } from "@/lib/request";
import { SECURITY_CONFIG } from "@/lib/config";
import { encryptSensitiveText } from "@/lib/secure-data";
import { enqueueOutboxAction } from "@/lib/intake/outbox";

type ConversationMessage = {
  role: "user" | "ai";
  content: string;
};

type ReportBody = {
  narrative?: string;
  conversation?: ConversationMessage[];
  attachments?: Array<
    | string
    | {
        fileName?: string;
        mimeType?: string;
        sizeBytes?: number;
        base64Data?: string;
        textPreview?: string;
      }
  >;
  tenantCode?: string;
  blockedMemberIds?: string[];
  witnessEmails?: string[];
  corroborators?: Array<{
    name?: string;
    contact?: string;
  }>;
  whistleblowerContact?: string;
  whistleblowerCategoryOpinion?: string;
  acceptedTerms?: boolean;
  acceptedPrivacy?: boolean;
};

async function buildUniqueExternalId() {
  for (let i = 0; i < 10; i += 1) {
    const externalId = generateCaseExternalId();
    const exists = await prisma.case.findUnique({ where: { externalId } });
    if (!exists) {
      return externalId;
    }
  }

  return `${generateCaseExternalId()}-${Date.now().toString().slice(-4)}`;
}

function normalizeAttachmentInputs(attachments: ReportBody["attachments"]) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((attachment, index) => {
      if (typeof attachment === "string") {
        return {
          fileName: attachment.trim() || `arquivo-${index + 1}`,
          mimeType: "application/octet-stream",
          sizeBytes: 0,
          base64Data: "",
          textPreview: "",
        };
      }
      return {
        fileName: attachment.fileName?.trim() || `arquivo-${index + 1}`,
        mimeType: attachment.mimeType?.trim() || "application/octet-stream",
        sizeBytes: Math.max(0, Math.floor(attachment.sizeBytes ?? 0)),
        base64Data: attachment.base64Data?.trim() || "",
        textPreview: attachment.textPreview?.trim() || "",
      };
    })
    .filter((attachment) => Boolean(attachment.fileName));
}

function isGenericNarrative(text: string) {
  const normalized = text.trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  return normalized.length < 80 || words.length < 14;
}

export async function POST(request: NextRequest) {
  const rateLimit = applyRateLimit(
    buildRateLimitKey("reports-submit", request),
    SECURITY_CONFIG.rateLimitMaxPublicReports,
    SECURITY_CONFIG.rateLimitWindowMs,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Limite temporário de denúncias atingido. Tente novamente em alguns minutos." },
      { status: 429 },
    );
  }

  let body: ReportBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const conversation = Array.isArray(body.conversation) ? body.conversation : [];
  const normalizedNarrative =
    body.narrative?.trim() || conversation.filter((m) => m.role === "user").map((m) => m.content).join("\n\n").trim();
  const attachments = normalizeAttachmentInputs(body.attachments);
  const tenantCode = body.tenantCode?.trim().toLowerCase();
  const acceptedTerms = body.acceptedTerms === true;
  const acceptedPrivacy = body.acceptedPrivacy === true;

  if (!normalizedNarrative) {
    return NextResponse.json({ error: "O relato da denúncia é obrigatório." }, { status: 400 });
  }
  if (isGenericNarrative(normalizedNarrative)) {
    return NextResponse.json(
      {
        error:
          "O relato está muito genérico. Descreva contexto, frequência e impacto com mais detalhes para análise segura.",
      },
      { status: 400 },
    );
  }
  if (!acceptedTerms || !acceptedPrivacy) {
    return NextResponse.json(
      { error: "É obrigatório aceitar os Termos de Uso e a Política de Privacidade." },
      { status: 400 },
    );
  }

  if (!tenantCode) {
    return NextResponse.json(
      { error: "Informe o código da empresa para vincular a denúncia corretamente." },
      { status: 400 },
    );
  }

  const tenant = await getTenantByCode(tenantCode);
  if (!tenant) {
    return NextResponse.json(
      { error: "Empresa não encontrada. Verifique o código informado." },
      { status: 404 },
    );
  }

  const caseExternalId = await buildUniqueExternalId();
  const token = generateWhistleblowerToken();
  const tokenHash = hashWhistleblowerToken(token);
  const title = `Denúncia recebida - ${caseExternalId}`;
  const now = Date.now();
  const firstResponseDueAt = new Date(now + SECURITY_CONFIG.slaFirstResponseHours * 60 * 60 * 1000);
  const resolutionDueAt = new Date(now + 45 * 24 * 60 * 60 * 1000);
  const intakePayload = {
    narrative: normalizedNarrative,
    conversation,
    attachments,
    blockedMemberIds: Array.isArray(body.blockedMemberIds)
      ? body.blockedMemberIds.map((id) => id.trim()).filter(Boolean)
      : [],
    witnessEmails: Array.isArray(body.witnessEmails)
      ? body.witnessEmails.map((email) => email.trim()).filter(Boolean)
      : [],
    corroborators: Array.isArray(body.corroborators)
      ? body.corroborators.map((item) => ({
          name: item.name?.trim() || "",
          contact: item.contact?.trim() || "",
        }))
      : [],
    whistleblowerContact: body.whistleblowerContact?.trim() || "",
    whistleblowerCategoryOpinion: body.whistleblowerCategoryOpinion?.trim() || "",
  };

  await prisma.$transaction(async (tx) => {
    const reportCase = await tx.case.create({
      data: {
        tenantId: tenant.id,
        externalId: caseExternalId,
        title,
        description: encryptSensitiveText(normalizedNarrative),
        category: "Em processamento",
        risk: "MEDIUM",
        restrictedUserIds: [],
        firstResponseDueAt,
        resolutionDueAt,
        status: "IN_REVIEW",
        escalatedToUserId: null,
        triageSummary: Prisma.JsonNull,
        investigationSummary: Prisma.JsonNull,
      },
    });

    await tx.whistleblowerAccessToken.create({
      data: {
        tenantId: tenant.id,
        caseId: reportCase.id,
        tokenHash,
      },
    });

    await tx.caseMessage.create({
      data: {
        tenantId: tenant.id,
        caseId: reportCase.id,
        authorType: "WHISTLEBLOWER",
        content: encryptSensitiveText(normalizedNarrative),
      },
    });

    const rawReport = await tx.rawReport.create({
      data: {
        tenantId: tenant.id,
        caseId: reportCase.id,
        narrativeEncrypted: encryptSensitiveText(normalizedNarrative),
        conversationEncrypted: encryptSensitiveText(JSON.stringify(conversation)),
        attachmentsPayload: attachments as unknown as Prisma.InputJsonValue,
        intakePayload: intakePayload as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.casePipelineState.create({
      data: {
        tenantId: tenant.id,
        caseId: reportCase.id,
      },
    });

    await enqueueOutboxAction(tx, {
      tenantId: tenant.id,
      caseId: reportCase.id,
      rawReportId: rawReport.id,
      action: PipelineAction.STORE_RAW_REPORT,
      payload: {},
      idempotencyKey: `${reportCase.id}:store-raw`,
    });

    await createImmutableAuditEvent(tx, {
      tenantId: tenant.id,
      caseId: reportCase.id,
      action: "REPORT_SUBMITTED",
      metadata: {
        category: "Em processamento",
        via: "web-chat",
        conversationMessages: conversation.length,
        acceptedTerms,
        acceptedPrivacy,
        blockedMemberIds: intakePayload.blockedMemberIds,
        witnessInvites: intakePayload.witnessEmails.length,
        corroboratorsDeclared: intakePayload.corroborators.length,
        whistleblowerContactProvided: Boolean(intakePayload.whistleblowerContact),
        pipelineMode: "outbox",
      },
      payload: {
        category: "Em processamento",
        narrativeLength: normalizedNarrative.length,
        attachmentsCount: attachments.length,
        pipelineStage: "RECEIVED",
      },
    });
  });

  return NextResponse.json({
    ok: true,
    token,
    caseId: caseExternalId,
    pipeline: {
      mode: "outbox",
      status: "RECEIVED",
      message: "Denúncia recebida e encaminhada para processamento seguro em esteira.",
    },
  });
}
