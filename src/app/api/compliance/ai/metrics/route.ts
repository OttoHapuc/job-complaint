import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const allowed = await requirePermission(request, "tenant.read_plan");
  if (!allowed.ok) {
    return allowed.response;
  }

  const daysParam = Number(request.nextUrl.searchParams.get("days") || 30);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.floor(daysParam) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const events = await prisma.auditEvent.findMany({
    where: {
      tenantId: allowed.user.tenantId,
      action: {
        in: ["AI_TRIAGE_COMPLETED", "AI_REVIEW_ITERATION_COMPLETED"],
      },
      createdAt: {
        gte: since,
      },
    },
    select: {
      createdAt: true,
      caseId: true,
      immutableData: true,
      action: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  let totalTokens = 0;
  let totalEstimatedCostUsd = 0;
  let fallbackCount = 0;
  let openrouterCount = 0;
  const byAction = new Map<string, { requests: number; tokens: number; cost: number }>();

  const perDay = new Map<string, { requests: number; tokens: number; cost: number }>();

  for (const event of events) {
    const payload = (event.immutableData as { payload?: unknown } | null)?.payload as
      | {
          provider?: string;
          usage?: {
            totalTokens?: number;
            estimatedCostUsd?: number;
          };
        }
      | undefined;

    const provider = payload?.provider ?? "unknown";
    const tokens = Number(payload?.usage?.totalTokens ?? 0);
    const cost = Number(payload?.usage?.estimatedCostUsd ?? 0);

    if (provider === "fallback") fallbackCount += 1;
    if (provider === "openrouter") openrouterCount += 1;

    totalTokens += Number.isFinite(tokens) ? tokens : 0;
    totalEstimatedCostUsd += Number.isFinite(cost) ? cost : 0;

    const day = event.createdAt.toISOString().slice(0, 10);
    const current = perDay.get(day) ?? { requests: 0, tokens: 0, cost: 0 };
    current.requests += 1;
    current.tokens += Number.isFinite(tokens) ? tokens : 0;
    current.cost += Number.isFinite(cost) ? cost : 0;
    perDay.set(day, current);

    const actionKey = event.action;
    const actionCurrent = byAction.get(actionKey) ?? { requests: 0, tokens: 0, cost: 0 };
    actionCurrent.requests += 1;
    actionCurrent.tokens += Number.isFinite(tokens) ? tokens : 0;
    actionCurrent.cost += Number.isFinite(cost) ? cost : 0;
    byAction.set(actionKey, actionCurrent);
  }

  return NextResponse.json({
    ok: true,
    windowDays: days,
    summary: {
      totalRequests: events.length,
      openrouterCount,
      fallbackCount,
      totalTokens,
      totalEstimatedCostUsd: Number(totalEstimatedCostUsd.toFixed(6)),
      averageTokensPerRequest:
        events.length > 0 ? Math.round(totalTokens / events.length) : 0,
    },
    byDay: Array.from(perDay.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, data]) => ({
        day,
        requests: data.requests,
        tokens: data.tokens,
        estimatedCostUsd: Number(data.cost.toFixed(6)),
      })),
    byAction: Array.from(byAction.entries()).map(([action, data]) => ({
      action,
      requests: data.requests,
      tokens: data.tokens,
      estimatedCostUsd: Number(data.cost.toFixed(6)),
    })),
  });
}
