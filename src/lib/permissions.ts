import { type User } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/session";

export type Permission =
  | "tenant.admin"
  | "tenant.read_plan"
  | "tenant.manage_members"
  | "tenant.manage_plan"
  | "case.read"
  | "case.investigate"
  | "case.vote_close"
  | "case.resolve"
  | "ops.audit_verify"
  | "ops.audit_rebaseline";

export type SessionUserWithPolicy = Pick<
  User,
  "id" | "tenantId" | "email" | "isActive" | "companyRole" | "isCorporateAccount"
>;

export async function getPolicyUserFromRequest(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return null;

  return prisma.user.findFirst({
    where: {
      id: session.sub,
      tenantId: session.tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      email: true,
      isActive: true,
      companyRole: true,
      isCorporateAccount: true,
    },
  });
}

export function hasPermission(user: SessionUserWithPolicy, permission: Permission) {
  if (!user.isActive) return false;
  if (permission === "tenant.admin") {
    return user.isCorporateAccount;
  }
  if (user.isCorporateAccount) {
    const CORPORATE_PERMISSIONS: Permission[] = [
      "tenant.read_plan",
      "tenant.manage_members",
      "tenant.manage_plan",
      "ops.audit_rebaseline",
      "ops.audit_verify",
      "tenant.admin",
    ];
    return CORPORATE_PERMISSIONS.includes(permission);
  }
  const COUNCIL_PERMISSIONS: Permission[] = [
    "case.read",
    "case.investigate",
    "case.vote_close",
    "case.resolve",
    "ops.audit_verify",
  ];
  return COUNCIL_PERMISSIONS.includes(permission);
}

export function canVoteAsCommittee(user: SessionUserWithPolicy) {
  return hasPermission(user, "case.vote_close");
}

export async function requirePermission(
  request: NextRequest,
  permission: Permission,
) {
  const policyUser = await getPolicyUserFromRequest(request);
  if (!policyUser) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }
  if (!hasPermission(policyUser, permission)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Sem permissão." }, { status: 403 }),
    };
  }
  return {
    ok: true as const,
    user: policyUser,
  };
}
