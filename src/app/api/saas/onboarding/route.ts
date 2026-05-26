import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signAccessToken } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { buildRateLimitKey } from "@/lib/request";
import { SECURITY_CONFIG } from "@/lib/config";
import { createImmutableAuditEvent } from "@/lib/audit";
import { suggestPlanByEmployees } from "@/lib/saas-plan";

type OnboardingBody = {
  companyName?: string;
  companyCode?: string;
  websiteUrl?: string;
  billingEmail?: string;
  estimatedEmployees?: number;
  corporateLoginEmail?: string;
  corporateLoginPassword?: string;
  professionalName?: string;
  professionalCompanyRole?: string;
  professionalEmail?: string;
  professionalPassword?: string;
  acceptedTerms?: boolean;
  acceptedPrivacy?: boolean;
};

function normalizeCompanyCode(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function POST(request: NextRequest) {
  const rateLimit = applyRateLimit(
    buildRateLimitKey("saas-onboarding", request),
    Math.max(3, Math.floor(SECURITY_CONFIG.rateLimitMaxPublicReports / 2)),
    SECURITY_CONFIG.rateLimitWindowMs,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas de onboarding. Tente novamente em alguns minutos." },
      { status: 429 },
    );
  }

  let body: OnboardingBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const companyName = body.companyName?.trim();
  const companyCodeRaw = body.companyCode?.trim();
  const corporateLoginEmail = body.corporateLoginEmail?.trim().toLowerCase();
  const corporateLoginPassword = body.corporateLoginPassword?.trim();
  const professionalName = body.professionalName?.trim();
  const professionalCompanyRole = body.professionalCompanyRole?.trim();
  const professionalEmail = body.professionalEmail?.trim().toLowerCase();
  const professionalPassword = body.professionalPassword?.trim();
  const estimatedEmployees = Math.max(1, Math.floor(body.estimatedEmployees ?? 50));
  const acceptedTerms = body.acceptedTerms === true;
  const acceptedPrivacy = body.acceptedPrivacy === true;

  if (
    !companyName ||
    !companyCodeRaw ||
    !corporateLoginEmail ||
    !corporateLoginPassword ||
    !professionalName ||
    !professionalCompanyRole ||
    !professionalEmail ||
    !professionalPassword
  ) {
    return NextResponse.json(
      {
        error:
          "Campos obrigatórios: companyName, companyCode, corporateLoginEmail, corporateLoginPassword, professionalName, professionalCompanyRole, professionalEmail, professionalPassword.",
      },
      { status: 400 },
    );
  }
  if (!acceptedTerms || !acceptedPrivacy) {
    return NextResponse.json(
      { error: "É obrigatório aceitar os Termos de Uso e a Política de Privacidade." },
      { status: 400 },
    );
  }

  if (corporateLoginPassword.length < 8 || professionalPassword.length < 8) {
    return NextResponse.json(
      { error: "As senhas de login devem ter no mínimo 8 caracteres." },
      { status: 400 },
    );
  }
  if (corporateLoginEmail === professionalEmail) {
    return NextResponse.json(
      { error: "O e-mail corporativo e o e-mail profissional devem ser diferentes." },
      { status: 400 },
    );
  }

  const companyCode = normalizeCompanyCode(companyCodeRaw);
  if (!companyCode) {
    return NextResponse.json({ error: "Código da empresa inválido." }, { status: 400 });
  }

  const existingTenant = await prisma.tenant.findUnique({
    where: { code: companyCode },
    select: { id: true },
  });
  if (existingTenant) {
    return NextResponse.json(
      { error: "Este código de empresa já está em uso. Escolha outro." },
      { status: 409 },
    );
  }

  const [corporatePasswordHash, professionalPasswordHash] = await Promise.all([
    hashPassword(corporateLoginPassword),
    hashPassword(professionalPassword),
  ]);
  const plan = suggestPlanByEmployees(estimatedEmployees);
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: companyName,
        code: companyCode,
        planCode: plan.planCode,
        seatLimit: plan.seatLimit,
        aiMonthlyLimit: plan.aiMonthlyLimit,
        billingEmail: body.billingEmail?.trim().toLowerCase() || null,
        websiteUrl: body.websiteUrl?.trim() || null,
        onboardingCompletedAt: now,
      },
    });

    const corporateUser = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: "Conta Corporativa",
        email: corporateLoginEmail,
        password: corporatePasswordHash,
        companyRole: "Conta Corporativa",
        isCorporateAccount: true,
        isActive: true,
      },
    });
    const professionalUser = await tx.user.create({
      data: {
        tenantId: tenant.id,
        name: professionalName,
        email: professionalEmail,
        password: professionalPasswordHash,
        companyRole: professionalCompanyRole,
        isCorporateAccount: false,
        isActive: true,
      },
    });

    await createImmutableAuditEvent(tx, {
      tenantId: tenant.id,
      actorUserId: corporateUser.id,
      action: "TENANT_ONBOARDED_SELF_SERVICE",
      payload: {
        companyCode,
        planCode: plan.planCode,
        seatLimit: plan.seatLimit,
        aiMonthlyLimit: plan.aiMonthlyLimit,
        estimatedEmployees,
        acceptedTerms,
        acceptedPrivacy,
        professionalCompanyRole,
      },
    });

    return { tenant, corporateUser, professionalUser };
  });

  const token = signAccessToken({
    sub: created.corporateUser.id,
    tenantId: created.tenant.id,
    email: created.corporateUser.email,
  });

  const response = NextResponse.json({
    ok: true,
    tenant: {
      id: created.tenant.id,
      name: created.tenant.name,
      code: created.tenant.code,
      planCode: created.tenant.planCode,
      seatLimit: created.tenant.seatLimit,
      aiMonthlyLimit: created.tenant.aiMonthlyLimit,
    },
    corporateLogin: {
      id: created.corporateUser.id,
      email: created.corporateUser.email,
      accountType: "CORPORATE",
    },
    firstProfessional: {
      id: created.professionalUser.id,
      name: created.professionalUser.name,
      email: created.professionalUser.email,
      companyRole: created.professionalUser.companyRole,
      accountType: "PROFESSIONAL",
    },
  });
  setSessionCookie(response, token);
  return response;
}
