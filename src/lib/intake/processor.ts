import { claimNextOutboxMessage, completeOutboxMessage, failOutboxMessage } from "@/lib/intake/outbox";
import { handleOutboxAction } from "@/lib/intake/stages";
import { SECURITY_CONFIG } from "@/lib/config";

type ProcessOptions = {
  limit?: number;
  tenantId?: string;
  caseId?: string;
};

export async function processOutboxBatch(options?: ProcessOptions) {
  const limit = Math.max(
    1,
    Math.min(50, options?.limit ?? SECURITY_CONFIG.outboxDefaultBatchLimit),
  );
  let processed = 0;
  let failed = 0;

  for (let index = 0; index < limit; index += 1) {
    const claimed = await claimNextOutboxMessage({
      tenantId: options?.tenantId,
      caseId: options?.caseId,
    });
    if (!claimed) break;

    try {
      await handleOutboxAction(claimed);
      await completeOutboxMessage(claimed.id);
      processed += 1;
    } catch (error) {
      failed += 1;
      const message =
        error instanceof Error ? error.message : "Falha desconhecida ao processar outbox.";
      await failOutboxMessage(claimed.id, claimed.attempts, message);
    }
  }

  return {
    processed,
    failed,
  };
}

export async function processCaseOutboxSafely(input: { tenantId?: string; caseId?: string }) {
  try {
    await processOutboxBatch({
      limit: 8,
      tenantId: input.tenantId,
      caseId: input.caseId,
    });
  } catch {
    // Silencioso para evitar quebrar endpoints de negócio.
  }
}

export async function processOutboxUntilIdle(options?: ProcessOptions & { maxCycles?: number }) {
  const maxCycles = Math.max(1, Math.min(20, options?.maxCycles ?? 5));
  let totalProcessed = 0;
  let totalFailed = 0;

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const batch = await processOutboxBatch({
      tenantId: options?.tenantId,
      caseId: options?.caseId,
      limit: options?.limit ?? 20,
    });
    totalProcessed += batch.processed;
    totalFailed += batch.failed;
    if (batch.processed === 0 && batch.failed === 0) {
      break;
    }
  }

  return {
    processed: totalProcessed,
    failed: totalFailed,
    cycles: maxCycles,
  };
}

