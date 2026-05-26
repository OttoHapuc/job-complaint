import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { hashPassword } from "@/lib/auth";
import { createImmutableAuditEvent } from "@/lib/audit";

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
      createdAt: true,
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
      },
      select: {
        id: true,
        name: true,
        companyRole: true,
        email: true,
        isCorporateAccount: true,
        isActive: true,
        createdAt: true,
      },
    });

      await createImmutableAuditEvent(tx, {
      tenantId: allowed.user.tenantId,
      actorUserId: allowed.user.id,
      action: "TENANT_MEMBER_CREATED",
      payload: {
        memberId: user.id,
        companyRole: user.companyRole,
        isActive: user.isActive,
      },
    });

      return user;
    });

    return NextResponse.json({ ok: true, member: created });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível criar membro." },
      { status: 400 },
    );
  }
}
