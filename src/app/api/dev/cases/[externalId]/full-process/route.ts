import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { describeAuditAction, resolveAuditActorLabel } from "@/lib/audit-action";
import { decryptEmail } from "@/lib/secure-email";
import { decryptSensitiveText } from "@/lib/secure-data";
import { ensureDevRouteAccess } from "@/lib/dev-routes";

function ensureDebugAccess(request: NextRequest) {
  const blocked = ensureDevRouteAccess();
  if (blocked) return blocked;
  const expectedKey = process.env.CASE_FORENSIC_DEBUG_KEY?.trim();
  if (!expectedKey) return null;
  const provided = request.headers.get("x-debug-key")?.trim();
  if (provided !== expectedKey) {
    return NextResponse.json(
      { error: "Chave de apuração inválida para rota de debug." },
      { status: 401 },
    );
  }
  return null;
}

function parseJsonSafe(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function decryptParticipantProfile(payload: string) {
  if (!payload) {
    return { name: null, contact: null, raw: "" };
  }

  const sensitiveDecoded = decryptSensitiveText(payload);
  const parsed = parseJsonSafe(sensitiveDecoded);
  if (
    parsed &&
    typeof parsed === "object" &&
    "contact" in parsed &&
    typeof (parsed as { contact?: unknown }).contact === "string"
  ) {
    const data = parsed as { name?: string; contact?: string };
    return {
      name: data.name ?? null,
      contact: data.contact ?? null,
      raw: sensitiveDecoded,
    };
  }

  try {
    const email = decryptEmail(payload);
    return { name: null, contact: email, raw: sensitiveDecoded };
  } catch {
    return { name: null, contact: sensitiveDecoded, raw: sensitiveDecoded };
  }
}

function extractQuestionnaire(
  auditEvents: Array<{ action: string; immutableData: unknown }>,
  participantId: string,
) {
  const matches = auditEvents
    .filter((event) => event.action === "CASE_PARTICIPANT_QUESTIONNAIRE_CREATED")
    .map((event) => {
      const payload = (event.immutableData as { payload?: unknown } | null)?.payload as
        | { participantId?: string; questionnaire?: string[] }
        | undefined;
      if (payload?.participantId !== participantId || !Array.isArray(payload.questionnaire)) {
        return null;
      }
      return payload.questionnaire;
    })
    .filter((value): value is string[] => Array.isArray(value));

  if (matches.length === 0) return [];
  return matches[0];
}

function decodeEncryptedCorroborators(triageSummary: unknown) {
  if (!triageSummary || typeof triageSummary !== "object") return [];
  const summary = triageSummary as { corroborators?: unknown };
  if (!Array.isArray(summary.corroborators)) return [];

  return summary.corroborators
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const encryptedPayload = (entry as { encryptedPayload?: unknown }).encryptedPayload;
      if (typeof encryptedPayload !== "string") return null;
      const decrypted = decryptSensitiveText(encryptedPayload);
      const parsed = parseJsonSafe(decrypted);
      if (!parsed || typeof parsed !== "object") return null;
      const data = parsed as { name?: string; contact?: string };
      return {
        name: data.name ?? null,
        contact: data.contact ?? null,
      };
    })
    .filter((item) => item !== null);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ externalId: string }> },
) {
  const accessError = ensureDebugAccess(request);
  if (accessError) return accessError;

  const { externalId } = await context.params;
  const targetExternalId = externalId?.trim();
  if (!targetExternalId) {
    return NextResponse.json({ error: "Identificador do caso é obrigatório." }, { status: 400 });
  }

  const reportCase =
    targetExternalId.toLowerCase() === "latest"
      ? await prisma.case.findFirst({
          orderBy: { createdAt: "desc" },
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                code: true,
                planCode: true,
              },
            },
            token: true,
            messages: {
              orderBy: { createdAt: "asc" },
            },
            participants: {
              orderBy: { createdAt: "asc" },
              include: {
                inviteTokens: {
                  orderBy: { createdAt: "asc" },
                },
                responses: {
                  orderBy: { createdAt: "asc" },
                },
              },
            },
            auditEvents: {
              orderBy: { createdAt: "asc" },
              include: {
                actorUser: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
            committeeDecisions: {
              orderBy: { createdAt: "asc" },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        })
      : await prisma.case.findUnique({
          where: { externalId: targetExternalId },
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                code: true,
                planCode: true,
              },
            },
            token: true,
            messages: {
              orderBy: { createdAt: "asc" },
            },
            participants: {
              orderBy: { createdAt: "asc" },
              include: {
                inviteTokens: {
                  orderBy: { createdAt: "asc" },
                },
                responses: {
                  orderBy: { createdAt: "asc" },
                },
              },
            },
            auditEvents: {
              orderBy: { createdAt: "asc" },
              include: {
                actorUser: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
            committeeDecisions: {
              orderBy: { createdAt: "asc" },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        });

  if (!reportCase) {
    return NextResponse.json({ error: "Caso não encontrado para apuração." }, { status: 404 });
  }

  const participants = reportCase.participants.map((participant) => {
    const profile = decryptParticipantProfile(participant.emailEncrypted);
    const questionnaire = extractQuestionnaire(reportCase.auditEvents, participant.id);

    return {
      id: participant.id,
      role: participant.role,
      inviteStatus: participant.inviteStatus,
      acceptedAt: participant.acceptedAt?.toISOString() ?? null,
      profile,
      inviteTokens: participant.inviteTokens.map((token) => ({
        id: token.id,
        tokenHash: token.tokenHash,
        createdAt: token.createdAt.toISOString(),
        expiresAt: token.expiresAt.toISOString(),
        consumedAt: token.consumedAt?.toISOString() ?? null,
        revokedAt: token.revokedAt?.toISOString() ?? null,
      })),
      questionnaire,
      responses: participant.responses.map((response) => ({
        id: response.id,
        questionText: response.questionText,
        answerText: decryptSensitiveText(response.answerText),
        createdAt: response.createdAt.toISOString(),
      })),
    };
  });

  const auditTrail = reportCase.auditEvents.map((event) => ({
    id: event.id,
    index: event.eventIndex,
    action: event.action,
    actionDescription: describeAuditAction(event.action),
    actorLabel: resolveAuditActorLabel({
      action: event.action,
      actorUserName: event.actorUser?.name,
      actorUserEmail: event.actorUser?.email,
    }),
    metadata: event.metadata,
    immutableData: event.immutableData,
    previousHash: event.previousHash,
    eventHash: event.eventHash,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
  }));

  return NextResponse.json({
    ok: true,
    debug: {
      warning:
        "Rota temporária para apuração de fluxo. Remover antes de produção.",
      generatedAt: new Date().toISOString(),
      source: targetExternalId,
    },
    case: {
      id: reportCase.id,
      externalId: reportCase.externalId,
      tenantId: reportCase.tenantId,
      tenant: reportCase.tenant,
      title: reportCase.title,
      category: reportCase.category,
      status: reportCase.status,
      risk: reportCase.risk,
      description: decryptSensitiveText(reportCase.description),
      restrictedUserIds: reportCase.restrictedUserIds,
      createdAt: reportCase.createdAt.toISOString(),
      updatedAt: reportCase.updatedAt.toISOString(),
      openedAt: reportCase.openedAt.toISOString(),
      firstResponseDueAt: reportCase.firstResponseDueAt?.toISOString() ?? null,
      resolutionDueAt: reportCase.resolutionDueAt?.toISOString() ?? null,
      closedAt: reportCase.closedAt?.toISOString() ?? null,
      triageSummary: reportCase.triageSummary,
      triageCorroboratorsDecrypted: decodeEncryptedCorroborators(reportCase.triageSummary),
      investigationSummary: reportCase.investigationSummary,
    },
    whistleblowerToken: reportCase.token
      ? {
          id: reportCase.token.id,
          tokenHash: reportCase.token.tokenHash,
          createdAt: reportCase.token.createdAt.toISOString(),
          expiresAt: reportCase.token.expiresAt?.toISOString() ?? null,
          lastAccessAt: reportCase.token.lastAccessAt?.toISOString() ?? null,
        }
      : null,
    messages: reportCase.messages.map((message) => ({
      id: message.id,
      authorType: message.authorType,
      content: decryptSensitiveText(message.content),
      createdAt: message.createdAt.toISOString(),
    })),
    participants,
    notificationsView: participants.map((participant) => ({
      participantId: participant.id,
      inviteStatus: participant.inviteStatus,
      notifiedChannels: [participant.profile.contact].filter(Boolean),
      inviteCount: participant.inviteTokens.length,
      lastInvite: participant.inviteTokens[participant.inviteTokens.length - 1] ?? null,
    })),
    committeeDecisions: reportCase.committeeDecisions.map((decision) => ({
      id: decision.id,
      decision: decision.decision,
      comment: decision.comment,
      createdAt: decision.createdAt.toISOString(),
      user: decision.user,
    })),
    auditTrail,
  });
}

