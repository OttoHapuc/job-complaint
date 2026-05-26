import { NextRequest, NextResponse } from "next/server";
import { processOutboxUntilIdle } from "@/lib/intake/processor";
import { prisma } from "@/lib/prisma";

function isAuthorized(request: NextRequest) {
  const expected = process.env.OUTBOX_PROCESSOR_SECRET?.trim();
  if (!expected) return true;
  const provided = request.headers.get("x-outbox-secret")?.trim();
  return provided === expected;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Sem autorização para processar outbox." }, { status: 401 });
  }

  const tenantId = request.nextUrl.searchParams.get("tenantId") || undefined;
  const caseId = request.nextUrl.searchParams.get("caseId") || undefined;
  const limit = Number(request.nextUrl.searchParams.get("limit") || "20");
  const maxCycles = Number(request.nextUrl.searchParams.get("maxCycles") || "5");
  const result = await processOutboxUntilIdle({
    tenantId,
    caseId,
    limit,
    maxCycles,
  });
  const [pending, failed, dead] = await Promise.all([
    prisma.outboxMessage.count({
      where: { tenantId, caseId, status: "PENDING" },
    }),
    prisma.outboxMessage.count({
      where: { tenantId, caseId, status: "FAILED" },
    }),
    prisma.outboxMessage.count({
      where: { tenantId, caseId, status: "DEAD" },
    }),
  ]);
  return NextResponse.json({
    ok: true,
    ...result,
    queue: {
      pending,
      failed,
      dead,
    },
  });
}

