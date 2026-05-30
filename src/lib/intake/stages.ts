import {
  EngagementStepStatus,
  EngagementStepType,
  PipelineAction,
  PipelineStage,
  Prisma,
  RiskLevel,
  WhistleblowerInteractionStatus,
} from "@prisma/client";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { createImmutableAuditEvent } from "@/lib/audit";
import { runAiPromptInjectionGuard } from "@/lib/ai-guard";
import { runAiTriage } from "@/lib/ai-triage";
import { runInvestigationOrchestrator } from "@/lib/investigation/orchestrator";
import {
  runInvestigationReviewIteration,
  runPreConclusionSynthesis,
} from "@/lib/investigation/review-iteration";
import { sendCriticalCaseNotification, sendInviteNotification } from "@/lib/notifications";
import { decryptSensitiveText, encryptSensitiveText, hashSensitiveValue } from "@/lib/secure-data";
import { generateInviteToken, hashInviteToken } from "@/lib/security";
import { SECURITY_CONFIG } from "@/lib/config";
import { enqueueOutboxAction } from "@/lib/intake/outbox";

type RawIntakePayload = {
  narrative?: string;
  conversation?: Array<{ role: "user" | "ai"; content: string }>;
  attachments?: Array<{
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    base64Data?: string;
    textPreview?: string;
  }>;
  blockedMemberIds?: string[];
  witnessEmails?: string[];
  corroborators?: Array<{ name?: string; contact?: string }>;
  whistleblowerContact?: string;
  whistleblowerCategoryOpinion?: string;
};

type Context = {
  outboxId: string;
  tenantId: string;
  caseId: string;
  rawReportId: string | null;
  payload: Record<string, unknown>;
};

function requireRawReportId(context: Context) {
  if (!context.rawReportId) {
    throw new Error("Ação exige rawReportId válido.");
  }
  return context.rawReportId;
}

function parseRawPayload(value: Prisma.JsonValue | null): RawIntakePayload {
  if (!value || typeof value !== "object") return {};
  return value as unknown as RawIntakePayload;
}

function getNarrative(rawReport: { narrativeEncrypted: string }) {
  return decryptSensitiveText(rawReport.narrativeEncrypted);
}

function getSanitizedAttachmentList(payload: RawIntakePayload) {
  return Array.isArray(payload.attachments)
    ? payload.attachments.map((attachment, index) => ({
        fileName: attachment.fileName?.trim() || `arquivo-${index + 1}`,
        mimeType: attachment.mimeType?.trim() || "application/octet-stream",
        sizeBytes: Math.max(0, Math.floor(attachment.sizeBytes ?? 0)),
        textPreview: attachment.textPreview?.trim() || "",
      }))
    : [];
}

function toEmailSet(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
    ),
  );
}

function buildParticipantQuestionnaire(params: {
  category: string;
  risk: RiskLevel;
  personName?: string;
}) {
  const target = params.personName?.trim() || "a pessoa envolvida";
  const riskPrompt =
    params.risk === "CRITICAL"
      ? "Existe risco imediato à integridade física, psicológica, financeira ou jurídica?"
      : "Há indícios de continuidade do problema nas próximas semanas?";
  return [
    `Você confirma os fatos observados em relação a ${target}? Descreva com contexto objetivo.`,
    `Quais datas aproximadas, locais ou situações ajudam a comprovar seu relato sobre ${params.category}?`,
    "Há documentos, mensagens ou evidências que possam ser apresentados sem expor dados desnecessários?",
    riskPrompt,
  ];
}

function inferAutoBlockedMemberIds(params: {
  members: Array<{ id: string; name: string }>;
  hints: string[];
  narrative: string;
}) {
  const normalizedHints = params.hints.map((hint) => hint.toLowerCase());
  const normalizedNarrative = params.narrative.toLowerCase();
  return params.members
    .filter((member) => {
      const name = member.name.toLowerCase();
      return (
        normalizedHints.some((hint) => hint.includes(name) || name.includes(hint)) ||
        normalizedNarrative.includes(name)
      );
    })
    .map((member) => member.id);
}

function mergeBlockedIds(primary: string[], secondary: string[]) {
  return Array.from(new Set([...primary, ...secondary]));
}

function matchMentionToUserIds(params: {
  mentions: string[];
  users: Array<{ id: string; name: string }>;
}) {
  const mentionSet = params.mentions.map((item) => item.toLowerCase());
  return params.users
    .filter((user) =>
      mentionSet.some(
        (mention) =>
          mention.includes(user.name.toLowerCase()) ||
          user.name.toLowerCase().includes(mention),
      ),
    )
    .map((user) => user.id);
}

