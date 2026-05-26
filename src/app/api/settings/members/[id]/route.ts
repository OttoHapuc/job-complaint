import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { createImmutableAuditEvent } from "@/lib/audit";

type UpdateMemberBody = {
  name?: string;
  companyRole?: string;
  isActive?: boolean;
};

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const allowed = await requirePermission(request, "tenant.manage_members");
  if (!allowed.ok) {
    return allowed.response;
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  let body: UpdateMemberBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const name = body.name?.trim();
  const companyRole = body.companyRole?.trim();
  const isActive = body.isActive;

  const existing = await prisma.user.findFirst({
    where: {
      id,
      tenantId: allowed.user.tenantId,
    },
    select: {
      id: true,
      name: true,
      companyRole: true,
      isCorporateAccount: true,
      isActive: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });
  }

  if (existing.isCorporateAccount) {
    return NextResponse.json(
      { error: "Conta corporativa não é editável por este endpoint." },
      { status: 403 },
    );
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
      where: { id: existing.id },
      data: {
        name: name || undefined,
        companyRole: companyRole || undefined,
        isActive,
      },
      select: {
        id: true,
        name: true,
        email: true,
        companyRole: true,
        isCorporateAccount: true,
        isActive: true,
        createdAt: true,
      },
    });

      await createImmutableAuditEvent(tx, {
        tenantId: allowed.user.tenantId,
        actorUserId: allowed.user.id,
        action: "TENANT_MEMBER_UPDATED",
        payload: {
          memberId: user.id,
          previousCompanyRole: existing.companyRole,
          newCompanyRole: user.companyRole,
          previousIsActive: existing.isActive,
          newIsActive: user.isActive,
        },
      });

      return user;
    });

    return NextResponse.json({ ok: true, member: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível atualizar membro." },
      { status: 400 },
    );
  }
}
