import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, clearSessionCookie } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createImmutableAuditEvent } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);

  if (session) {
    await prisma.$transaction(async (tx) => {
      await createImmutableAuditEvent(tx, {
        tenantId: session.tenantId,
        actorUserId: session.sub,
        action: "AUTH_LOGOUT",
        payload: {
          reason: "user_request",
        },
      });
    });
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
