import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { decryptSensitiveText } from "@/lib/secure-data";

export async function GET(request: NextRequest) {
  const allowed = await requirePermission(request, "case.read");
  if (!allowed.ok) return allowed.response;
  if (allowed.user.isCorporateAccount) {
    return NextResponse.json(
      { error: "Registro de implicados disponível apenas para o conselho." },
      { status: 403 },
    );
  }

  const query = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const tenantId = allowed.user.tenantId;

  const people = await prisma.caseImplicatedPerson.findMany({
    where: {
      tenantId,
      case: {
        NOT: {
          restrictedUserIds: {
            has: allowed.user.id,
          },
        },
      },
    },
    orderBy: [{ lastMentionedAt: "desc" }, { mentionCount: "desc" }],
    select: {
      id: true,
      caseId: true,
      displayNameHash: true,
      displayNameEncrypted: true,
      roleHint: true,
      mentionCount: true,
      firstMentionedAt: true,
      lastMentionedAt: true,
      case: {
        select: {
          externalId: true,
          status: true,
        },
      },
    },
  });

  const grouped = new Map<
    string,
    {
      displayNameHash: string;
      visibleLabel: string;
      roleHint: string;
      totalMentions: number;
      distinctCases: number;
      lastMentionedAt: string;
      cases: Array<{ externalId: string; status: string; mentionCount: number }>;
    }
  >();

  for (const person of people) {
    const label = decryptSensitiveText(person.displayNameEncrypted) || "Identidade protegida";
    if (query && !label.toLowerCase().includes(query) && !(person.roleHint ?? "").toLowerCase().includes(query)) {
      continue;
    }

    const existing = grouped.get(person.displayNameHash);
    const caseEntry = {
      externalId: person.case.externalId,
      status: person.case.status,
      mentionCount: person.mentionCount,
    };

    if (!existing) {
      grouped.set(person.displayNameHash, {
        displayNameHash: person.displayNameHash,
        visibleLabel: label,
        roleHint: person.roleHint ?? "Sem papel informado",
        totalMentions: person.mentionCount,
        distinctCases: 1,
        lastMentionedAt: person.lastMentionedAt.toISOString(),
        cases: [caseEntry],
      });
      continue;
    }

    existing.totalMentions += person.mentionCount;
    if (!existing.cases.some((item) => item.externalId === caseEntry.externalId)) {
      existing.distinctCases += 1;
      existing.cases.push(caseEntry);
    }
    if (person.lastMentionedAt.toISOString() > existing.lastMentionedAt) {
      existing.lastMentionedAt = person.lastMentionedAt.toISOString();
      existing.visibleLabel = label;
      existing.roleHint = person.roleHint ?? "Sem papel informado";
    }
  }

  const items = Array.from(grouped.values()).sort((a, b) => {
    if (b.distinctCases !== a.distinctCases) return b.distinctCases - a.distinctCases;
    return b.totalMentions - a.totalMentions;
  });

  return NextResponse.json({
    ok: true,
    query,
    total: items.length,
    people: items,
  });
}
