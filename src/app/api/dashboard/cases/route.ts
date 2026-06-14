import { NextRequest, NextResponse } from "next/server";
import { CaseStatus, RiskLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createImmutableAuditEvent } from "@/lib/audit";
import { requirePermission } from "@/lib/permissions";
import { initialAnalysisStatusLabel, isCaseInInitialAnalysisWindow } from "@/lib/case-visibility";
import { countSlaOverview } from "@/lib/sla-overview";

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

function formatDate(value: Date) {
  return value.toLocaleDateString("pt-BR");
}

export async function GET(request: NextRequest) {
  const allowed = await requirePermission(request, "case.read");
  if (!allowed.ok) {
    return allowed.response;
  }

  const tenantId = allowed.user.tenantId;
  const activeStatuses = [
    "OPEN",
    "IN_REVIEW",
    "WAITING_RESPONSE",
    "ESCALATED",
    "AWAITING_COMMITTEE_APPROVAL",
  ] as const;
  const accessFilter = {
    tenantId,
    NOT: {
      restrictedUserIds: {
        has: allowed.user.id,
      },
    },
  };

  const [activeCount, criticalPendingCount, resolvedLast30Days, recentCases, slaCases, abandonmentEventsAll] =
    await Promise.all([
    prisma.case.count({
      where: {
        ...accessFilter,
        status: {
          in: [...activeStatuses],
        },
      },
    }),
    prisma.case.count({
      where: {
        ...accessFilter,
        risk: "CRITICAL",
        status: {
          in: [...activeStatuses],
        },
      },
    }),
    prisma.case.count({
      where: {
        ...accessFilter,
        status: "RESOLVED",
        updatedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.case.findMany({
      where: accessFilter,
      orderBy: { updatedAt: "desc" },
      take: 7,
      select: {
        id: true,
        externalId: true,
        category: true,
        risk: true,
        status: true,
        createdAt: true,
        reviewConcludedAt: true,
        updatedAt: true,
        escalatedToUser: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.case.findMany({
      where: {
        ...accessFilter,
        status: {
          in: [...activeStatuses],
        },
      },
      select: {
        id: true,
        status: true,
        firstResponseDueAt: true,
        resolutionDueAt: true,
      },
    }),
    prisma.auditEvent.findMany({
      where: {
        tenantId,
        action: "CASE_ABANDONMENT_THRESHOLD_REACHED",
      },
      select: {
        caseId: true,
      },
      distinct: ["caseId"],
    }),
  ]);
  const abandonedCaseIds = new Set(
    abandonmentEventsAll.map((item) => item.caseId).filter(Boolean) as string[],
  );
  const slaOverview = countSlaOverview(slaCases, abandonedCaseIds, (item) => item.id);
  const recentCaseIds = recentCases.map((item) => item.id);
  const abandonmentEvents =
    recentCaseIds.length === 0
      ? []
      : await prisma.auditEvent.findMany({
          where: {
            tenantId,
            caseId: { in: recentCaseIds },
            action: "CASE_ABANDONMENT_THRESHOLD_REACHED",
          },
          select: {
            caseId: true,
          },
        });
  const recentAbandonedCaseIds = new Set(abandonmentEvents.map((item) => item.caseId));

  await prisma.$transaction(async (tx) => {
    await createImmutableAuditEvent(tx, {
      tenantId,
      actorUserId: allowed.user.id,
      action: "DASHBOARD_VIEWED",
      payload: {
        recentCasesReturned: recentCases.length,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    metrics: {
      activeCases: activeCount,
      criticalPendingCases: criticalPendingCount,
      averageSlaDays: null,
      resolvedLast30Days,
      sla: slaOverview,
    },
    cases: recentCases.map((item) => {
      const lockedByInitialAnalysis = isCaseInInitialAnalysisWindow({
        createdAt: item.createdAt,
        reviewConcludedAt: item.reviewConcludedAt,
      });

      return {
        id: item.id,
        externalId: item.externalId,
        category: lockedByInitialAnalysis ? "Sigiloso durante análise inicial" : item.category,
        risk: riskLabel(item.risk),
        status: lockedByInitialAnalysis ? initialAnalysisStatusLabel() : statusLabel(item.status),
        abandonedBySilence: !lockedByInitialAnalysis && recentAbandonedCaseIds.has(item.id),
        escalatedTo: lockedByInitialAnalysis
          ? null
          : item.escalatedToUser?.name ??
            item.escalatedToUser?.email ??
            null,
        lastInteraction: formatDate(item.updatedAt),
        lockedByInitialAnalysis,
      };
    }),
  });
}
