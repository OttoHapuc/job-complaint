import { NextRequest, NextResponse } from "next/server";
import { runSlaEmailAlerts } from "@/lib/sla-notify";

function isAuthorized(request: NextRequest) {
  const expected = process.env.OUTBOX_PROCESSOR_SECRET?.trim();
  if (!expected) return true;
  const provided = request.headers.get("x-outbox-secret")?.trim();
  return provided === expected;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Sem autorização para alertas de SLA." }, { status: 401 });
  }

  const result = await runSlaEmailAlerts();
  return NextResponse.json({
    ok: true,
    ...result,
  });
}
