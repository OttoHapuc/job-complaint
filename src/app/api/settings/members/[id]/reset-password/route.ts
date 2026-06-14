import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { createImmutableAuditEvent } from "@/lib/audit";
import { sendMemberPasswordResetNotification } from "@/lib/notifications";
import { verifyEmailForSend } from "@/lib/mail";

type ResetPasswordBody = {
  password?: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const allowed = await requirePermission(request, "tenant.manage_members");
  if (!allowed.ok) {
    return allowed.response;
  }

  const { id } = await context.params;
  let body: ResetPasswordBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const password = body.password?.trim();
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Informe uma senha temporária com no mínimo 8 caracteres." },
      { status: 400 },
    );
  }

  const member = await prisma.user.findFirst({
    where: { id, tenantId: allowed.user.tenantId },
    include: { tenant: { select: { name: true, code: true } } },
  });
  if (!member) {
    return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });
  }
  if (member.isCorporateAccount) {
    return NextResponse.json(
      { error: "A conta corporativa não pode ser redefinida por este fluxo." },
      { status: 403 },
    );
  }

  const deliverability = await verifyEmailForSend(member.email);
  if (!deliverability.ok) {
    return NextResponse.json(
      { error: deliverability.detail ?? "E-mail do membro não pode receber notificações." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: member.id },
      data: {
        password: passwordHash,
        mustChangePassword: true,
        passwordChangedAt: null,
      },
    });
    await createImmutableAuditEvent(tx, {
      tenantId: allowed.user.tenantId,
      actorUserId: allowed.user.id,
      action: "TENANT_MEMBER_PASSWORD_RESET",
      payload: {
        targetUserId: member.id,
        memberId: member.id,
        memberEmail: member.email,
      },
    });
  });

  const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const mail = await sendMemberPasswordResetNotification({
    to: member.email,
    tenantName: member.tenant.name,
    tenantCode: member.tenant.code,
    memberName: member.name,
    loginUrl: `${appUrl}/auth/login`,
  });

  return NextResponse.json({
    ok: true,
    mustChangePassword: true,
    passwordResetAt: now.toISOString(),
    emailDelivered: mail.delivered,
    emailBlocked: mail.blocked ?? [],
  });
}
