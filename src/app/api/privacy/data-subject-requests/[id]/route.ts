import { NextRequest, NextResponse } from "next/server"
import { DataSubjectRequestStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/permissions"
import { createImmutableAuditEvent } from "@/lib/audit"

type UpdateStatusBody = {
  status?: keyof typeof DataSubjectRequestStatus
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const allowed = await requirePermission(request, "tenant.admin")
  if (!allowed.ok) {
    return allowed.response
  }

  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "ID da solicitação inválido." }, { status: 400 })
  }

  let body: UpdateStatusBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 })
  }

  if (!body.status || !(body.status in DataSubjectRequestStatus)) {
    return NextResponse.json(
      { error: "Status inválido. Use OPEN, IN_PROGRESS, COMPLETED ou REJECTED." },
      { status: 400 },
    )
  }

  const nextStatus = DataSubjectRequestStatus[body.status]

  const existing = await prisma.dataSubjectRequest.findFirst({
    where: {
      id,
      tenantId: allowed.user.tenantId,
    },
    select: {
      id: true,
      status: true,
      requestType: true,
    },
  })

  if (!existing) {
    return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const now = new Date()
    const isTerminal =
      nextStatus === DataSubjectRequestStatus.COMPLETED ||
      nextStatus === DataSubjectRequestStatus.REJECTED
    const dueDate = await tx.dataSubjectRequest.findUnique({
      where: { id: existing.id },
      select: { dueAt: true, slaBreachedAt: true },
    })
    const hasBreach =
      !isTerminal &&
      !!dueDate?.dueAt &&
      dueDate.dueAt.getTime() < now.getTime()

    const dsr = await tx.dataSubjectRequest.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        resolvedAt: isTerminal ? now : null,
        slaBreachedAt: hasBreach ? dueDate?.slaBreachedAt ?? now : dueDate?.slaBreachedAt ?? null,
      },
      select: {
        id: true,
        status: true,
        requestType: true,
        dueAt: true,
        slaBreachedAt: true,
        updatedAt: true,
        resolvedAt: true,
      },
    })

    await createImmutableAuditEvent(tx, {
      tenantId: allowed.user.tenantId,
      actorUserId: allowed.user.id,
      action: "DATA_SUBJECT_REQUEST_STATUS_UPDATED",
      payload: {
        dsrId: dsr.id,
        requestType: dsr.requestType,
        previousStatus: existing.status,
        newStatus: dsr.status,
      },
    })

    return dsr
  })

  return NextResponse.json({ ok: true, request: updated })
}
