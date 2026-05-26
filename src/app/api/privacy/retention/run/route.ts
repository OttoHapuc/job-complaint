import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { SECURITY_CONFIG } from "@/lib/config";
import { createImmutableAuditEvent } from "@/lib/audit";

type RetentionBody = {
  apply?: boolean;
  retentionDays?: number;
};

const RETAINED_CASE_PLACEHOLDER = "[REDACTED_BY_RETENTION_POLICY]";

export async function POST(request: NextRequest) {
  const allowed = await requirePermission(request, "tenant.admin");
  if (!allowed.ok) {
    return allowed.response;
  }

  let body: RetentionBody = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const apply = Boolean(body.apply);
  const retentionDays =
    typeof body.retentionDays === "number" && body.retentionDays > 0
      ? Math.floor(body.retentionDays)
      : SECURITY_CONFIG.retentionResolvedCaseDays;

  const thresholdDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const candidateCases = await prisma.case.findMany({
    where: {
      tenantId: allowed.user.tenantId,
      status: "RESOLVED",
      updatedAt: {
        lte: thresholdDate,
      },
    },
    select: {
      id: true,
      externalId: true,
    },
  });

  if (!apply) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      retentionDays,
      thresholdDate: thresholdDate.toISOString(),
      totalCasesCandidate: candidateCases.length,
      sampleCases: candidateCases.slice(0, 20).map((item) => item.externalId),
      nextAction: "Envie apply=true para aplicar o expurgo/anomização.",
    });
  }

  const caseIds = candidateCases.map((item) => item.id);
  const externalIds = candidateCases.map((item) => item.externalId);
  const now = new Date();

  const applied = await prisma.$transaction(async (tx) => {
    if (caseIds.length > 0) {
      await tx.whistleblowerAccessToken.deleteMany({
        where: {
          tenantId: allowed.user.tenantId,
          caseId: {
            in: caseIds,
          },
        },
      });

      await tx.caseMessage.updateMany({
        where: {
          tenantId: allowed.user.tenantId,
          caseId: {
            in: caseIds,
          },
        },
        data: {
          content: RETAINED_CASE_PLACEHOLDER,
        },
      });

      await tx.case.updateMany({
        where: {
          tenantId: allowed.user.tenantId,
          id: {
            in: caseIds,
          },
        },
        data: {
          title: RETAINED_CASE_PLACEHOLDER,
          description: RETAINED_CASE_PLACEHOLDER,
          updatedAt: now,
        },
      });
    }

    await createImmutableAuditEvent(tx, {
      tenantId: allowed.user.tenantId,
      actorUserId: allowed.user.id,
      action: "PRIVACY_RETENTION_APPLIED",
      payload: {
        retentionDays,
        thresholdDate: thresholdDate.toISOString(),
        totalCasesUpdated: caseIds.length,
      },
      metadata: {
        externalIds,
      },
    });

    return {
      totalCasesUpdated: caseIds.length,
      externalIds,
    };
  });

  return NextResponse.json({
    ok: true,
    dryRun: false,
    retentionDays,
    thresholdDate: thresholdDate.toISOString(),
    totalCasesUpdated: applied.totalCasesUpdated,
    updatedCases: applied.externalIds,
  });
}
