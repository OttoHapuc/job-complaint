import { prisma } from "@/lib/prisma";
import { uniqueNormalizedEmails } from "@/lib/mail/recipients";

export async function loadActiveCommitteeEmails(tenantId: string) {
  const members = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      isCorporateAccount: false,
    },
    select: { email: true },
  });
  return uniqueNormalizedEmails(members.map((member) => member.email));
}

export async function loadCommitteeCaseContext(tenantId: string, caseId: string) {
  const [reportCase, emails] = await Promise.all([
    prisma.case.findUnique({
      where: { id: caseId },
      select: {
        externalId: true,
        category: true,
        tenant: { select: { name: true } },
      },
    }),
    loadActiveCommitteeEmails(tenantId),
  ]);
  if (!reportCase || emails.length === 0) return null;
  return {
    to: emails,
    tenantName: reportCase.tenant.name,
    caseExternalId: reportCase.externalId,
    category: reportCase.category,
  };
}
