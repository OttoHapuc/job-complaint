import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { DataSubjectRequestStatus, DataSubjectRequestType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { applyRateLimit } from "@/lib/rate-limit"
import { buildRateLimitKey } from "@/lib/request"
import { SECURITY_CONFIG } from "@/lib/config"
import { requirePermission } from "@/lib/permissions"
import { createImmutableAuditEvent } from "@/lib/audit"

type RequestBody = {
  tenantCode?: string
  requestType?: keyof typeof DataSubjectRequestType
  requesterName?: string
  requesterEmail?: string
  requesterDocument?: string
  details?: string
  legalConsent?: boolean
}

function hashDocument(document: string | undefined) {
  if (!document?.trim()) return null
  return createHash("sha256").update(document.trim()).digest("hex")
}

function computeDueAt(from: Date) {
  return new Date(from.getTime() + SECURITY_CONFIG.lgpdRequestSlaDays * 24 * 60 * 60 * 1000)
}

export async function POST(request: NextRequest) {
  const rateLimit = applyRateLimit(
    buildRateLimitKey("privacy-dsr", request),
    Math.max(5, Math.floor(SECURITY_CONFIG.rateLimitMaxPublicReports / 2)),
    SECURITY_CONFIG.rateLimitWindowMs,
  )
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas solicitações em curto intervalo. Tente novamente mais tarde." },
      { status: 429 },
    )
  }

  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 })
  }

  const requesterName = body.requesterName?.trim()
  const requesterEmail = body.requesterEmail?.trim().toLowerCase()
  const details = body.details?.trim()
  const legalConsent = body.legalConsent === true
  const requestType = body.requestType ? DataSubjectRequestType[body.requestType] : null
  const tenantCode = body.tenantCode?.trim().toLowerCase()

  if (!requestType || !requesterName || !requesterEmail || !details) {
    return NextResponse.json(
      { error: "Campos obrigatórios: requestType, requesterName, requesterEmail, details." },
      { status: 400 },
    )
  }
  if (!legalConsent) {
    return NextResponse.json(
      { error: "É necessário aceitar o tratamento mínimo de dados para registrar a solicitação." },
      { status: 400 },
    )
  }

  let tenantId: string | null = null
  if (tenantCode) {
    const tenant = await prisma.tenant.findUnique({
      where: { code: tenantCode },
      select: { id: true },
    })
    tenantId = tenant?.id ?? null
  }

  const created = await prisma.$transaction(async (tx) => {
    const openedAt = new Date()
    const dsr = await tx.dataSubjectRequest.create({
      data: {
        tenantId,
        requestType,
        requesterName,
        requesterEmail,
        requesterDocumentHash: hashDocument(body.requesterDocument),
        details,
        legalConsent,
        dueAt: computeDueAt(openedAt),
        createdAt: openedAt,
      },
    })

    if (tenantId) {
      await createImmutableAuditEvent(tx, {
        tenantId,
        action: "DATA_SUBJECT_REQUEST_OPENED",
        payload: {
          dsrId: dsr.id,
          requestType: dsr.requestType,
        },
      })
    }

    return dsr
  })

  return NextResponse.json({
    ok: true,
    request: {
      id: created.id,
      status: created.status,
      requestType: created.requestType,
      createdAt: created.createdAt.toISOString(),
    },
  })
}

export async function GET(request: NextRequest) {
  const allowed = await requirePermission(request, "tenant.admin")
  if (!allowed.ok) {
    return allowed.response
  }

  const statusParam = request.nextUrl.searchParams.get("status")
  const status =
    statusParam && statusParam in DataSubjectRequestStatus
      ? DataSubjectRequestStatus[statusParam as keyof typeof DataSubjectRequestStatus]
      : null

  const requests = await prisma.dataSubjectRequest.findMany({
    where: {
      tenantId: allowed.user.tenantId,
      status: status ?? undefined,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      requestType: true,
      requesterName: true,
      requesterEmail: true,
      details: true,
      dueAt: true,
      slaBreachedAt: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
    },
  })
  const now = Date.now()
  return NextResponse.json({
    ok: true,
    requests: requests.map((item) => {
      const dueAtIso = item.dueAt?.toISOString() ?? null
      const isOverdue =
        (item.status === DataSubjectRequestStatus.OPEN ||
          item.status === DataSubjectRequestStatus.IN_PROGRESS) &&
        !!item.dueAt &&
        item.dueAt.getTime() < now

      return {
        ...item,
        dueAt: dueAtIso,
        isOverdue,
      }
    }),
  })
}