async function ensureAdaptiveEngagementPlan(input: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  caseId: string;
}) {
  const existing = await input.tx.caseEngagementPlan.findFirst({
    where: {
      tenantId: input.tenantId,
      caseId: input.caseId,
      isActive: true,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const startedAt = new Date();
  const targetConclusionAt = new Date(
    startedAt.getTime() + 14 * 24 * 60 * 60 * 1000,
  );

  const plan = await input.tx.caseEngagementPlan.create({
    data: {
      tenantId: input.tenantId,
      caseId: input.caseId,
      startedAt,
      targetConclusionAt,
      isActive: true,
      steps: {
        create: [
          {
            tenantId: input.tenantId,
            caseId: input.caseId,
            stepType: EngagementStepType.REVIEW_CYCLE,
            sequence: 1,
            scheduledAt: startedAt,
            status: EngagementStepStatus.SCHEDULED,
          },
          {
            tenantId: input.tenantId,
            caseId: input.caseId,
            stepType: EngagementStepType.REVIEW_CYCLE,
            sequence: 2,
            scheduledAt: new Date(startedAt.getTime() + 2 * 24 * 60 * 60 * 1000),
          },
          {
            tenantId: input.tenantId,
            caseId: input.caseId,
            stepType: EngagementStepType.PARTICIPANT_FOLLOWUP,
            sequence: 3,
            scheduledAt: new Date(startedAt.getTime() + 5 * 24 * 60 * 60 * 1000),
          },
          {
            tenantId: input.tenantId,
            caseId: input.caseId,
            stepType: EngagementStepType.REVIEW_CYCLE,
            sequence: 4,
            scheduledAt: new Date(startedAt.getTime() + 8 * 24 * 60 * 60 * 1000),
          },
          {
            tenantId: input.tenantId,
            caseId: input.caseId,
            stepType: EngagementStepType.PRE_CONCLUSION_CHECK,
            sequence: 5,
            scheduledAt: new Date(startedAt.getTime() + 12 * 24 * 60 * 60 * 1000),
          },
        ],
      },
    },
    select: {
      id: true,
    },
  });

  return plan.id;
}

async function scheduleNextEngagementTick(input: {
  tx: Prisma.TransactionClient;
  tenantId: string;
  caseId: string;
  rawReportId: string | null;
  baseDate: Date;
  reason: string;
}) {
  const nextDate = new Date(input.baseDate.getTime() + 24 * 60 * 60 * 1000);
  const plan = await input.tx.caseEngagementPlan.findFirst({
    where: {
      tenantId: input.tenantId,
      caseId: input.caseId,
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const step = plan
    ? await input.tx.caseEngagementStep.create({
        data: {
          tenantId: input.tenantId,
          caseId: input.caseId,
          engagementPlanId: plan.id,
          stepType: EngagementStepType.STATUS_UPDATE,
          status: EngagementStepStatus.SCHEDULED,
          sequence: Math.floor(Date.now() / 1000),
          scheduledAt: nextDate,
          payload: {
            reason: input.reason,
          } as Prisma.InputJsonValue,
        },
        select: { id: true },
      })
    : null;

  await enqueueOutboxAction(input.tx, {
    tenantId: input.tenantId,
    caseId: input.caseId,
    rawReportId: input.rawReportId,
    action: PipelineAction.ENGAGEMENT_TICK,
    payload: {
      reason: input.reason,
    },
    idempotencyKey: `${input.caseId}:engagement:${nextDate.toISOString()}`,
    availableAt: nextDate,
  });

  if (step) {
    await input.tx.outboxMessage.updateMany({
      where: {
        tenantId: input.tenantId,
        caseId: input.caseId,
        action: PipelineAction.ENGAGEMENT_TICK,
        availableAt: nextDate,
      },
      data: {
        engagementStepId: step.id,
      },
    });
  }
  return nextDate;
}

async function updatePipelineState(
  tx: Prisma.TransactionClient,
  input: {
    caseId: string;
    stage: PipelineStage;
    action: PipelineAction;
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "DEAD";
    patch?: Prisma.InputJsonValue;
    pendingQuestion?: string | null;
    score?: number | null;
    error?: string | null;
    incrementReview?: boolean;
    whistleblowerStatus?: WhistleblowerInteractionStatus;
    nextContactAt?: Date | null;
    processingSince?: Date | null;
    lastOutboundAt?: Date | null;
  },
) {
  await tx.casePipelineState.update({
    where: { caseId: input.caseId },
    data: {
      currentStage: input.stage,
      latestAction: input.action,
      latestActionStatus: input.status,
      pendingQuestion: input.pendingQuestion ?? undefined,
      whistleblowerStatus: input.whistleblowerStatus ?? undefined,
      nextContactAt:
        input.nextContactAt === null ? null : input.nextContactAt ?? undefined,
      processingSince:
        input.processingSince === null ? null : input.processingSince ?? undefined,
      lastOutboundAt:
        input.lastOutboundAt === null ? null : input.lastOutboundAt ?? undefined,
      latestConsistencyScore:
        typeof input.score === "number" ? Number(input.score.toFixed(3)) : undefined,
      guardAssessment: input.patch ?? undefined,
      lastError: input.error ?? undefined,
      lastTransitionAt: new Date(),
      reviewIterationCount: input.incrementReview ? { increment: 1 } : undefined,
    },
  });
}

async function stageStoreRawReport(context: Context) {
  await prisma.$transaction(async (tx) => {
    await createImmutableAuditEvent(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      action: "PIPELINE_STAGE_STORE_RAW_COMPLETED",
      payload: {
        outboxId: context.outboxId,
      },
    });

    await updatePipelineState(tx, {
      caseId: context.caseId,
      stage: PipelineStage.STORED,
      action: PipelineAction.STORE_RAW_REPORT,
      status: "COMPLETED",
    });

    await enqueueOutboxAction(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      rawReportId: context.rawReportId,
      action: PipelineAction.TRIAGE_A_GUARD,
      payload: {},
      idempotencyKey: `${context.caseId}:triage-a`,
    });
  });
}

async function stageTriageAGuard(context: Context) {
  const rawReportId = requireRawReportId(context);
  const raw = await prisma.rawReport.findUnique({
    where: { id: rawReportId },
    select: {
      id: true,
      narrativeEncrypted: true,
      intakePayload: true,
    },
  });
  if (!raw) throw new Error("RawReport não encontrado para triagem A.");
  const payload = parseRawPayload(raw.intakePayload as Prisma.JsonValue | null);
  const conversationCount = Array.isArray(payload.conversation) ? payload.conversation.length : 0;

  const assessment = await runAiPromptInjectionGuard({
    narrative: getNarrative(raw),
    conversationCount,
  });

  await prisma.$transaction(async (tx) => {
    await updatePipelineState(tx, {
      caseId: context.caseId,
      stage: PipelineStage.TRIAGE_A_COMPLETED,
      action: PipelineAction.TRIAGE_A_GUARD,
      status: "COMPLETED",
      patch: assessment as unknown as Prisma.InputJsonValue,
    });

    await createImmutableAuditEvent(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      action: "AI_INJECTION_GUARD_EXECUTED",
      payload: assessment as unknown as Prisma.InputJsonValue,
    });

    if (assessment.isMalicious) {
      await createImmutableAuditEvent(tx, {
        tenantId: context.tenantId,
        caseId: context.caseId,
        action: "AI_INJECTION_GUARD_FLAGGED",
        payload: assessment as unknown as Prisma.InputJsonValue,
      });
    }

    await enqueueOutboxAction(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      rawReportId: context.rawReportId,
      action: PipelineAction.TRIAGE_B_CLASSIFY,
      payload: {
        safeNarrative: assessment.safeNarrative,
      },
      idempotencyKey: `${context.caseId}:triage-b`,
    });
  });
}

async function stageTriageBClassify(context: Context) {
  const rawReportId = requireRawReportId(context);
  const raw = await prisma.rawReport.findUnique({
    where: { id: rawReportId },
    select: {
      id: true,
      narrativeEncrypted: true,
      intakePayload: true,
      caseId: true,
    },
  });
  if (!raw) throw new Error("RawReport não encontrado para triagem B.");
  const payload = parseRawPayload(raw.intakePayload as Prisma.JsonValue | null);
  const conversationCount = Array.isArray(payload.conversation) ? payload.conversation.length : 0;
  const attachments = getSanitizedAttachmentList(payload);
  const safeNarrative =
    typeof context.payload.safeNarrative === "string"
      ? context.payload.safeNarrative
      : getNarrative(raw);
  const triage = await runAiTriage({
    narrative: safeNarrative,
    conversationCount,
    attachments,
  });

  const isCriticalCase = triage.risk === RiskLevel.CRITICAL;
  await prisma.$transaction(async (tx) => {
    await tx.case.update({
      where: { id: context.caseId },
      data: {
        category: triage.aiCategory,
        risk: triage.risk,
        triageSummary: {
          schemaVersion: triage.schemaVersion,
          provider: triage.provider,
          model: triage.model,
          usage: triage.usage,
          fallbackUsed: triage.fallbackUsed,
          sanitizedNarrative: triage.sanitizedNarrative,
          narrativeForCouncil: triage.narrativeForCouncil,
          sanitizationMode: triage.sanitizationMode,
          sanitizationReason: triage.sanitizationReason,
          conflictSignals: triage.conflictSignals,
          autoBlockedUserNames: triage.autoBlockedUserNames,
          recommendedCouncilBrief: triage.recommendedCouncilBrief,
          attachmentSummary: triage.attachmentSummary,
        },
      },
    });

    await updatePipelineState(tx, {
      caseId: context.caseId,
      stage: PipelineStage.TRIAGE_B_COMPLETED,
      action: PipelineAction.TRIAGE_B_CLASSIFY,
      status: "COMPLETED",
    });

    await createImmutableAuditEvent(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      action: "AI_TRIAGE_COMPLETED",
      payload: {
        provider: triage.provider,
        model: triage.model,
        risk: triage.risk,
        category: triage.aiCategory,
        usage: triage.usage,
      },
      metadata: {
        aiProvider: triage.provider,
        aiModel: triage.model,
        aiCostUsd: triage.usage.estimatedCostUsd,
        aiTotalTokens: triage.usage.totalTokens,
        aiFallbackUsed: triage.fallbackUsed,
      },
    });

    if (isCriticalCase) {
      await createImmutableAuditEvent(tx, {
        tenantId: context.tenantId,
        caseId: context.caseId,
        action: "CASE_CRITICAL_INTAKE_ROUTED",
        payload: {
          reason: `Classificação IA com risco ${triage.risk}.`,
          risk: triage.risk,
          category: triage.aiCategory,
        },
      });
    }

    await enqueueOutboxAction(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      rawReportId: context.rawReportId,
      action: PipelineAction.EVALUATE_REPORT_OBJECT,
      payload: {},
      idempotencyKey: `${context.caseId}:evaluate`,
    });
  });
}

