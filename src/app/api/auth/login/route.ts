import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signAccessToken, verifyPassword } from "@/lib/auth";
import { maybeBootstrapFirstAdmin } from "@/lib/tenancy";
import { setSessionCookie } from "@/lib/session";
import { createImmutableAuditEvent } from "@/lib/audit";
import { applyRateLimit } from "@/lib/rate-limit";
import { buildRateLimitKey } from "@/lib/request";
import { SECURITY_CONFIG } from "@/lib/config";

type LoginBody = {
  email?: string;
  password?: string;
  tenantCode?: string;
};

export async function POST(request: NextRequest) {
  const rateLimit = applyRateLimit(
    buildRateLimitKey("auth-login", request),
    SECURITY_CONFIG.rateLimitMaxLoginAttempts,
    SECURITY_CONFIG.rateLimitWindowMs,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas de login. Tente novamente em instantes." },
      { status: 429 },
    );
  }

  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();
  const tenantCode = body.tenantCode?.trim().toLowerCase();

  if (!email || !password) {
    return NextResponse.json({ error: "E-mail e senha são obrigatórios." }, { status: 400 });
  }

  await maybeBootstrapFirstAdmin(email, password);

  const user = await prisma.user.findFirst({
    where: {
      email,
      tenant: tenantCode ? { code: tenantCode } : undefined,
    },
    include: {
      tenant: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
  }

  const isValid = await verifyPassword(user.password, password);
  if (!isValid) {
    return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
  }
  if (!user.isActive) {
    return NextResponse.json({ error: "Usuário inativo. Contate o RH/Conselho." }, { status: 403 });
  }

  const token = signAccessToken({
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
  });

  await prisma.$transaction(async (tx) => {
    await createImmutableAuditEvent(tx, {
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "AUTH_LOGIN",
      metadata: {
        source: "password",
      },
      payload: {
        authMethod: "password",
        email: user.email,
      },
    });
  });

  const response = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      companyRole: user.companyRole,
      isCorporateAccount: user.isCorporateAccount,
      accountType: user.isCorporateAccount ? "CORPORATE" : "PROFESSIONAL",
      isActive: user.isActive,
      tenantName: user.tenant.name,
    },
  });
  setSessionCookie(response, token);
  return response;
}
