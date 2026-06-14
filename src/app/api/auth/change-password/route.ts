import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { getSessionFromRequest } from "@/lib/session";
import { createImmutableAuditEvent } from "@/lib/audit";

type ChangePasswordBody = {
  currentPassword?: string;
  newPassword?: string;
};

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: ChangePasswordBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const currentPassword = body.currentPassword?.trim();
  const newPassword = body.newPassword?.trim();
  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Informe a senha atual e a nova senha." },
      { status: 400 },
    );
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "A nova senha deve ter no mínimo 8 caracteres." },
      { status: 400 },
    );
  }
  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: "A nova senha deve ser diferente da senha atual." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findFirst({
    where: { id: session.sub, tenantId: session.tenantId },
    select: {
      id: true,
      tenantId: true,
      email: true,
      password: true,
      isActive: true,
      mustChangePassword: true,
    },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Usuário inválido ou inativo." }, { status: 403 });
  }

  const validCurrent = await verifyPassword(user.password, currentPassword);
  if (!validCurrent) {
    return NextResponse.json({ error: "Senha atual incorreta." }, { status: 401 });
  }

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        mustChangePassword: false,
        passwordChangedAt: now,
      },
    });
    await createImmutableAuditEvent(tx, {
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "AUTH_PASSWORD_CHANGED",
      payload: {
        targetUserId: user.id,
        forcedRotation: user.mustChangePassword,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    mustChangePassword: false,
    passwordChangedAt: now.toISOString(),
  });
}
