import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    include: { tenant: true },
  });

  if (!user || user.tenantId !== session.tenantId) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json(
      { authenticated: false, error: "Usuário inativo. Contate o RH/Conselho." },
      { status: 403 },
    );
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      companyRole: user.companyRole,
      isCorporateAccount: user.isCorporateAccount,
      accountType: user.isCorporateAccount ? "CORPORATE" : "PROFESSIONAL",
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
      tenantName: user.tenant.name,
    },
  });
}
