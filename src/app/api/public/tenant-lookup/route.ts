import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";
import { buildRateLimitKey } from "@/lib/request";
import { SECURITY_CONFIG } from "@/lib/config";

export async function GET(request: NextRequest) {
  const rateLimit = applyRateLimit(
    buildRateLimitKey("public-tenant-lookup", request),
    Math.max(10, SECURITY_CONFIG.rateLimitMaxPublicReports * 2),
    SECURITY_CONFIG.rateLimitWindowMs,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas de consulta. Tente novamente em alguns minutos." },
      { status: 429 },
    );
  }

  const code = request.nextUrl.searchParams.get("code")?.trim().toLowerCase();
  if (!code) {
    return NextResponse.json({ error: "Parâmetro code é obrigatório." }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { code },
    select: {
      id: true,
      name: true,
      code: true,
      users: {
        where: { isActive: true, isCorporateAccount: false },
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          companyRole: true,
        },
      },
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      code: tenant.code,
    },
    activeMembers: tenant.users,
  });
}
