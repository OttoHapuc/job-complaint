import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";

type JsonValue = Prisma.InputJsonValue;

type CreateImmutableAuditEventInput = {
  tenantId: string;
  action: string;
  caseId?: string | null;
  actorUserId?: string | null;
  metadata?: JsonValue;
  payload?: JsonValue;
  occurredAt?: Date;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const body = entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(",");
  return `{${body}}`;
}

function computeHash(input: unknown): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

type ComputeAuditEventHashInput = {
  eventIndex: number;
  previousHash: string | null;
  immutableData: unknown;
};

export function computeAuditEventHash(input: ComputeAuditEventHashInput) {
  return computeHash({
    eventIndex: input.eventIndex,
    previousHash: input.previousHash,
    immutableData: input.immutableData,
  });
}

type RebaseableAuditEvent = {
  id: string;
  tenantId: string;
  caseId: string | null;
  actorUserId: string | null;
  action: string;
  metadata: Prisma.JsonValue | null;
  immutableData: Prisma.JsonValue | null;
  occurredAt: Date;
  createdAt: Date;
};

type RebasedAuditEvent = {
  id: string;
  tenantId: string;
  caseId: string | null;
  immutableData: Prisma.InputJsonValue;
  occurredAt: Date;
  eventIndex: number;
  previousHash: string | null;
  eventHash: string;
};

function buildLegacyImmutableData(event: RebaseableAuditEvent, occurredAt: Date): Prisma.JsonValue {
  return {
    tenantId: event.tenantId,
    caseId: event.caseId,
    actorUserId: event.actorUserId,
    action: event.action,
    occurredAt: occurredAt.toISOString(),
    payload: event.metadata ?? null,
    legacyBaseline: true,
  };
}

export function buildRebasedAuditChain(events: RebaseableAuditEvent[]): RebasedAuditEvent[] {
  let previousHash: string | null = null;

  return events.map((event, index) => {
    const eventIndex = index + 1;
    const occurredAt = event.occurredAt ?? event.createdAt;
    const immutableData = (
      event.immutableData ?? buildLegacyImmutableData(event, occurredAt)
    ) as Prisma.InputJsonValue;

    const eventHash = computeAuditEventHash({
      eventIndex,
      previousHash,
      immutableData,
    });

    const rebased: RebasedAuditEvent = {
      id: event.id,
      tenantId: event.tenantId,
      caseId: event.caseId,
      immutableData,
      occurredAt,
      eventIndex,
      previousHash,
      eventHash,
    };

    previousHash = eventHash;
    return rebased;
  });
}

export async function createImmutableAuditEvent(
  tx: Prisma.TransactionClient,
  input: CreateImmutableAuditEventInput,
) {
  const occurredAt = input.occurredAt ?? new Date();
  const chainCaseId = input.caseId ?? null;

  const lastEvent = await tx.auditEvent.findFirst({
    where: {
      tenantId: input.tenantId,
      caseId: chainCaseId,
      eventIndex: {
        not: null,
      },
    },
    orderBy: {
      eventIndex: "desc",
    },
    select: {
      eventIndex: true,
      eventHash: true,
    },
  });

  const eventIndex = (lastEvent?.eventIndex ?? 0) + 1;
  const previousHash = lastEvent?.eventHash ?? null;

  const immutableData = {
    tenantId: input.tenantId,
    caseId: chainCaseId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    occurredAt: occurredAt.toISOString(),
    payload: input.payload ?? null,
  };

  const eventHash = computeAuditEventHash({
    eventIndex,
    previousHash,
    immutableData,
  });

  return tx.auditEvent.create({
    data: {
      tenantId: input.tenantId,
      caseId: chainCaseId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      metadata: input.metadata,
      immutableData,
      eventIndex,
      previousHash,
      eventHash,
      occurredAt,
    },
  });
}
