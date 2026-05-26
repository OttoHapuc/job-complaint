import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

const DEFAULT_TENANT_CODE = process.env.DEFAULT_TENANT_CODE?.toLowerCase() || "demo";
const DEFAULT_TENANT_NAME = process.env.DEFAULT_TENANT_NAME || "Empresa Demo";

export async function getOrCreateTenantByCode(code: string) {
  const normalizedCode = code.trim().toLowerCase();

  let tenant = await prisma.tenant.findUnique({
    where: { code: normalizedCode },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        code: normalizedCode,
        name: `Empresa ${normalizedCode.toUpperCase()}`,
      },
    });
  }

  return tenant;
}

export async function getTenantByCode(code: string) {
  const normalizedCode = code.trim().toLowerCase();
  return prisma.tenant.findUnique({
    where: { code: normalizedCode },
  });
}

export async function getDefaultTenant() {
  const tenant = await getOrCreateTenantByCode(DEFAULT_TENANT_CODE);
  if (tenant.name === `Empresa ${DEFAULT_TENANT_CODE.toUpperCase()}` && DEFAULT_TENANT_NAME !== tenant.name) {
    return prisma.tenant.update({
      where: { id: tenant.id },
      data: { name: DEFAULT_TENANT_NAME },
    });
  }
  return tenant;
}

export async function maybeBootstrapFirstAdmin(email: string, password: string) {
  const usersCount = await prisma.user.count();
  if (usersCount > 0) {
    return;
  }

  const tenant = await getDefaultTenant();
  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: email.toLowerCase().trim(),
      name: "Administrador Inicial",
      password: passwordHash,
      companyRole: "Conta Corporativa",
      isCorporateAccount: true,
      isActive: true,
    },
  });
}
