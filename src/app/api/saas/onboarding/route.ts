import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, signAccessToken } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { applyRateLimit } from "@/lib/rate-limit";
import { buildRateLimitKey } from "@/lib/request";
import { SECURITY_CONFIG } from "@/lib/config";
import { createImmutableAuditEvent } from "@/lib/audit";
import { suggestPlanByEmployees } from "@/lib/saas-plan";
import { isPlausibleEmailAddress, uniqueNormalizedEmails, verifyEmailForSend } from "@/lib/mail";
import { sendOnboardingWelcomeNotification } from "@/lib/notifications";

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

async function validateOnboardingEmails(input: {
  billingEmail?: string;
  corporateLoginEmail: string;
  professionalEmail: string;
}) {
  const emails = uniqueNormalizedEmails([
    input.billingEmail,
    input.corporateLoginEmail,
    input.professionalEmail,
  ]);

  for (const email of emails) {
    if (!isPlausibleEmailAddress(email)) {
      return {
        ok: false as const,
        error: `E-mail inválido ou não permitido: ${email}`,
      };
    }
  }

  for (const email of emails) {
    const verification = await verifyEmailForSend(email);
    if (!verification.ok) {
      return {
        ok: false as const,
        error: `${email}: ${verification.detail ?? "não pode receber e-mails."}`,
      };
    }
  }

  return { ok: true as const, emails };
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
  const billingEmail = body.billingEmail?.trim().toLowerCase() || null;
  const estimatedEmployees = Math.max(1, Math.floor(body.estimatedEmployees ?? 50));
  const acceptedTerms = body.acceptedTerms === true;
  const acceptedPrivacy = body.acceptedPrivacy === true;
  const unifiedAccount = corporateLoginEmail === professionalEmail;

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

  if (unifiedAccount && corporateLoginPassword !== professionalPassword) {
    return NextResponse.json(
      {
        error:
          "Quando o e-mail corporativo e o profissional são iguais, use a mesma senha nos dois campos.",
      },
      { status: 400 },
    );
  }

  const emailValidation = await validateOnboardingEmails({
    billingEmail: billingEmail ?? undefined,
    corporateLoginEmail,
    professionalEmail,
  });
  if (!emailValidation.ok) {
    return NextResponse.json({ error: emailValidation.error }, { status: 400 });
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

  const loginPasswordHash = await hashPassword(
    unifiedAccount ? professionalPassword : corporateLoginPassword,
  );
  const professionalPasswordHash = unifiedAccount
    ? loginPasswordHash
    : await hashPassword(professionalPassword);
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
        billingEmail,
        websiteUrl: body.websiteUrl?.trim() || null,
        onboardingCompletedAt: now,
      },
    });

    let corporateUser: { id: string; email: string };
    let professionalUser: { id: string; name: string; email: string; companyRole: string };

    if (unifiedAccount) {
      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: professionalName,
          email: professionalEmail,
          password: professionalPasswordHash,
          companyRole: professionalCompanyRole,
          role: UserRole.ADMIN,
          isCorporateAccount: true,
          isActive: true,
        },
      });
      corporateUser = { id: owner.id, email: owner.email };
      professionalUser = {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        companyRole: owner.companyRole,
      };
    } else {
      const corporate = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: "Conta Corporativa",
          email: corporateLoginEmail,
          password: loginPasswordHash,
          companyRole: "Conta Corporativa",
          isCorporateAccount: true,
          isActive: true,
        },
      });
      const professional = await tx.user.create({
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
      corporateUser = { id: corporate.id, email: corporate.email };
      professionalUser = {
        id: professional.id,
        name: professional.name,
        email: professional.email,
        companyRole: professional.companyRole,
      };
    }

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
        unifiedAccount,
        uniqueEmails: emailValidation.emails,
      },
    });

    return { tenant, corporateUser, professionalUser, unifiedAccount };
  });

  const sessionUserId = created.unifiedAccount
    ? created.professionalUser.id
    : created.corporateUser.id;
  const sessionEmail = created.unifiedAccount
    ? created.professionalUser.email
    : created.corporateUser.email;

  const token = signAccessToken({
    sub: sessionUserId,
    tenantId: created.tenant.id,
    email: sessionEmail,
  });

  const appUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const welcomeRecipients = uniqueNormalizedEmails([
    created.corporateUser.email,
    created.unifiedAccount ? null : created.professionalUser.email,
  ]);
  const welcomeResults = await Promise.all(
    welcomeRecipients.map((to) =>
      sendOnboardingWelcomeNotification({
        to,
        tenantName: created.tenant.name,
        tenantCode: created.tenant.code,
        loginUrl: `${appUrl}/auth/login`,
      }),
    ),
  );

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
    unifiedAccount: created.unifiedAccount,
    corporateLogin: {
      id: created.corporateUser.id,
      email: created.corporateUser.email,
      accountType: created.unifiedAccount ? "UNIFIED" : "CORPORATE",
    },
    firstProfessional: {
      id: created.professionalUser.id,
      name: created.professionalUser.name,
      email: created.professionalUser.email,
      companyRole: created.professionalUser.companyRole,
      accountType: created.unifiedAccount ? "UNIFIED" : "PROFESSIONAL",
    },
    welcomeEmails: {
      attempted: welcomeRecipients.length,
      delivered: welcomeResults.filter((item) => item.delivered).length,
    },
  });
  setSessionCookie(response, token);
  return response;
}