async function stageEvaluateReportObject(context: Context) {
  const rawReportId = requireRawReportId(context);
  const [raw, reportCase, tenantMembers] = await Promise.all([
    prisma.rawReport.findUnique({
      where: { id: rawReportId },
      select: {
        id: true,
        narrativeEncrypted: true,
        intakePayload: true,
      },
    }),
    prisma.case.findUnique({
      where: { id: context.caseId },
      select: {
        id: true,
        tenantId: true,
        externalId: true,
        category: true,
        risk: true,
        triageSummary: true,
      },
    }),
    prisma.user.findMany({
      where: {
        tenantId: context.tenantId,
        isActive: true,
        isCorporateAccount: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        companyRole: true,
      },
    }),
  ]);
  if (!raw || !reportCase) throw new Error("Contexto de avaliação não encontrado.");

  const intakePayload = parseRawPayload(raw.intakePayload as Prisma.JsonValue | null);
  const explicitWitnessEmails = Array.isArray(intakePayload.witnessEmails)
    ? intakePayload.witnessEmails
    : [];
  const corroborators = Array.isArray(intakePayload.corroborators)
    ? intakePayload.corroborators
    : [];
  const notifiableCorroborators = corroborators.filter(
    (corroborator) =>
      typeof corroborator?.contact === "string" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corroborator.contact),
  );
  const witnessEmails = toEmailSet([
    ...explicitWitnessEmails,
    ...notifiableCorroborators.map((item) => String(item.contact)),
  ]);

  const triageSummary = reportCase.triageSummary as Record<string, unknown> | null;
  const narrativeForCouncil =
    typeof triageSummary?.narrativeForCouncil === "string"
      ? triageSummary.narrativeForCouncil
      : getNarrative(raw);
  const conflictSignals = Array.isArray(triageSummary?.conflictSignals)
    ? (triageSummary?.conflictSignals as string[])
    : [];
  const autoBlockedUserNames = Array.isArray(triageSummary?.autoBlockedUserNames)
    ? (triageSummary?.autoBlockedUserNames as string[])
    : [];
  const blockedMemberIds = Array.isArray(intakePayload.blockedMemberIds)
    ? intakePayload.blockedMemberIds.filter(Boolean)
    : [];
  const autoBlockedMemberIds = inferAutoBlockedMemberIds({
    members: tenantMembers.map((member) => ({ id: member.id, name: member.name })),
    hints: [...conflictSignals, ...autoBlockedUserNames],
    narrative: getNarrative(raw),
  });
  const finalBlockedMemberIds = mergeBlockedIds(blockedMemberIds, autoBlockedMemberIds);
  const blockedUsers = tenantMembers
    .filter((member) => finalBlockedMemberIds.includes(member.id))
    .map((member) => ({ id: member.id, email: member.email }));

  const orchestration = runInvestigationOrchestrator({
    narrative: getNarrative(raw),
    category: reportCase.category,
    risk: reportCase.risk,
    blockedUserIds: blockedUsers.map((user) => user.id),
    members: tenantMembers.map((member) => ({
      id: member.id,
      name: member.name,
      companyRole: member.companyRole,
    })),
    witnessEmails,
  });

  const resolutionDueAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
  const firstResponseDueAt = new Date(
    Date.now() + SECURITY_CONFIG.slaFirstResponseHours * 60 * 60 * 1000,
  );
  const inviteExpHours = Number(process.env.INVITE_TOKEN_EXPIRES_HOURS || 72);
  const inviteExpiresAt = new Date(Date.now() + inviteExpHours * 60 * 60 * 1000);

  const notifyPayload: Array<{
    participantId: string;
    email: string;
    inviteToken: string;
    questionnaire: string[];
  }> = [];

  await prisma.$transaction(async (tx) => {
    await tx.case.update({
      where: { id: context.caseId },
      data: {
        description: encryptSensitiveText(narrativeForCouncil),
        restrictedUserIds: finalBlockedMemberIds,
        firstResponseDueAt,
        resolutionDueAt,
        intakeCompletedAt: new Date(),
        investigationSummary: {
          generatedAt: new Date().toISOString(),
          confidence: orchestration.summary.confidence,
          inferredEntities: orchestration.summary.inferredEntities,
          recommendedNextStep: orchestration.summary.recommendedNextStep,
          questionPlan: orchestration.questionPlan,
          reportDeadlineAt: resolutionDueAt.toISOString(),
          whistleblowerCategoryOpinion:
            intakePayload.whistleblowerCategoryOpinion?.trim() || null,
          whistleblowerContactProvided: Boolean(intakePayload.whistleblowerContact?.trim()),
        },
      },
    });

    for (const witnessEmail of witnessEmails) {
      const existing = await tx.caseParticipant.findFirst({
        where: {
          tenantId: context.tenantId,
          caseId: context.caseId,
          emailHash: hashSensitiveValue(witnessEmail),
        },
        select: { id: true },
      });
      if (existing) continue;

      const corroborator = notifiableCorroborators.find(
        (item) => String(item.contact).toLowerCase() === witnessEmail.toLowerCase(),
      );
      const questionnaire = buildParticipantQuestionnaire({
        category: reportCase.category,
        risk: reportCase.risk,
        personName: corroborator?.name?.trim(),
      });
      const participant = await tx.caseParticipant.create({
        data: {
          tenantId: context.tenantId,
          caseId: context.caseId,
          role: "WITNESS",
          emailHash: hashSensitiveValue(witnessEmail),
          emailEncrypted: encryptSensitiveText(
            JSON.stringify({
              name: corroborator?.name?.trim() || "",
              contact: witnessEmail,
            }),
          ),
          inviteStatus: "PENDING",
        },
      });
      const inviteToken = generateInviteToken();
      await tx.caseInviteToken.create({
        data: {
          tenantId: context.tenantId,
          caseParticipantId: participant.id,
          tokenHash: hashInviteToken(inviteToken),
          expiresAt: inviteExpiresAt,
        },
      });
      await tx.caseImplicatedPerson.create({
        data: {
          tenantId: context.tenantId,
          caseId: context.caseId,
          displayNameEncrypted: encryptSensitiveText(
            corroborator?.name?.trim() || "Pessoa citada",
          ),
          displayNameHash: hashSensitiveValue(
            corroborator?.name?.trim() || "pessoa citada",
          ),
          roleHint: "Pessoa citada no relato",
          source: "WHISTLEBLOWER",
          disclosureLevel: "ROLE_ONLY",
          mentionCount: 1,
          firstMentionedAt: new Date(),
          lastMentionedAt: new Date(),
        },
      });
      await createImmutableAuditEvent(tx, {
        tenantId: context.tenantId,
        caseId: context.caseId,
        action: "CASE_PARTICIPANT_QUESTIONNAIRE_CREATED",
        payload: {
          participantId: participant.id,
          questionnaire,
        },
      });
      notifyPayload.push({
        participantId: participant.id,
        email: witnessEmail,
        inviteToken,
        questionnaire,
      });
    }

    await updatePipelineState(tx, {
      caseId: context.caseId,
      stage: PipelineStage.EVALUATED,
      action: PipelineAction.EVALUATE_REPORT_OBJECT,
      status: "COMPLETED",
      patch: {
        confidence: orchestration.summary.confidence,
        inferredEntities: orchestration.summary.inferredEntities,
      } as Prisma.InputJsonValue,
    });

    await createImmutableAuditEvent(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      action: "PIPELINE_STAGE_EVALUATION_COMPLETED",
      payload: {
        questionPlanSize: orchestration.questionPlan.length,
        witnessInvites: notifyPayload.length,
      },
    });

    await enqueueOutboxAction(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      rawReportId: context.rawReportId,
      action: PipelineAction.NOTIFY_CONTACTS,
      payload: {
        notifyPayload,
      },
      idempotencyKey: `${context.caseId}:notify`,
    });
  });
}

