import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createImmutableAuditEvent, buildRebasedAuditChain } from "@/lib/audit";
import { requirePermission } from "@/lib/permissions";
const TENANT_CHAIN_KEY = "__tenant__";

type RebaselineBody = {
  caseExternalId?: string;
  apply?: boolean;
};

export async function POST(request: NextRequest) {
  const allowed = await requirePermission(request, "ops.audit_rebaseline");
  if (!allowed.ok) {
    return allowed.response;
  }

  let body: RebaselineBody = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const tenantId = allowed.user.tenantId;
  const caseExternalId = body.caseExternalId?.trim().toUpperCase();
  const apply = Boolean(body.apply);

  let caseIdFilter: string | undefined;
  if (caseExternalId) {
    const reportCase = await prisma.case.findFirst({
      where: {
        tenantId,
        externalId: caseExternalId,
      },
      select: {
        id: true,
      },
    });

    if (!reportCase) {
      return NextResponse.json({ error: "Caso não encontrado para este tenant." }, { status: 404 });
    }

    caseIdFilter = reportCase.id;
  }

  const events = await prisma.auditEvent.findMany({
    where: {
      tenantId,
      caseId: caseIdFilter,
    },
    orderBy: [{ caseId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      tenantId: true,
      caseId: true,
      actorUserId: true,
      action: true,
      metadata: true,
      immutableData: true,
      occurredAt: true,
      createdAt: true,
    },
  });

  const chains = new Map<string, typeof events>();
  for (const event of events) {
    const chainKey = event.caseId ?? TENANT_CHAIN_KEY;
    const chain = chains.get(chainKey) ?? [];
    chain.push(event);
    chains.set(chainKey, chain);
  }

  const rebasedByChain = new Map<string, ReturnType<typeof buildRebasedAuditChain>>();
  for (const [chainKey, chainEvents] of chains.entries()) {
    rebasedByChain.set(chainKey, buildRebasedAuditChain(chainEvents));
  }

  const totalEvents = events.length;
  const totalChains = rebasedByChain.size;
  const updatesPreview = Array.from(rebasedByChain.entries()).map(([chain, rebased]) => ({
    chain,
    events: rebased.length,
    firstIndex: rebased[0]?.eventIndex ?? null,
    lastIndex: rebased[rebased.length - 1]?.eventIndex ?? null,
    lastHash: rebased[rebased.length - 1]?.eventHash ?? null,
  }));

  if (!apply) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      tenantId,
      scope: caseExternalId ? "case" : "tenant",
      caseExternalId: caseExternalId ?? null,
      summary: {
        totalChains,
        totalEvents,
      },
      chains: updatesPreview,
      nextAction: "Envie apply=true para efetivar o rebaseline.",
    });
  }

  await prisma.$transaction(async (tx) => {
    for (const rebasedChain of rebasedByChain.values()) {
      for (const event of rebasedChain) {
        await tx.auditEvent.update({
          where: { id: event.id },
          data: {
            immutableData: event.immutableData,
            occurredAt: event.occurredAt,
            eventIndex: event.eventIndex,
            previousHash: event.previousHash,
            eventHash: event.eventHash,
          },
        });
      }
    }

    await createImmutableAuditEvent(tx, {
      tenantId,
      caseId: caseIdFilter ?? null,
      actorUserId: allowed.user.id,
      action: "AUDIT_CHAIN_REBASELINED",
      payload: {
        totalChains,
        totalEvents,
        caseExternalId: caseExternalId ?? null,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    dryRun: false,
    tenantId,
    scope: caseExternalId ? "case" : "tenant",
    caseExternalId: caseExternalId ?? null,
    summary: {
      totalChains,
      totalEventsRebased: totalEvents,
    },
    chains: updatesPreview,
  });
}
