import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRequestId, logError, logInfo, logWarn } from "@/lib/logger";

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown database error";
    return { ok: false as const, error: message };
  }
}

function checkEnvironment() {
  const requiredVars = ["DATABASE_URL", "JWT_SECRET"];
  const missing = requiredVars.filter((name) => !process.env[name]);

  return {
    ok: missing.length === 0,
    missing,
  };
}

export async function GET() {
  const requestId = createRequestId();
  const [database, env] = await Promise.all([checkDatabase(), Promise.resolve(checkEnvironment())]);
  const ready = database.ok && env.ok;

  if (ready) {
    logInfo("ops.readiness.ready", {
      requestId,
      scope: "ops.readiness",
    });
  } else {
    const data = { database, env };
    if (!database.ok) {
      logError("ops.readiness.database_failed", {
        requestId,
        scope: "ops.readiness",
        data,
      });
    } else {
      logWarn("ops.readiness.environment_missing", {
        requestId,
        scope: "ops.readiness",
        data,
      });
    }
  }

  return NextResponse.json(
    {
      ok: ready,
      status: ready ? "ready" : "not_ready",
      requestId,
      checks: {
        database,
        environment: env,
      },
      now: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}
