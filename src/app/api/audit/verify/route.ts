import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { computeAuditEventHash } from "@/lib/audit";
const TENANT_CHAIN_KEY = "__tenant__";

type ChainState = {
  previousHash: string | null;
  previousIndex: number;
};

type IntegrityIssue = {
  eventId: string;
  chain: string;
  eventIndex: number | null;
  reason: string;
};

export async function GET(request: NextRequest) {
  const allowed = await requirePermission(request, "ops.audit_verify");
  if (!allowed.ok) {
    return allowed.response;
  }

  const tenantId = allowed.user.tenantId;
  const caseExternalId = request.nextUrl.searchParams.get("caseExternalId")?.trim().toUpperCase();
  const strictParam = request.nextUrl.searchParams.get("strict")?.trim().toLowerCase();
  const strictMode = strictParam === "true" || strictParam === "1";

  let caseIdFilter: string | undefined;
  if (caseExternalId) {
    const reportCase = await prisma.case.findFirst({
      where: {
        tenantId,
        externalId: caseExternalId,
      },
      select: {
        id: true,
        externalId: true,
      },
    });

    if (!reportCase) {
      return NextResponse.json({ error: "Caso não encontrado para este tenant." }, { status: 404 });
    }

    caseIdFilter = reportCase.id;
  }

  const allEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId,
      caseId: caseIdFilter,
    },
    orderBy: [
      { caseId: "asc" },
      { eventIndex: "asc" },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      caseId: true,
      eventIndex: true,
      previousHash: true,
      eventHash: true,
      immutableData: true,
    },
  });

  const eventsInChain = allEvents.filter(
    (event) =>
      event.eventIndex !== null &&
      event.eventHash !== null &&
      event.immutableData !== null,
  );
  const legacyOrIncompleteEvents = allEvents.length - eventsInChain.length;
  const strictModeIssues: IntegrityIssue[] = [];
  if (strictMode && legacyOrIncompleteEvents > 0) {
    strictModeIssues.push({
      eventId: "legacy-or-incomplete",
      chain: caseIdFilter ?? TENANT_CHAIN_KEY,
      eventIndex: null,
      reason: `Strict mode: ${legacyOrIncompleteEvents} evento(s) legado(s) ou incompleto(s) encontrado(s) sem cadeia criptográfica completa.`,
    });
  }

  const caseIds = Array.from(
    new Set(
      eventsInChain
        .map((event) => event.caseId)
        .filter((caseId): caseId is string => caseId !== null),
    ),
  );
  const caseLabels = new Map<string, string>();
  if (caseIds.length > 0) {
    const cases = await prisma.case.findMany({
      where: {
        tenantId,
        id: { in: caseIds },
      },
      select: {
        id: true,
        externalId: true,
      },
    });
    for (const reportCase of cases) {
      caseLabels.set(reportCase.id, reportCase.externalId);
    }
  }

  const chains = new Map<string, ChainState>();
  const issues: IntegrityIssue[] = [];

  for (const event of eventsInChain) {
    const chainKey = event.caseId ?? TENANT_CHAIN_KEY;
    const currentState = chains.get(chainKey) ?? { previousHash: null, previousIndex: 0 };
    const expectedIndex = currentState.previousIndex + 1;
    const expectedPreviousHash = currentState.previousHash;
    const receivedEventIndex = event.eventIndex;
    if (receivedEventIndex === null) {
      continue;
    }
    const receivedPreviousHash = event.previousHash ?? null;

    if (receivedEventIndex !== expectedIndex) {
      issues.push({
        eventId: event.id,
        chain: chainKey,
        eventIndex: receivedEventIndex,
        reason: `eventIndex inválido: esperado ${expectedIndex}, recebido ${receivedEventIndex}.`,
      });
    }

    if (receivedPreviousHash !== expectedPreviousHash) {
      issues.push({
        eventId: event.id,
        chain: chainKey,
        eventIndex: receivedEventIndex,
        reason: `previousHash inválido: esperado ${expectedPreviousHash ?? "null"}, recebido ${receivedPreviousHash ?? "null"}.`,
      });
    }

    const recalculated = computeAuditEventHash({
      eventIndex: receivedEventIndex,
      previousHash: receivedPreviousHash,
      immutableData: event.immutableData,
    });

    if (event.eventHash !== recalculated) {
      issues.push({
        eventId: event.id,
        chain: chainKey,
        eventIndex: receivedEventIndex,
        reason: "eventHash divergente do hash recalculado.",
      });
    }

    chains.set(chainKey, {
      previousIndex: receivedEventIndex,
      previousHash: event.eventHash,
    });
  }

  const chainSummaries = Array.from(chains.entries()).map(([chain, state]) => ({
    chain,
    caseExternalId:
      chain === TENANT_CHAIN_KEY
        ? null
        : (caseLabels.get(chain) ?? null),
    lastEventIndex: state.previousIndex,
    lastEventHash: state.previousHash,
  }));

  const allIssues = [...issues, ...strictModeIssues];

  return NextResponse.json({
    ok: true,
    tenantId,
    scope: caseExternalId ? "case" : "tenant",
    strictMode,
    caseExternalId: caseExternalId ?? null,
    summary: {
      totalEventsRead: allEvents.length,
      totalEventsValidated: eventsInChain.length,
      legacyOrIncompleteEvents,
      totalChains: chainSummaries.length,
      integrityValid: allIssues.length === 0,
      issuesCount: allIssues.length,
    },
    chains: chainSummaries,
    issues: allIssues,
  });
}
