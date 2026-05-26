import { PrismaClient } from "@prisma/client";

const LEADERSHIP_PATTERN = /\b(owner|dono|diretor|director)\b/i;

export async function getCouncilComposition(
  prismaLike: Pick<PrismaClient, "user">,
  tenantId: string,
) {
  const members = await prismaLike.user.findMany({
    where: {
      tenantId,
      isActive: true,
    },
    select: {
      id: true,
      companyRole: true,
      email: true,
      name: true,
    },
  });

  const hasLeadership = members.some((m) => LEADERSHIP_PATTERN.test(m.companyRole));
  const committeeCount = members.length;

  return {
    members,
    hasLeadership,
    committeeCount,
    valid: hasLeadership && committeeCount >= 2,
  };
}

export async function ensureCouncilComposition(
  prismaLike: Pick<PrismaClient, "user">,
  tenantId: string,
) {
  const composition = await getCouncilComposition(prismaLike, tenantId);
  if (!composition.valid) {
    const reason = !composition.hasLeadership
      ? "Conselho inválido: adicione ao menos um membro ativo com cargo de liderança (ex.: dono/diretor)."
      : "Conselho inválido: é necessário no mínimo 2 membros ativos no comitê.";
    return { ok: false as const, reason, composition };
  }
  return { ok: true as const, composition };
}

export async function assertCouncilComposition(
  prismaLike: Pick<PrismaClient, "user">,
  tenantId: string,
) {
  const result = await ensureCouncilComposition(prismaLike, tenantId);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result.composition;
}
