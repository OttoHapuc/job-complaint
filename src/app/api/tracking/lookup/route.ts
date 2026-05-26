import { NextRequest, NextResponse } from "next/server";
import { CaseStatus, PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashWhistleblowerToken } from "@/lib/security";
import { createImmutableAuditEvent } from "@/lib/audit";
import { applyRateLimit } from "@/lib/rate-limit";
import { buildRateLimitKey } from "@/lib/request";
import { SECURITY_CONFIG } from "@/lib/config";
import { decryptSensitiveText } from "@/lib/secure-data";
import { processCaseOutboxSafely } from "@/lib/intake/processor";
import {
  WHISTLEBLOWER_LABELS,
  whistleblowerMessageAuthorLabel,
} from "@/lib/whistleblower-labels";

type LookupBody = {
  token?: string;
};

function formatDate(value: Date) {
  return value.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type WhistleblowerStage =
  | "report_submitted"
  | "review"
  | "investigation"
  | "pre_conclusion"
  | "conclusion";

type InteractionStatus =
  | "ANALYZING"
  | "PROCESSING_YOUR_MESSAGE"
  | "AWAITING_YOUR_REPLY"
  | "AWAITING_PARTICIPANTS"
  | "SYNTHESIZING"
  | "PRE_CONCLUSION"
  | "CONCLUDED";

function buildWhistleblowerTimeline(params: {
  status: CaseStatus;
  pipelineStage: PipelineStage | null;
  createdAt: Date;
  updatedAt: Date;
  hasParticipantInvestigation: boolean;
}) {
  const stages: Array<{
    id: WhistleblowerStage;
    title: string;
    description: string;
    timestamp: string;
    status: "done" | "active" | "pending";
  }> = [
    {
      id: "report_submitted",
      title: WHISTLEBLOWER_LABELS.timeline.reportSubmitted.title,
      description: WHISTLEBLOWER_LABELS.timeline.reportSubmitted.description,
      timestamp: formatDate(params.createdAt),
      status: "done",
    },
    {
      id: "review",
      title: WHISTLEBLOWER_LABELS.timeline.review.title,
      description: WHISTLEBLOWER_LABELS.timeline.review.description,
      timestamp: "Em andamento",
      status: "pending",
    },
    {
      id: "investigation",
      title: WHISTLEBLOWER_LABELS.timeline.investigation.title,
      description: WHISTLEBLOWER_LABELS.timeline.investigation.description,
      timestamp: "Aguardando",
      status: "pending",
    },
    {
      id: "pre_conclusion",
      title: WHISTLEBLOWER_LABELS.timeline.preConclusion.title,
      description: WHISTLEBLOWER_LABELS.timeline.preConclusion.description,
      timestamp: "Aguardando",
      status: "pending",
    },
    {
      id: "conclusion",
      title: WHISTLEBLOWER_LABELS.timeline.conclusion.title,
      description: WHISTLEBLOWER_LABELS.timeline.conclusion.description,
      timestamp: "Aguardando",
      status: "pending",
    },
  ];

  const activeIndex = (() => {
    if (params.pipelineStage === "CONCLUDED" || params.status === "RESOLVED") return 4;
    if (params.pipelineStage === "PRE_CONCLUSION_READY" || params.status === "AWAITING_COMMITTEE_APPROVAL")
      return 3;
    if (
      params.pipelineStage === "CONTACTS_NOTIFIED" ||
      params.pipelineStage === "COMMUNICATION_INITIALIZED" ||
      params.pipelineStage === "REVIEW_IN_PROGRESS" ||
      params.hasParticipantInvestigation ||
      params.status === "WAITING_RESPONSE"
    )
      return 2;
    if (
      params.pipelineStage === "RECEIVED" ||
      params.pipelineStage === "STORED" ||
      params.pipelineStage === "TRIAGE_A_COMPLETED" ||
      params.pipelineStage === "TRIAGE_B_COMPLETED" ||
      params.pipelineStage === "EVALUATED" ||
      params.pipelineStage === "REVIEW_CONCLUDED" ||
      params.status === "IN_REVIEW" ||
      params.status === "ESCALATED"
    )
      return 1;
    return 1;
  })();

  return stages.map((stage, index) => {
    if (index < activeIndex) {
      return {
        ...stage,
        status: "done" as const,
        timestamp: index === 0 ? stage.timestamp : "Concluída",
      };
    }
    if (index === activeIndex) {
      return {
        ...stage,
        status: "active" as const,
        timestamp: formatDate(params.updatedAt),
      };
    }
    return stage;
  });
}

export async function POST(request: NextRequest) {
  const rateLimit = applyRateLimit(
    buildRateLimitKey("tracking-lookup", request),
    SECURITY_CONFIG.rateLimitMaxTokenLookups,
    SECURITY_CONFIG.rateLimitWindowMs,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas consultas de token em curto intervalo. Aguarde alguns instantes." },
      { status: 429 },
    );
  }

  let body: LookupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const token = body.token?.trim().toUpperCase();
  if (!token) {
    return NextResponse.json({ error: "Token obrigatório." }, { status: 400 });
  }

  const tokenHash = hashWhistleblowerToken(token);
  const storedToken = await prisma.whistleblowerAccessToken.findUnique({
    where: { tokenHash },
    include: {
      case: {
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 50,
          },
          auditEvents: {
            orderBy: { createdAt: "asc" },
            take: 20,
            select: {
              action: true,
            },
          },
        },
      },
    },
  });

  if (!storedToken) {
    return NextResponse.json({ error: "Token inválido." }, { status: 404 });
  }

  await processCaseOutboxSafely({
    tenantId: storedToken.tenantId,
    caseId: storedToken.caseId,
  });

  await prisma.$transaction(async (tx) => {
    await tx.whistleblowerAccessToken.update({
      where: { id: storedToken.id },
      data: { lastAccessAt: new Date() },
    });

    await createImmutableAuditEvent(tx, {
      tenantId: storedToken.tenantId,
      caseId: storedToken.caseId,
      action: "WHISTLEBLOWER_PORTAL_ACCESSED",
      payload: {
        tokenId: storedToken.id,
      },
    });
  });

  const reportCase = await prisma.case.findUnique({
    where: { id: storedToken.caseId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 50,
      },
      auditEvents: {
        orderBy: { createdAt: "asc" },
        take: 20,
        select: { action: true },
      },
      pipelineState: {
        select: {
          currentStage: true,
          pendingQuestion: true,
          whistleblowerStatus: true,
          nextContactAt: true,
          processingSince: true,
        },
      },
    },
  });
  if (!reportCase) {
    return NextResponse.json({ error: "Caso não encontrado para o token." }, { status: 404 });
  }
  const hasParticipantInvestigation = reportCase.auditEvents.some(
    (event) =>
      event.action === "CASE_PARTICIPANT_INVITED" ||
      event.action === "CASE_PARTICIPANT_RESPONSE_SUBMITTED",
  );
  const timeline = buildWhistleblowerTimeline({
    status: reportCase.status,
    pipelineStage: reportCase.pipelineState?.currentStage ?? null,
    createdAt: reportCase.createdAt,
    updatedAt: reportCase.updatedAt,
    hasParticipantInvestigation,
  }).map((item, index) => ({
    id: index + 1,
    title: item.title,
    description: item.description,
    timestamp: item.timestamp,
    stageStatus: item.status,
  }));

  const messages = reportCase.messages.map((message) => ({
    id: message.id,
    role:
      message.authorType === "WHISTLEBLOWER"
        ? "whistleblower"
        : message.authorType === "SYSTEM"
          ? "investigation_agent"
          : "council",
    authorLabel: whistleblowerMessageAuthorLabel({
      authorType: message.authorType,
    }),
    content: decryptSensitiveText(message.content),
    timestamp: formatDate(message.createdAt),
  }));

  const [activeProcessing, nextPlannedContact] = await Promise.all([
    prisma.outboxMessage.findFirst({
      where: {
        tenantId: storedToken.tenantId,
        caseId: reportCase.id,
        status: "PROCESSING",
      },
      orderBy: { updatedAt: "desc" },
      select: {
        updatedAt: true,
      },
    }),
    prisma.outboxMessage.findFirst({
      where: {
        tenantId: storedToken.tenantId,
        caseId: reportCase.id,
        status: { in: ["PENDING", "FAILED"] },
        availableAt: { gt: new Date() },
      },
      orderBy: { availableAt: "asc" },
      select: {
        availableAt: true,
      },
    }),
  ]);

  const interactionStatus: InteractionStatus = (() => {
    const explicitStatus = reportCase.pipelineState?.whistleblowerStatus;
    if (explicitStatus) return explicitStatus as InteractionStatus;
    if (reportCase.status === "RESOLVED") return "CONCLUDED";
    if (reportCase.status === "AWAITING_COMMITTEE_APPROVAL") return "PRE_CONCLUSION";
    if (activeProcessing) return "PROCESSING_YOUR_MESSAGE";
    if (reportCase.pipelineState?.currentStage === "PRE_CONCLUSION_READY") return "SYNTHESIZING";
    if (reportCase.status === "WAITING_RESPONSE") return "AWAITING_YOUR_REPLY";
    if (hasParticipantInvestigation) return "AWAITING_PARTICIPANTS";
    return "ANALYZING";
  })();

  const interactionStatusLabel: Record<InteractionStatus, string> = {
    ANALYZING: "Agente de Investigação analisando contexto e evidências.",
    PROCESSING_YOUR_MESSAGE: "Agente de Investigação elaborando resposta.",
    AWAITING_YOUR_REPLY: "Aguardando sua resposta para continuidade da análise.",
    AWAITING_PARTICIPANTS: "Aguardando respostas de pessoas vinculadas na investigação.",
    SYNTHESIZING: "Consolidando análise para pre-conclusão.",
    PRE_CONCLUSION: "Caso em pre-conclusão com o conselho.",
    CONCLUDED: "Caso concluído.",
  };

  return NextResponse.json({
    ok: true,
    case: {
      id: reportCase.externalId,
      status: reportCase.status,
      updatedAt: reportCase.updatedAt.toISOString(),
    },
    timeline,
    messages,
    canReply:
      interactionStatus === "AWAITING_YOUR_REPLY" &&
      reportCase.status === "WAITING_RESPONSE",
    pendingQuestion: reportCase.pipelineState?.pendingQuestion ?? null,
    interactionStatus,
    interactionStatusLabel: interactionStatusLabel[interactionStatus],
    processingSince:
      reportCase.pipelineState?.processingSince?.toISOString() ??
      activeProcessing?.updatedAt?.toISOString() ??
      null,
    nextContactAt:
      reportCase.pipelineState?.nextContactAt?.toISOString() ??
      nextPlannedContact?.availableAt?.toISOString() ??
      null,
  });
}
