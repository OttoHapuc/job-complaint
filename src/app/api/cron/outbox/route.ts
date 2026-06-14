import { NextRequest, NextResponse } from "next/server";
import { isInternalJobAuthorized } from "@/lib/internal-job-auth";
import { processOutboxUntilIdle } from "@/lib/intake/processor";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

async function runOutbox(request: NextRequest) {
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
    queue: { pending, failed, dead },
  });
}

export async function GET(request: NextRequest) {
  if (!isInternalJobAuthorized(request)) {
    return NextResponse.json({ error: "Sem autorização para processar outbox." }, { status: 401 });
  }
  return runOutbox(request);
}

export async function POST(request: NextRequest) {
  if (!isInternalJobAuthorized(request)) {
    return NextResponse.json({ error: "Sem autorização para processar outbox." }, { status: 401 });
  }
  return runOutbox(request);
}