async function stageNotifyContacts(context: Context) {
  const rawReportId = requireRawReportId(context);
  const reportCase = await prisma.case.findUnique({
    where: { id: context.caseId },
    select: {
      id: true,
      externalId: true,
      category: true,
      risk: true,
      tenantId: true,
      triageSummary: true,
      tenant: {
        select: {
          name: true,
        },
      },
    },
  });
  if (!reportCase) throw new Error("Caso não encontrado para notificações.");

  const members = await prisma.user.findMany({
    where: {
      tenantId: context.tenantId,
      isActive: true,
      isCorporateAccount: false,
    },
    select: { email: true, id: true },
  });
  const notifyPayload = Array.isArray(context.payload.notifyPayload)
    ? (context.payload.notifyPayload as Array<{
        participantId: string;
        email: string;
        inviteToken: string;
      }>)
    : [];

  for (const invite of notifyPayload) {
    await sendInviteNotification({
      to: invite.email,
      tenantName: reportCase.tenant.name,
      caseExternalId: reportCase.externalId,
      inviteToken: invite.inviteToken,
    });
    await prisma.caseParticipant.update({
      where: { id: invite.participantId },
      data: { inviteStatus: "SENT" },
    });
    await prisma.$transaction(async (tx) => {
      await createImmutableAuditEvent(tx, {
        tenantId: context.tenantId,
        caseId: context.caseId,
        action: "CASE_PARTICIPANT_INVITED",
        payload: {
          participantId: invite.participantId,
        },
      });
    });
  }

  const criticalReason =
    ((reportCase.triageSummary as Record<string, unknown> | null)?.criticalReason as string) ||
    `Classificação IA com risco ${reportCase.risk}.`;
  if (reportCase.risk === "CRITICAL") {
    await sendCriticalCaseNotification({
      to: members.map((member) => member.email),
      tenantName: reportCase.tenant.name,
      caseExternalId: reportCase.externalId,
      category: reportCase.category,
      risk: reportCase.risk,
      reason: criticalReason,
    });
  }

  await prisma.$transaction(async (tx) => {
    await updatePipelineState(tx, {
      caseId: context.caseId,
      stage: PipelineStage.CONTACTS_NOTIFIED,
      action: PipelineAction.NOTIFY_CONTACTS,
      status: "COMPLETED",
    });

    await createImmutableAuditEvent(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      action: "PIPELINE_STAGE_NOTIFICATIONS_COMPLETED",
      payload: {
        invitedCount: notifyPayload.length,
      },
    });

    await enqueueOutboxAction(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      rawReportId,
      action: PipelineAction.INIT_WHISTLEBLOWER_COMMUNICATION,
      payload: {},
      idempotencyKey: `${context.caseId}:init-comms`,
    });
  });
}

