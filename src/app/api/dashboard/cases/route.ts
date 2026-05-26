import { NextRequest, NextResponse } from "next/server";
import { CaseStatus, RiskLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createImmutableAuditEvent } from "@/lib/audit";
import { requirePermission } from "@/lib/permissions";
import { initialAnalysisStatusLabel, isCaseInInitialAnalysisWindow } from "@/lib/case-visibility";

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

  const [activeCount, criticalPendingCount, resolvedLast30Days, recentCases] = await Promise.all([
    prisma.case.count({
      where: {
        tenantId,
        NOT: {
          restrictedUserIds: {
            has: allowed.user.id,
          },
        },
        status: {
          in: ["OPEN", "IN_REVIEW", "WAITING_RESPONSE", "ESCALATED", "AWAITING_COMMITTEE_APPROVAL"],
        },
      },
    }),
    prisma.case.count({
      where: {
        tenantId,
        NOT: {
          restrictedUserIds: {
            has: allowed.user.id,
          },
        },
        risk: "CRITICAL",
        status: {
          in: ["OPEN", "IN_REVIEW", "WAITING_RESPONSE", "ESCALATED", "AWAITING_COMMITTEE_APPROVAL"],
        },
      },
    }),
    prisma.case.count({
      where: {
        tenantId,
        NOT: {
          restrictedUserIds: {
            has: allowed.user.id,
          },
        },
        status: "RESOLVED",
        updatedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.case.findMany({
      where: {
        tenantId,
        NOT: {
          restrictedUserIds: {
            has: allowed.user.id,
          },
        },
      },
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
  ]);

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
