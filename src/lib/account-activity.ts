import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { describeAuditAction, resolveAuditActorLabel } from "@/lib/audit-action";

export const ACCOUNT_ACTIVITY_ACTIONS = [
  "AUTH_LOGIN",
  "AUTH_LOGOUT",
  "AUTH_PASSWORD_CHANGED",
  "TENANT_ONBOARDED_SELF_SERVICE",
  "TENANT_MEMBER_CREATED",
  "TENANT_MEMBER_UPDATED",
  "TENANT_MEMBER_PASSWORD_RESET",
] as const;

type AccountActivityRow = {
  id: string;
  action: string;
  occurredAt: Date;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  immutableData: Prisma.JsonValue;
};

export async function listAccountActivity(input: {
  tenantId: string;
  userId: string;
  limit?: number;
  cursor?: string | null;
}) {
  const limit = Math.min(50, Math.max(1, input.limit ?? 20));
  const cursorDate = input.cursor ? new Date(input.cursor) : null;

  const rows = await prisma.$queryRaw<AccountActivityRow[]>`
    SELECT
      ae.id,
      ae.action,
      ae."occurredAt",
      ae."actorUserId",
      u.name AS "actorName",
      u.email AS "actorEmail",
      ae."immutableData"
    FROM "AuditEvent" ae
    LEFT JOIN "User" u ON u.id = ae."actorUserId"
    WHERE ae."tenantId" = ${input.tenantId}
      AND ae.action IN (${Prisma.join(ACCOUNT_ACTIVITY_ACTIONS)})
      AND (
        ae."actorUserId" = ${input.userId}
        OR ae."immutableData"->'payload'->>'memberId' = ${input.userId}
        OR ae."immutableData"->'payload'->>'targetUserId' = ${input.userId}
      )
      ${cursorDate ? Prisma.sql`AND ae."occurredAt" < ${cursorDate}` : Prisma.empty}
    ORDER BY ae."occurredAt" DESC
    LIMIT ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: page.map((row) => {
      const payload =
        row.immutableData &&
        typeof row.immutableData === "object" &&
        "payload" in row.immutableData
          ? (row.immutableData as { payload?: Record<string, unknown> }).payload
          : undefined;

      return {
        id: row.id,
        action: row.action,
        label: describeAuditAction(row.action),
        occurredAt: row.occurredAt.toISOString(),
        actor: resolveAuditActorLabel({
          action: row.action,
          actorUserName: row.actorName,
          actorUserEmail: row.actorEmail,
        }),
        payload: payload ?? null,
      };
    }),
    nextCursor: hasMore ? page[page.length - 1]?.occurredAt.toISOString() ?? null : null,
    hasMore,
  };
}
