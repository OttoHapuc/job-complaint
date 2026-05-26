import { OutboxStatus, PipelineAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SECURITY_CONFIG } from "@/lib/config";

const MAX_ATTEMPTS = SECURITY_CONFIG.outboxMaxAttempts;
const BASE_RETRY_SECONDS = SECURITY_CONFIG.outboxBaseRetrySeconds;

type EnqueueInput = {
  tenantId: string;
  caseId?: string | null;
  rawReportId?: string | null;
  action: PipelineAction;
  payload?: Prisma.InputJsonValue;
  idempotencyKey?: string;
  availableAt?: Date;
};

export async function enqueueOutboxAction(
  tx: Prisma.TransactionClient,
  input: EnqueueInput,
) {
  if (input.idempotencyKey) {
    const existing = await tx.outboxMessage.findFirst({
      where: {
        tenantId: input.tenantId,
        idempotencyKey: input.idempotencyKey,
      },
      select: { id: true },
    });
    if (existing) return existing;
  }

  return tx.outboxMessage.create({
    data: {
      tenantId: input.tenantId,
      caseId: input.caseId ?? null,
      rawReportId: input.rawReportId ?? null,
      action: input.action,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey,
      status: OutboxStatus.PENDING,
      availableAt: input.availableAt ?? new Date(),
    },
    select: { id: true },
  });
}

export async function claimNextOutboxMessage(input?: {
  tenantId?: string;
  caseId?: string;
}) {
  const candidate = await prisma.outboxMessage.findFirst({
    where: {
      tenantId: input?.tenantId,
      caseId: input?.caseId,
      status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
      availableAt: { lte: new Date() },
    },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
    },
  });
  if (!candidate) return null;

  const updated = await prisma.outboxMessage.updateMany({
    where: {
      id: candidate.id,
      status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
    },
    data: {
      status: OutboxStatus.PROCESSING,
      lockedAt: new Date(),
      attempts: { increment: 1 },
      lastError: null,
    },
  });
  if (updated.count === 0) return null;

  return prisma.outboxMessage.findUnique({
    where: { id: candidate.id },
  });
}

export async function completeOutboxMessage(id: string) {
  await prisma.outboxMessage.update({
    where: { id },
    data: {
      status: OutboxStatus.COMPLETED,
      processedAt: new Date(),
      lockedAt: null,
    },
  });
}

export async function failOutboxMessage(id: string, attempts: number, reason: string) {
  const shouldDeadLetter = attempts >= MAX_ATTEMPTS;
  const retryInSeconds = BASE_RETRY_SECONDS * Math.max(1, attempts);
  await prisma.outboxMessage.update({
    where: { id },
    data: {
      status: shouldDeadLetter ? OutboxStatus.DEAD : OutboxStatus.FAILED,
      lastError: reason.slice(0, 900),
      availableAt: shouldDeadLetter
        ? new Date()
        : new Date(Date.now() + retryInSeconds * 1000),
      lockedAt: null,
    },
  });
}

