import { NextResponse } from "next/server";
import { createRequestId, logInfo } from "@/lib/logger";

const startedAt = Date.now();

export async function GET() {
  const requestId = createRequestId();
  const payload = {
    ok: true,
    service: "job-complaint",
    status: "healthy",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    now: new Date().toISOString(),
  };
  logInfo("ops.health.checked", {
    requestId,
    scope: "ops.health",
    data: {
      uptimeSeconds: payload.uptimeSeconds,
    },
  });
  return NextResponse.json({
    ...payload,
    requestId,
  });
}
