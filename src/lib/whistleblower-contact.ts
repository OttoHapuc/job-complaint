import { Prisma } from "@prisma/client";
import { isPlausibleEmailAddress } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export function extractWhistleblowerEmail(contact: string) {
  const trimmed = contact.trim();
  if (!trimmed) return null;
  if (isPlausibleEmailAddress(trimmed)) return trimmed.toLowerCase();
  const match = trimmed.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  if (match && isPlausibleEmailAddress(match)) return match.toLowerCase();
  return null;
}

type RawIntakePayload = {
  whistleblowerContact?: string;
};

function parseIntakePayload(value: Prisma.JsonValue | null): RawIntakePayload {
  if (!value || typeof value !== "object") return {};
  return value as RawIntakePayload;
}

export async function loadWhistleblowerNotifyTargetByCaseId(caseId: string) {
  const [raw, reportCase] = await Promise.all([
    prisma.rawReport.findFirst({
      where: { caseId },
      orderBy: { createdAt: "desc" },
      select: { intakePayload: true },
    }),
    prisma.case.findUnique({
      where: { id: caseId },
      select: {
        externalId: true,
        tenant: { select: { name: true } },
      },
    }),
  ]);
  if (!raw || !reportCase) return null;
  const payload = parseIntakePayload(raw.intakePayload as Prisma.JsonValue | null);
  const email = extractWhistleblowerEmail(payload.whistleblowerContact ?? "");
  if (!email) return null;
  return {
    to: email,
    tenantName: reportCase.tenant.name,
    caseExternalId: reportCase.externalId,
  };
}