async function stageInitCommunication(context: Context) {
  const rawReportId = requireRawReportId(context);
  const reportCase = await prisma.case.findUnique({
    where: { id: context.caseId },
    select: {
      id: true,
      tenantId: true,
      investigationSummary: true,
    },
  });
  if (!reportCase) throw new Error("Caso não encontrado para iniciar comunicação.");

  const investigationSummary = reportCase.investigationSummary as Record<string, unknown> | null;
  const questionPlan = Array.isArray(investigationSummary?.questionPlan)
    ? (investigationSummary.questionPlan as Array<{ question?: string }>)
    : [];
  const firstQuestion =
    questionPlan.find((item) => typeof item.question === "string")?.question ||
    "Poderia complementar seu relato com mais detalhes sobre contexto, datas aproximadas e impacto?";
  const engagementBaseDate = new Date();

  await prisma.$transaction(async (tx) => {
    await ensureAdaptiveEngagementPlan({
      tx,
      tenantId: context.tenantId,
      caseId: context.caseId,
    });

    const existingSystemQuestion = await tx.caseMessage.findFirst({
      where: {
        caseId: context.caseId,
        authorType: "SYSTEM",
      },
      select: { id: true },
    });
    if (!existingSystemQuestion) {
      await tx.caseMessage.create({
        data: {
          tenantId: context.tenantId,
          caseId: context.caseId,
          authorType: "SYSTEM",
          content: encryptSensitiveText(firstQuestion),
        },
      });
    }

    await tx.case.update({
      where: { id: context.caseId },
      data: {
        status: "WAITING_RESPONSE",
      },
    });

    await updatePipelineState(tx, {
      caseId: context.caseId,
      stage: PipelineStage.COMMUNICATION_INITIALIZED,
      action: PipelineAction.INIT_WHISTLEBLOWER_COMMUNICATION,
      status: "COMPLETED",
      pendingQuestion: firstQuestion,
      whistleblowerStatus: WhistleblowerInteractionStatus.AWAITING_YOUR_REPLY,
      nextContactAt: null,
      lastOutboundAt: new Date(),
    });

    await createImmutableAuditEvent(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      action: "PIPELINE_STAGE_COMMUNICATION_INITIALIZED",
      payload: {
        hasQuestion: Boolean(firstQuestion),
      },
    });

    const nextTickAt = await scheduleNextEngagementTick({
      tx,
      tenantId: context.tenantId,
      caseId: context.caseId,
      rawReportId,
      baseDate: engagementBaseDate,
      reason: "FOLLOWUP_AFTER_INITIAL_QUESTION",
    });
    await updatePipelineState(tx, {
      caseId: context.caseId,
      stage: PipelineStage.COMMUNICATION_INITIALIZED,
      action: PipelineAction.INIT_WHISTLEBLOWER_COMMUNICATION,
      status: "COMPLETED",
      pendingQuestion: firstQuestion,
      whistleblowerStatus: WhistleblowerInteractionStatus.AWAITING_YOUR_REPLY,
      nextContactAt: nextTickAt,
      lastOutboundAt: new Date(),
    });
  });
}

