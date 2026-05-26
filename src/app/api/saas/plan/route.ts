import { NextRequest, NextResponse } from "next/server";
import { PlanCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { createImmutableAuditEvent } from "@/lib/audit";
import { PLAN_CATALOG, getPlanByCode, planDescription } from "@/lib/saas-plan";

type UpdatePlanBody = {
  planCode?: "STARTER" | "BUSINESS" | "ENTERPRISE";
  seatLimit?: number;
  aiMonthlyLimit?: number;
  billingEmail?: string | null;
};

export async function GET(request: NextRequest) {
  const allowed = await requirePermission(request, "tenant.read_plan");
  if (!allowed.ok) {
    return allowed.response;
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [tenant, usersCount, aiUsedThisMonth] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: allowed.user.tenantId },
      select: {
        id: true,
        name: true,
        code: true,
        planCode: true,
        seatLimit: true,
        aiMonthlyLimit: true,
        billingEmail: true,
      },
    }),
    prisma.user.count({
      where: { tenantId: allowed.user.tenantId },
    }),
    prisma.auditEvent.count({
      where: {
        tenantId: allowed.user.tenantId,
        action: "AI_TRIAGE_COMPLETED",
        createdAt: {
          gte: startOfMonth,
        },
      },
    }),
  ]);

  if (!tenant) {
    return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    tenant: {
      ...tenant,
      planName: planDescription(tenant.planCode),
      seatsUsed: usersCount,
      seatsAvailable: Math.max(0, tenant.seatLimit - usersCount),
      seatUsagePercent: tenant.seatLimit > 0 ? Math.round((usersCount / tenant.seatLimit) * 100) : 0,
      aiUsedThisMonth,
      aiRemainingThisMonth: Math.max(0, tenant.aiMonthlyLimit - aiUsedThisMonth),
    },
    availablePlans: PLAN_CATALOG,
  });
}

export async function POST(request: NextRequest) {
  const allowed = await requirePermission(request, "tenant.manage_plan");
  if (!allowed.ok) {
    return allowed.response;
  }

  let body: UpdatePlanBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  let planCode: PlanCode | undefined;
  if (body.planCode) {
    planCode = PlanCode[body.planCode];
  }

  let seatLimit = typeof body.seatLimit === "number" ? Math.floor(body.seatLimit) : undefined;
  let aiMonthlyLimit =
    typeof body.aiMonthlyLimit === "number" ? Math.floor(body.aiMonthlyLimit) : undefined;

  if (planCode && (!seatLimit || !aiMonthlyLimit)) {
    const selected = getPlanByCode(planCode);
    seatLimit = seatLimit ?? selected.seatLimit;
    aiMonthlyLimit = aiMonthlyLimit ?? selected.aiMonthlyLimit;
  }

  if ((seatLimit !== undefined && seatLimit < 1) || (aiMonthlyLimit !== undefined && aiMonthlyLimit < 1)) {
    return NextResponse.json({ error: "Limites inválidos para o plano." }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const currentTenant = await tx.tenant.findUnique({
      where: { id: allowed.user.tenantId },
      select: {
        planCode: true,
        seatLimit: true,
        aiMonthlyLimit: true,
      },
    });

    const tenant = await tx.tenant.update({
      where: { id: allowed.user.tenantId },
      data: {
        planCode,
        seatLimit,
        aiMonthlyLimit,
        billingEmail:
          body.billingEmail !== undefined ? body.billingEmail?.trim().toLowerCase() || null : undefined,
      },
      select: {
        id: true,
        name: true,
        code: true,
        planCode: true,
        seatLimit: true,
        aiMonthlyLimit: true,
        billingEmail: true,
      },
    });

    await createImmutableAuditEvent(tx, {
      tenantId: allowed.user.tenantId,
      actorUserId: allowed.user.id,
      action: "TENANT_PLAN_UPDATED",
      payload: {
        previousPlanCode: currentTenant?.planCode ?? null,
        planCode: tenant.planCode,
        previousSeatLimit: currentTenant?.seatLimit ?? null,
        seatLimit: tenant.seatLimit,
        previousAiMonthlyLimit: currentTenant?.aiMonthlyLimit ?? null,
        aiMonthlyLimit: tenant.aiMonthlyLimit,
      },
    });

    return tenant;
  });

  return NextResponse.json({
    ok: true,
    tenant: {
      ...updated,
      planName: planDescription(updated.planCode),
    },
  });
}
