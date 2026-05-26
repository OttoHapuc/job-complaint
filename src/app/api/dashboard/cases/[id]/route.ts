import { NextRequest, NextResponse } from "next/server";
import { CaseStatus, MessageAuthor, RiskLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canVoteAsCommittee, requirePermission } from "@/lib/permissions";
import { describeAuditAction, resolveAuditActorLabel } from "@/lib/audit-action";
import { initialAnalysisStatusLabel, isCaseInInitialAnalysisWindow } from "@/lib/case-visibility";
import { decryptSensitiveText } from "@/lib/secure-data";

function statusLabel(status: CaseStatus) {
  switch (status) {
    case "IN_REVIEW":
      return "Em Análise";
    case "WAITING_RESPONSE":
      return "Aguardando Informações";
    case "ESCALATED":
      return "Escalonado";
    case "AWAITING_COMMITTEE_APPROVAL":
      return "Aguardando Comitê";
    case "RESOLVED":
      return "Resolvido";
    default:
      return "Aberto";
  }
}

function riskLabel(risk: RiskLevel) {
  switch (risk) {
    case "CRITICAL":
      return "Crítico";
    case "MEDIUM":
      return "Médio";
    default:
      return "Baixo";
  }
}

function messageAuthorLabel(author: MessageAuthor) {
  if (author === "WHISTLEBLOWER") return "Denunciante (Anônimo)";
  if (author === "SYSTEM") return "Sistema";
  return "Conselho";
}

function buildStatusLabel(status: CaseStatus, lockedByInitialAnalysis: boolean) {
  if (lockedByInitialAnalysis) return initialAnalysisStatusLabel();
  return statusLabel(status);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const allowed = await requirePermission(request, "case.read");
  if (!allowed.ok) {
    return allowed.response;
  }

  const { id } = await context.params;
  const externalId = `CASO-${id.toUpperCase()}`;

  const reportCase = await prisma.case.findFirst({
    where: {
      tenantId: allowed.user.tenantId,
      externalId,
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 100,
      },
      auditEvents: {
        orderBy: { createdAt: "desc" },
        take: 50,
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
      participants: {
        select: {
          id: true,
          inviteStatus: true,
          acceptedAt: true,
          role: true,
        },
        orderBy: { createdAt: "asc" },
      },
      committeeDecisions: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      implicatedPeople: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          roleHint: true,
          source: true,
          disclosureLevel: true,
          displayNameEncrypted: true,
        },
      },
    },
  });

  if (!reportCase) {
    return NextResponse.json({ error: "Caso não encontrado." }, { status: 404 });
  }

  if (reportCase.restrictedUserIds.includes(allowed.user.id)) {
    return NextResponse.json(
      { error: "Acesso bloqueado por conflito de interesse neste caso." },
      { status: 403 },
    );
  }

  const lockedByInitialAnalysis = isCaseInInitialAnalysisWindow({
    createdAt: reportCase.createdAt,
    reviewConcludedAt: reportCase.reviewConcludedAt,
  });

  return NextResponse.json({
    ok: true,
    access: {
      lockedByInitialAnalysis,
      canViewAiReport: !lockedByInitialAnalysis,
      canViewCommunication: !lockedByInitialAnalysis,
      lockReason: lockedByInitialAnalysis
        ? "Caso em fase inicial de análise de IA/comitê. Somente trilha de auditoria disponível."
        : null,
    },
    case: {
      id: reportCase.id,
      externalId: reportCase.externalId,
      title: lockedByInitialAnalysis ? "Sigiloso durante análise inicial" : reportCase.title,
      description: lockedByInitialAnalysis
        ? "Conteúdo sigiloso temporariamente."
        : decryptSensitiveText(reportCase.description),
      category: lockedByInitialAnalysis ? "Sigiloso durante análise inicial" : reportCase.category,
      status: buildStatusLabel(reportCase.status, lockedByInitialAnalysis),
      risk: lockedByInitialAnalysis ? "Sigiloso" : riskLabel(reportCase.risk),
      createdAt: reportCase.createdAt.toISOString(),
      updatedAt: reportCase.updatedAt.toISOString(),
      firstResponseDueAt: reportCase.firstResponseDueAt?.toISOString() ?? null,
      resolutionDueAt: reportCase.resolutionDueAt?.toISOString() ?? null,
      escalatedToUserId: lockedByInitialAnalysis ? null : reportCase.escalatedToUserId ?? null,
      investigationSummary: lockedByInitialAnalysis ? null : reportCase.investigationSummary ?? null,
      triageSummary: lockedByInitialAnalysis ? null : reportCase.triageSummary ?? null,
      preConclusionPackage: lockedByInitialAnalysis ? null : reportCase.preConclusionPackage ?? null,
      reviewConcludedAt: reportCase.reviewConcludedAt?.toISOString() ?? null,
      readyForCommitteeAt: reportCase.readyForCommitteeAt?.toISOString() ?? null,
    },
    messages: lockedByInitialAnalysis
      ? []
      : reportCase.messages.map((message) => ({
          id: message.id,
          authorType: message.authorType,
          authorLabel: messageAuthorLabel(message.authorType),
          content: decryptSensitiveText(message.content),
          createdAt: message.createdAt.toISOString(),
        })),
    auditTrail: reportCase.auditEvents.map((event) => ({
      id: event.id,
      action: event.action,
      actionDescription: describeAuditAction(event.action),
      createdAt: event.createdAt.toISOString(),
      actorUserId: event.actorUserId,
      actorLabel: resolveAuditActorLabel({
        action: event.action,
        actorUserName: event.actorUser?.name,
        actorUserEmail: event.actorUser?.email,
      }),
    })),
    participants: lockedByInitialAnalysis
      ? []
      : reportCase.participants.map((participant) => ({
          id: participant.id,
          role: participant.role,
          inviteStatus: participant.inviteStatus,
          acceptedAt: participant.acceptedAt?.toISOString() ?? null,
        })),
    committee: {
      canVote: !lockedByInitialAnalysis && canVoteAsCommittee(allowed.user),
      decisions: lockedByInitialAnalysis
        ? []
        : reportCase.committeeDecisions.map((decision) => ({
            userId: decision.user.id,
            userName: decision.user.name,
            userEmail: decision.user.email,
            decision: decision.decision,
            comment: decision.comment,
            createdAt: decision.createdAt.toISOString(),
          })),
    },
    preConclusion: {
      implicatedPeople: lockedByInitialAnalysis
        ? []
        : reportCase.implicatedPeople.map((person) => {
            const fullName = decryptSensitiveText(person.displayNameEncrypted);
            const visibleName =
              person.disclosureLevel === "FULL_NAME"
                ? fullName
                : person.disclosureLevel === "PSEUDONYM"
                  ? `Pessoa-${person.id.slice(0, 6).toUpperCase()}`
                  : "Identidade protegida";
            return {
              id: person.id,
              source: person.source,
              roleHint: person.roleHint,
              disclosureLevel: person.disclosureLevel,
              visibleName,
            };
          }),
    },
  });
}
