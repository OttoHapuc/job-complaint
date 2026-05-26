import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashWhistleblowerToken } from "@/lib/security";
import { createImmutableAuditEvent } from "@/lib/audit";
import { applyRateLimit } from "@/lib/rate-limit";
import { buildRateLimitKey } from "@/lib/request";
import { SECURITY_CONFIG } from "@/lib/config";
import { PipelineAction } from "@prisma/client";
import { decryptSensitiveText, encryptSensitiveText } from "@/lib/secure-data";
import { enqueueOutboxAction } from "@/lib/intake/outbox";

type MessageBody = {
  token?: string;
  content?: string;
};

export async function POST(request: NextRequest) {
  const rateLimit = applyRateLimit(
    buildRateLimitKey("tracking-message", request),
    SECURITY_CONFIG.rateLimitMaxWhistleblowerMessages,
    SECURITY_CONFIG.rateLimitWindowMs,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Limite temporário de mensagens atingido. Aguarde e tente novamente." },
      { status: 429 },
    );
  }

  let body: MessageBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const token = body.token?.trim().toUpperCase();
  const content = body.content?.trim();

  if (!token || !content) {
    return NextResponse.json({ error: "Token e mensagem são obrigatórios." }, { status: 400 });
  }

  const encryptedContent = encryptSensitiveText(content);

  const tokenHash = hashWhistleblowerToken(token);
  const storedToken = await prisma.whistleblowerAccessToken.findUnique({
    where: { tokenHash },
    include: { case: true },
  });

  if (!storedToken) {
    return NextResponse.json({ error: "Token inválido." }, { status: 404 });
  }
  if (storedToken.case.status !== "WAITING_RESPONSE" && storedToken.case.status !== "IN_REVIEW") {
    return NextResponse.json(
      { error: "No momento, não há perguntas pendentes para resposta neste caso." },
      { status: 409 },
    );
  }

  const pipelineState = await prisma.casePipelineState.findUnique({
    where: { caseId: storedToken.caseId },
    select: {
      reviewIterationCount: true,
    },
  });
  const baseDelayMinutes = (pipelineState?.reviewIterationCount ?? 0) >= 3 ? 360 : 45;
  const plannedProcessingAt = new Date(Date.now() + baseDelayMinutes * 60 * 1000);

  const message = await prisma.$transaction(async (tx) => {
    const createdMessage = await tx.caseMessage.create({
      data: {
        tenantId: storedToken.tenantId,
        caseId: storedToken.caseId,
        authorType: "WHISTLEBLOWER",
        content: encryptedContent,
      },
    });

    await createImmutableAuditEvent(tx, {
      tenantId: storedToken.tenantId,
      caseId: storedToken.caseId,
      action: "WHISTLEBLOWER_MESSAGE_SENT",
      payload: {
        messageId: createdMessage.id,
        authorType: "WHISTLEBLOWER",
      },
    });

    await enqueueOutboxAction(tx, {
      tenantId: storedToken.tenantId,
      caseId: storedToken.caseId,
      action: PipelineAction.REVIEW_ITERATION,
      payload: {
        sourceMessageId: createdMessage.id,
      },
      idempotencyKey: `${storedToken.caseId}:review:${createdMessage.id}`,
      availableAt: plannedProcessingAt,
    });

    await tx.casePipelineState.update({
      where: { caseId: storedToken.caseId },
      data: {
        whistleblowerStatus: "PROCESSING_YOUR_MESSAGE",
        processingSince: new Date(),
        nextContactAt: plannedProcessingAt,
        latestAction: PipelineAction.REVIEW_ITERATION,
        latestActionStatus: "PENDING",
        lastTransitionAt: new Date(),
        pendingQuestion: null,
      },
    });

    return createdMessage;
  });

  return NextResponse.json({
    ok: true,
    message: {
      id: message.id,
      role: "whistleblower",
      content: decryptSensitiveText(message.content),
      timestamp: message.createdAt.toISOString(),
    },
  });
}
