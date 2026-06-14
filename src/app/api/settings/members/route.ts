import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { hashPassword } from "@/lib/auth";
import { createImmutableAuditEvent } from "@/lib/audit";
import { isPlausibleEmailAddress, verifyEmailForSend } from "@/lib/mail";
import { sendMemberWelcomeNotification } from "@/lib/notifications";

type CreateMemberBody = {
  name?: string;
  companyRole?: string;
  email?: string;
  password?: string;
  isActive?: boolean;
};

export async function GET(request: NextRequest) {
  const allowed = await requirePermission(request, "tenant.manage_members");
  if (!allowed.ok) {
    return allowed.response;
  }

  const members = await prisma.user.findMany({
    where: {
      tenantId: allowed.user.tenantId,
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      companyRole: true,
      email: true,
      isCorporateAccount: true,
      isActive: true,
      mustChangePassword: true,
      createdAt: true,
      lastLoginAt: true,
      passwordChangedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    members,
  });
}

export async function POST(request: NextRequest) {
  const allowed = await requirePermission(request, "tenant.manage_members");
  if (!allowed.ok) {
    return allowed.response;
  }

  let body: CreateMemberBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const name = body.name?.trim();
  const companyRole = body.companyRole?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();
  const isActive = body.isActive !== false;

  if (!name || !companyRole || !email || !password) {
    return NextResponse.json(
      { error: "Campos obrigatórios: name, companyRole, email, password." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "A senha deve ter pelo menos 8 caracteres." },
      { status: 400 },
    );
  }

  if (!isPlausibleEmailAddress(email)) {
    return NextResponse.json({ error: "E-mail inválido ou não permitido." }, { status: 400 });
  }

  const deliverability = await verifyEmailForSend(email);
  if (!deliverability.ok) {
    return NextResponse.json(
      { error: deliverability.detail ?? "E-mail não pode receber mensagens." },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: {
      tenantId_email: {
        tenantId: allowed.user.tenantId,
        email,
      },
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Já existe membro com este e-mail." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
      data: {
        tenantId: allowed.user.tenantId,
        name,
        email,
        password: passwordHash,
        companyRole,
        isCorporateAccount: false,
        isActive,
        mustChangePassword: true,
      },
      select: {
        id: true,
        name: true,
        companyRole: true,
        email: true,
        isCorporateAccount: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        lastLoginAt: true,
        passwordChangedAt: true,
      },
    });

      await createImmutableAuditEvent(tx, {
      tenantId: allowed.user.tenantId,
      actorUserId: allowed.user.id,
      action: "TENANT_MEMBER_CREATED",
      payload: {
        memberId: user.id,
        targetUserId: user.id,
        companyRole: user.companyRole,
        isActive: user.isActive,
      },
    });

      return user;
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: allowed.user.tenantId },
      select: { name: true, code: true },
    });
    const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const mail = tenant
      ? await sendMemberWelcomeNotification({
          to: created.email,
          tenantName: tenant.name,
          tenantCode: tenant.code,
          memberName: created.name,
          loginUrl: `${appUrl}/auth/login`,
        })
      : { delivered: false, blocked: [] };

    return NextResponse.json({
      ok: true,
      member: created,
      emailDelivered: mail.delivered,
      emailBlocked: "blocked" in mail ? mail.blocked : [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível criar membro." },
      { status: 400 },
    );
  }
}
