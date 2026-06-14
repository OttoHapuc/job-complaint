import { NextRequest, NextResponse } from "next/server";
import { isInternalJobAuthorized } from "@/lib/internal-job-auth";
import { runSlaEmailAlerts } from "@/lib/sla-notify";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!isInternalJobAuthorized(request)) {
    return NextResponse.json({ error: "Sem autorização para alertas de SLA." }, { status: 401 });
  }

  const result = await runSlaEmailAlerts();
  return NextResponse.json({
    ok: true,
    ...result,
  });
}
