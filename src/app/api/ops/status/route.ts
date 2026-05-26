import { NextResponse } from "next/server";
import { CaseStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createRequestId, logError, logInfo } from "@/lib/logger";

export async function GET() {
  const requestId = createRequestId();
  const now = new Date();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const [openCases, escalatedCases, casesCreated24h, aiEvents24h, tenantsCount] = await Promise.all([
      prisma.case.count({
        where: {
          status: {
            in: [CaseStatus.OPEN, CaseStatus.IN_REVIEW, CaseStatus.WAITING_RESPONSE],
          },
        },
      }),
      prisma.case.count({
        where: {
          status: CaseStatus.ESCALATED,
        },
      }),
      prisma.case.count({
        where: {
          createdAt: {
            gte: since24h,
          },
        },
      }),
      prisma.auditEvent.count({
        where: {
          action: "AI_TRIAGE_COMPLETED",
          createdAt: {
            gte: since24h,
          },
        },
      }),
      prisma.tenant.count(),
    ]);

    const payload = {
      ok: true,
      status: "operational",
      requestId,
      generatedAt: now.toISOString(),
      windowHours: 24,
      metrics: {
        tenantsCount,
        openCases,
        escalatedCases,
        casesCreated24h,
        aiTriages24h: aiEvents24h,
      },
    };

    logInfo("ops.status.generated", {
      requestId,
      scope: "ops.status",
      data: payload.metrics,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown status error";
    logError("ops.status.failed", {
      requestId,
      scope: "ops.status",
      data: { error: message },
    });
    return NextResponse.json(
      {
        ok: false,
        status: "degraded",
        requestId,
        error: message,
        generatedAt: now.toISOString(),
      },
      { status: 503 },
    );
  }
}