async function stageReviewIteration(context: Context) {
  const sourceMessageId =
    typeof context.payload.sourceMessageId === "string" ? context.payload.sourceMessageId : null;
  const [reportCase, messages, pipeline] = await Promise.all([
    prisma.case.findUnique({
      where: { id: context.caseId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        category: true,
        risk: true,
      },
    }),
    prisma.caseMessage.findMany({
      where: { caseId: context.caseId },
      orderBy: { createdAt: "asc" },
      take: 40,
    }),
    prisma.casePipelineState.findUnique({
      where: { caseId: context.caseId },
      select: { reviewIterationCount: true },
    }),
  ]);
  if (!reportCase || !pipeline) throw new Error("Dados insuficientes para revisão iterativa.");

  await prisma.casePipelineState.update({
    where: { caseId: context.caseId },
    data: {
      whistleblowerStatus: WhistleblowerInteractionStatus.PROCESSING_YOUR_MESSAGE,
      processingSince: new Date(),
      latestAction: PipelineAction.REVIEW_ITERATION,
      latestActionStatus: "PROCESSING",
      lastTransitionAt: new Date(),
    },
  });

  const sourceMessage = sourceMessageId
    ? messages.find((message) => message.id === sourceMessageId)
    : messages.filter((message) => message.authorType === "WHISTLEBLOWER").at(-1);
  if (!sourceMessage) {
    return;
  }

  const narrative = decryptSensitiveText(sourceMessage.content);
  const guard = await runAiPromptInjectionGuard({
    narrative,
    conversationCount: messages.length,
  });
  const iterationNumber = pipeline.reviewIterationCount + 1;
  const reviewResult = await runInvestigationReviewIteration({
    latestNarrative: narrative,
    guardIsMalicious: guard.isMalicious,
    conversation: messages.map((message) => ({
      authorType: message.authorType,
      content: decryptSensitiveText(message.content),
      createdAt: message.createdAt.toISOString(),
    })),
    category:
      reportCase.category || "Investigação em andamento",
    risk: reportCase.risk,
    iterationNumber,
  });
  const consistencyScore = reviewResult.consistencyScore;
  const isConclusive =
    reviewResult.recommendedAction === "CONCLUDE_REVIEW" && reviewResult.isConclusive;
  const nextQuestion =
    reviewResult.nextQuestions[0] ||
    "Para concluir com segurança, você pode confirmar se houve recorrência recente e quem presenciou o último episódio?";

  await prisma.$transaction(async (tx) => {
    const tenantMembers = await tx.user.findMany({
      where: {
        tenantId: context.tenantId,
        isActive: true,
        isCorporateAccount: false,
      },
      select: {
        id: true,
        name: true,
      },
    });

    await tx.caseReviewIteration.create({
      data: {
        tenantId: context.tenantId,
        caseId: context.caseId,
        sourceMessageId: sourceMessage.id,
        iterationNumber,
        guardAssessment: guard as unknown as Prisma.InputJsonValue,
        consistencyScore,
        isConclusive,
        recommendedAction: reviewResult.recommendedAction,
        nextQuestions: isConclusive
          ? ([] as unknown as Prisma.InputJsonValue)
          : (reviewResult.nextQuestions as unknown as Prisma.InputJsonValue),
        inferredPeople: reviewResult.inferredPeople as unknown as Prisma.InputJsonValue,
        potentialBlockedMentions:
          reviewResult.potentialBlockedMentions as unknown as Prisma.InputJsonValue,
        confidence: reviewResult.confidence,
        aiProvider: reviewResult.provider,
        aiModel: reviewResult.model,
        aiUsage: reviewResult.usage as unknown as Prisma.InputJsonValue,
        summary: reviewResult.summary,
      },
    });

    const blockedByMention = matchMentionToUserIds({
      mentions: reviewResult.potentialBlockedMentions,
      users: tenantMembers,
    });
    if (reviewResult.inferredPeople.length > 0) {
      const existingImplicated = await tx.caseImplicatedPerson.findMany({
        where: {
          tenantId: context.tenantId,
          caseId: context.caseId,
        },
        select: {
          id: true,
          displayNameHash: true,
          displayNameEncrypted: true,
          mentionCount: true,
          roleHint: true,
        },
      });
      const existingNames = new Set(
        existingImplicated.map((item) =>
          decryptSensitiveText(item.displayNameEncrypted).toLowerCase(),
        ),
      );
      const existingByHash = new Map(
        existingImplicated.map((item) => [item.displayNameHash, item]),
      );
      for (const person of reviewResult.inferredPeople) {
        const personName = person.trim();
        if (!personName) continue;
        const nameHash = hashSensitiveValue(personName);
        const existingByName = existingNames.has(personName.toLowerCase());
        const existing = existingByHash.get(nameHash);
        if (existing || existingByName) {
          const target = existing
            ? existing
            : existingImplicated.find(
                (item) =>
                  decryptSensitiveText(item.displayNameEncrypted).toLowerCase() ===
                  personName.toLowerCase(),
              );
          if (target) {
            const updated = await tx.caseImplicatedPerson.update({
              where: { id: target.id },
              data: {
                mentionCount: { increment: 1 },
                lastMentionedAt: new Date(),
                roleHint: target.roleHint || "Detectado durante diálogo investigativo",
              },
              select: {
                mentionCount: true,
                displayNameHash: true,
              },
            });
            await createImmutableAuditEvent(tx, {
              tenantId: context.tenantId,
              caseId: context.caseId,
              action: "CASE_IMPLICATED_PERSON_REINFORCED",
              payload: {
                personHashPrefix: updated.displayNameHash.slice(0, 12),
                mentionCount: updated.mentionCount,
              },
            });
          }
          continue;
        }
        const created = await tx.caseImplicatedPerson.create({
          data: {
            tenantId: context.tenantId,
            caseId: context.caseId,
            displayNameEncrypted: encryptSensitiveText(personName),
            displayNameHash: nameHash,
            roleHint: "Detectado durante diálogo investigativo",
            source: `AI_REVIEW_${nameHash.slice(0, 10)}`,
            disclosureLevel: "ROLE_ONLY",
            mentionCount: 1,
            firstMentionedAt: new Date(),
            lastMentionedAt: new Date(),
          },
          select: {
            id: true,
            displayNameHash: true,
          },
        });
        await createImmutableAuditEvent(tx, {
          tenantId: context.tenantId,
          caseId: context.caseId,
          action: "CASE_IMPLICATED_PERSON_ADDED",
          payload: {
            implicatedId: created.id,
            source: "AI_REVIEW",
            personHashPrefix: created.displayNameHash.slice(0, 12),
          },
        });
        existingByHash.set(created.displayNameHash, {
          id: created.id,
          displayNameHash: created.displayNameHash,
          displayNameEncrypted: encryptSensitiveText(personName),
          mentionCount: 1,
          roleHint: "Detectado durante diálogo investigativo",
        });
        existingNames.add(personName.toLowerCase());
      }
    }
    if (blockedByMention.length > 0) {
      const currentCase = await tx.case.findUnique({
        where: { id: context.caseId },
        select: { restrictedUserIds: true },
      });
      if (currentCase) {
        const merged = mergeBlockedIds(currentCase.restrictedUserIds, blockedByMention);
        await tx.case.update({
          where: { id: context.caseId },
          data: {
            restrictedUserIds: merged,
          },
        });
        await createImmutableAuditEvent(tx, {
          tenantId: context.tenantId,
          caseId: context.caseId,
          action: "CASE_ACCESS_RESTRICTION_UPDATED",
          payload: {
            addedBlockedUserIds: blockedByMention,
            totalBlocked: merged.length,
          },
        });
      }
    }

    if (!isConclusive) {
      await tx.caseMessage.create({
        data: {
          tenantId: context.tenantId,
          caseId: context.caseId,
          authorType: "SYSTEM",
          content: encryptSensitiveText(nextQuestion),
        },
      });
      await tx.case.update({
        where: { id: context.caseId },
        data: {
          status: "WAITING_RESPONSE",
        },
      });
      const nextTickAt = await scheduleNextEngagementTick({
        tx,
        tenantId: context.tenantId,
        caseId: context.caseId,
        rawReportId: context.rawReportId,
        baseDate: new Date(),
        reason: "FOLLOWUP_AFTER_REVIEW_ITERATION",
      });
      const pendingParticipants = await tx.caseParticipant.count({
        where: {
          tenantId: context.tenantId,
          caseId: context.caseId,
          inviteStatus: { in: ["PENDING", "SENT"] },
        },
      });
      const nextStatus =
        pendingParticipants > 0
          ? WhistleblowerInteractionStatus.AWAITING_PARTICIPANTS
          : WhistleblowerInteractionStatus.AWAITING_YOUR_REPLY;
      await updatePipelineState(tx, {
        caseId: context.caseId,
        stage: PipelineStage.REVIEW_IN_PROGRESS,
        action: PipelineAction.REVIEW_ITERATION,
        status: "COMPLETED",
        pendingQuestion: nextQuestion,
        score: consistencyScore,
        patch: guard as unknown as Prisma.InputJsonValue,
        incrementReview: true,
        whistleblowerStatus: nextStatus,
        nextContactAt: nextTickAt,
        processingSince: null,
        lastOutboundAt: new Date(),
      });
    } else {
      await tx.case.update({
        where: { id: context.caseId },
        data: {
          status: "IN_REVIEW",
          reviewConcludedAt: new Date(),
        },
      });
      await enqueueOutboxAction(tx, {
        tenantId: context.tenantId,
        caseId: context.caseId,
        rawReportId: context.rawReportId,
        action: PipelineAction.PREPARE_PRE_CONCLUSION,
        payload: {
          origin: "review-iteration",
        },
        idempotencyKey: `${context.caseId}:prepare-pre-conclusion:auto`,
        availableAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      });
      await updatePipelineState(tx, {
        caseId: context.caseId,
        stage: PipelineStage.REVIEW_CONCLUDED,
        action: PipelineAction.REVIEW_ITERATION,
        status: "COMPLETED",
        pendingQuestion: null,
        score: consistencyScore,
        patch: guard as unknown as Prisma.InputJsonValue,
        incrementReview: true,
        whistleblowerStatus: WhistleblowerInteractionStatus.SYNTHESIZING,
        nextContactAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        processingSince: null,
      });
    }

    await createImmutableAuditEvent(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      action: "AI_REVIEW_ITERATION_COMPLETED",
      payload: {
        iterationNumber,
        isConclusive,
        consistencyScore,
          recommendedAction: reviewResult.recommendedAction,
          confidence: reviewResult.confidence,
          provider: reviewResult.provider,
          model: reviewResult.model,
          usage: reviewResult.usage,
      },
    });
  });
}

