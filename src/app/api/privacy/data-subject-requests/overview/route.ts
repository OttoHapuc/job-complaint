import { NextRequest, NextResponse } from "next/server"
import { DataSubjectRequestStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/permissions"

export async function GET(request: NextRequest) {
  const allowed = await requirePermission(request, "tenant.admin")
  if (!allowed.ok) {
    return allowed.response
  }

  const now = new Date()
  const dueSoonCutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const [open, inProgress, completed, rejected, overdue, dueSoon, recent] = await Promise.all([
    prisma.dataSubjectRequest.count({
      where: { tenantId: allowed.user.tenantId, status: DataSubjectRequestStatus.OPEN },
    }),
    prisma.dataSubjectRequest.count({
      where: { tenantId: allowed.user.tenantId, status: DataSubjectRequestStatus.IN_PROGRESS },
    }),
    prisma.dataSubjectRequest.count({
      where: { tenantId: allowed.user.tenantId, status: DataSubjectRequestStatus.COMPLETED },
    }),
    prisma.dataSubjectRequest.count({
      where: { tenantId: allowed.user.tenantId, status: DataSubjectRequestStatus.REJECTED },
    }),
    prisma.dataSubjectRequest.count({
      where: {
        tenantId: allowed.user.tenantId,
        status: { in: [DataSubjectRequestStatus.OPEN, DataSubjectRequestStatus.IN_PROGRESS] },
        dueAt: { lt: now },
      },
    }),
    prisma.dataSubjectRequest.count({
      where: {
        tenantId: allowed.user.tenantId,
        status: { in: [DataSubjectRequestStatus.OPEN, DataSubjectRequestStatus.IN_PROGRESS] },
        dueAt: { gte: now, lte: dueSoonCutoff },
      },
    }),
    prisma.dataSubjectRequest.findMany({
      where: {
        tenantId: allowed.user.tenantId,
        status: { in: [DataSubjectRequestStatus.OPEN, DataSubjectRequestStatus.IN_PROGRESS] },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: 10,
      select: {
        id: true,
        status: true,
        requestType: true,
        requesterName: true,
        dueAt: true,
      },
    }),
  ])

  return NextResponse.json({
    ok: true,
    sla: {
      overdue,
      dueSoon24h: dueSoon,
    },
    counts: {
      open,
      inProgress,
      completed,
      rejected,
    },
    queue: recent.map((item) => ({
      ...item,
      dueAt: item.dueAt?.toISOString() ?? null,
      isOverdue: !!item.dueAt && item.dueAt.getTime() < now.getTime(),
    })),
  })
}
