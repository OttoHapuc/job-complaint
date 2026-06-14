import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPolicyUserFromRequest, hasPermission } from "@/lib/permissions";
import { listAccountActivity } from "@/lib/account-activity";

export async function GET(request: NextRequest) {
  const policyUser = await getPolicyUserFromRequest(request);
  if (!policyUser) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!policyUser.isActive) {
    return NextResponse.json({ error: "Usuário inativo." }, { status: 403 });
  }

  const requestedUserId = request.nextUrl.searchParams.get("userId")?.trim();
  const cursor = request.nextUrl.searchParams.get("cursor");
  const limit = Number(request.nextUrl.searchParams.get("limit") || "20");

  let targetUserId = policyUser.id;
  if (requestedUserId && requestedUserId !== policyUser.id) {
    const canInspect = hasPermission(policyUser, "tenant.manage_members");
    if (!canInspect) {
      return NextResponse.json({ error: "Sem permissão para ver atividade de outros usuários." }, { status: 403 });
    }
    const member = await prisma.user.findFirst({
      where: { id: requestedUserId, tenantId: policyUser.tenantId },
      select: { id: true, name: true, email: true, lastLoginAt: true, passwordChangedAt: true, mustChangePassword: true },
    });
    if (!member) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    targetUserId = member.id;
  }

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, tenantId: policyUser.tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      lastLoginAt: true,
      passwordChangedAt: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });
  if (!target) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  const activity = await listAccountActivity({
    tenantId: policyUser.tenantId,
    userId: targetUserId,
    cursor,
    limit,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: target.id,
      name: target.name,
      email: target.email,
      lastLoginAt: target.lastLoginAt?.toISOString() ?? null,
      passwordChangedAt: target.passwordChangedAt?.toISOString() ?? null,
      mustChangePassword: target.mustChangePassword,
      createdAt: target.createdAt.toISOString(),
    },
    activity,
  });
}