async function stageEngagementTick(context: Context) {
  const reportCase = await prisma.case.findUnique({
    where: { id: context.caseId },
    select: {
      id: true,
      status: true,
      reviewConcludedAt: true,
      pipelineState: {
        select: {
          pendingQuestion: true,
          whistleblowerStatus: true,
          lastOutboundAt: true,
        },
      },
    },
  });
  if (!reportCase) throw new Error("Caso não encontrado para tick de engajamento.");
  if (reportCase.status === "RESOLVED") return;
  const [latestWhistleblowerMessage, activePlan] = await Promise.all([
    prisma.caseMessage.findFirst({
      where: {
        caseId: context.caseId,
        authorType: "WHISTLEBLOWER",
      },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
      },
    }),
    prisma.caseEngagementPlan.findFirst({
      where: {
        tenantId: context.tenantId,
        caseId: context.caseId,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
      select: {
        targetConclusionAt: true,
        startedAt: true,
      },
    }),
  ]);

  const inactivityReference = (() => {
    const lastOutboundAt = reportCase.pipelineState?.lastOutboundAt;
    if (lastOutboundAt) return lastOutboundAt;
    if (latestWhistleblowerMessage?.createdAt) return latestWhistleblowerMessage.createdAt;
    return activePlan?.startedAt ?? new Date();
  })();
  const inactivityThresholdMs =
    SECURITY_CONFIG.abandonmentWindowDays * 24 * 60 * 60 * 1000;
  const exceededByInactivity =
    Date.now() - inactivityReference.getTime() >= inactivityThresholdMs;
  const exceededByPlanDeadline =
    activePlan?.targetConclusionAt != null &&
    Date.now() >= activePlan.targetConclusionAt.getTime();
  const shouldAutoAdvanceByAbandonment =
    Boolean(reportCase.pipelineState?.pendingQuestion) &&
    (exceededByInactivity || exceededByPlanDeadline);

  if (shouldAutoAdvanceByAbandonment) {
    await prisma.$transaction(async (tx) => {
      await tx.case.update({
        where: { id: context.caseId },
        data: {
          status: "IN_REVIEW",
          reviewConcludedAt: reportCase.reviewConcludedAt ?? new Date(),
        },
      });
      await createImmutableAuditEvent(tx, {
        tenantId: context.tenantId,
        caseId: context.caseId,
        action: "CASE_ABANDONMENT_THRESHOLD_REACHED",
        payload: {
          abandonmentWindowDays: SECURITY_CONFIG.abandonmentWindowDays,
          inactivityReferenceAt: inactivityReference.toISOString(),
          targetConclusionAt: activePlan?.targetConclusionAt?.toISOString() ?? null,
        },
      });
      await tx.caseMessage.create({
        data: {
          tenantId: context.tenantId,
          caseId: context.caseId,
          authorType: "SYSTEM",
          content: encryptSensitiveText(
            "Não recebemos novas respostas dentro da janela planejada de acompanhamento. O caso seguirá para pre-conclusão com os dados disponíveis até aqui.",
          ),
        },
      });
      await enqueueOutboxAction(tx, {
        tenantId: context.tenantId,
        caseId: context.caseId,
        rawReportId: context.rawReportId,
        action: PipelineAction.PREPARE_PRE_CONCLUSION,
        payload: {
          origin: "abandonment-threshold",
        },
        idempotencyKey: `${context.caseId}:prepare-pre-conclusion:abandonment`,
      });
      await updatePipelineState(tx, {
        caseId: context.caseId,
        stage: PipelineStage.REVIEW_CONCLUDED,
        action: PipelineAction.ENGAGEMENT_TICK,
        status: "COMPLETED",
        pendingQuestion: null,
        whistleblowerStatus: WhistleblowerInteractionStatus.SYNTHESIZING,
        processingSince: null,
        nextContactAt: null,
        lastOutboundAt: new Date(),
      });
    });
    return;
  }

  const reminderMessage = reportCase.pipelineState?.pendingQuestion
    ? "Seguimos analisando seu caso com cautela. Quando puder, responda a pergunta pendente para avançarmos na investigação."
    : "Seu caso segue em análise pelo Agente de Investigação. Você receberá atualização em breve.";

  await prisma.$transaction(async (tx) => {
    await tx.caseMessage.create({
      data: {
        tenantId: context.tenantId,
        caseId: context.caseId,
        authorType: "SYSTEM",
        content: encryptSensitiveText(reminderMessage),
      },
    });
    await createImmutableAuditEvent(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      action: "PIPELINE_STAGE_ENGAGEMENT_TICK_EXECUTED",
      payload: {
        hasPendingQuestion: Boolean(reportCase.pipelineState?.pendingQuestion),
      },
    });
    await updatePipelineState(tx, {
      caseId: context.caseId,
      stage: PipelineStage.REVIEW_IN_PROGRESS,
      action: PipelineAction.ENGAGEMENT_TICK,
      status: "COMPLETED",
      whistleblowerStatus: reportCase.pipelineState?.pendingQuestion
        ? WhistleblowerInteractionStatus.AWAITING_YOUR_REPLY
        : WhistleblowerInteractionStatus.ANALYZING,
      lastOutboundAt: new Date(),
      nextContactAt: null,
    });
    const nextTickAt = await scheduleNextEngagementTick({
      tx,
      tenantId: context.tenantId,
      caseId: context.caseId,
      rawReportId: context.rawReportId,
      baseDate: new Date(),
      reason: "FOLLOWUP_REMINDER_LOOP",
    });
    await updatePipelineState(tx, {
      caseId: context.caseId,
      stage: PipelineStage.REVIEW_IN_PROGRESS,
      action: PipelineAction.ENGAGEMENT_TICK,
      status: "COMPLETED",
      whistleblowerStatus: reportCase.pipelineState?.pendingQuestion
        ? WhistleblowerInteractionStatus.AWAITING_YOUR_REPLY
        : WhistleblowerInteractionStatus.ANALYZING,
      lastOutboundAt: new Date(),
      nextContactAt: nextTickAt,
    });
  });
}

async function stagePreparePreConclusion(context: Context) {
  await prisma.$transaction(async (tx) => {
    const reportCase = await tx.case.findUnique({
      where: { id: context.caseId },
      select: {
        id: true,
        triageSummary: true,
        investigationSummary: true,
        reviewConcludedAt: true,
        category: true,
        risk: true,
      },
    });
    if (!reportCase) {
      throw new Error("Caso não encontrado para pre-conclusão.");
    }
    const reviewIterations = await tx.caseReviewIteration.findMany({
      where: { caseId: context.caseId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        isConclusive: true,
        consistencyScore: true,
        summary: true,
        inferredPeople: true,
      },
    });
    const implicated = await tx.caseImplicatedPerson.findMany({
      where: { caseId: context.caseId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        roleHint: true,
        disclosureLevel: true,
      },
    });

    const recommendation = await runPreConclusionSynthesis({
      category: reportCase.category,
      risk: reportCase.risk,
      reviewSummaries: reviewIterations
        .map((item) => item.summary || "")
        .filter(Boolean),
      inferredPeople: reviewIterations.flatMap((item) =>
        Array.isArray(item.inferredPeople)
          ? (item.inferredPeople as string[])
          : [],
      ),
    });

    const packageSnapshot = {
      generatedAt: new Date().toISOString(),
      reviewConcludedAt: reportCase.reviewConcludedAt?.toISOString() ?? null,
      category: reportCase.category,
      risk: reportCase.risk,
      triageSummary: reportCase.triageSummary,
      investigationSummary: reportCase.investigationSummary,
      reviewIterations,
      implicated,
      recommendation,
    };

    await tx.case.update({
      where: { id: context.caseId },
      data: {
        preConclusionPackage: packageSnapshot as Prisma.InputJsonValue,
        readyForCommitteeAt: new Date(),
      },
    });

    await updatePipelineState(tx, {
      caseId: context.caseId,
      stage: PipelineStage.PRE_CONCLUSION_READY,
      action: PipelineAction.PREPARE_PRE_CONCLUSION,
      status: "COMPLETED",
      pendingQuestion: null,
      whistleblowerStatus: WhistleblowerInteractionStatus.PRE_CONCLUSION,
      nextContactAt: null,
      processingSince: null,
    });

    await createImmutableAuditEvent(tx, {
      tenantId: context.tenantId,
      caseId: context.caseId,
      action: "CASE_PRE_CONCLUSION_PACKAGE_PUBLISHED",
      payload: {
        implicatedCount: implicated.length,
      },
    });
  });
}

export async function handleOutboxAction(message: {
  id: string;
  tenantId: string;
  caseId: string | null;
  rawReportId: string | null;
  action: PipelineAction;
  payload: Prisma.JsonValue | null;
}) {
  if (!message.caseId || !message.rawReportId) {
    if (message.action === PipelineAction.REVIEW_ITERATION && message.caseId) {
      await stageReviewIteration({
        outboxId: message.id,
        tenantId: message.tenantId,
        caseId: message.caseId,
        rawReportId: null,
        payload: (message.payload as Record<string, unknown>) || {},
      });
      return;
    }
    if (message.action === PipelineAction.PREPARE_PRE_CONCLUSION && message.caseId) {
      await stagePreparePreConclusion({
        outboxId: message.id,
        tenantId: message.tenantId,
        caseId: message.caseId,
        rawReportId: null,
        payload: (message.payload as Record<string, unknown>) || {},
      });
      return;
    }
    throw new Error("Mensagem outbox sem contexto mínimo (caseId/rawReportId).");
  }

  const context: Context = {
    outboxId: message.id,
    tenantId: message.tenantId,
    caseId: message.caseId,
    rawReportId: message.rawReportId,
    payload: (message.payload as Record<string, unknown>) || {},
  };

  switch (message.action) {
    case PipelineAction.STORE_RAW_REPORT:
      await stageStoreRawReport(context);
      return;
    case PipelineAction.TRIAGE_A_GUARD:
      await stageTriageAGuard(context);
      return;
    case PipelineAction.TRIAGE_B_CLASSIFY:
      await stageTriageBClassify(context);
      return;
    case PipelineAction.EVALUATE_REPORT_OBJECT:
      await stageEvaluateReportObject(context);
      return;
    case PipelineAction.NOTIFY_CONTACTS:
      await stageNotifyContacts(context);
      return;
    case PipelineAction.INIT_WHISTLEBLOWER_COMMUNICATION:
      await stageInitCommunication(context);
      return;
    case PipelineAction.REVIEW_ITERATION:
      await stageReviewIteration(context);
      return;
    case PipelineAction.PREPARE_PRE_CONCLUSION:
      await stagePreparePreConclusion(context);
      return;
    case PipelineAction.ENGAGEMENT_TICK:
      await stageEngagementTick(context);
      return;
    default:
      throw new Error(`Ação de pipeline não suportada: ${message.action as string}`);
  }
}

