import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashInviteToken } from "@/lib/security";
import { createImmutableAuditEvent } from "@/lib/audit";
import { encryptSensitiveText } from "@/lib/secure-data";
import { runAiPromptInjectionGuard } from "@/lib/ai-guard";

type InviteResponseBody = {
  questionText?: string;
  answerText?: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const tokenHash = hashInviteToken(token);

  let body: InviteResponseBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const questionText = body.questionText?.trim();
  const answerText = body.answerText?.trim();
  if (!questionText || !answerText) {
    return NextResponse.json(
      { error: "Campos obrigatórios: questionText e answerText." },
      { status: 400 },
    );
  }

  const encryptedAnswer = encryptSensitiveText(answerText);
  const guard = await runAiPromptInjectionGuard({
    narrative: answerText,
    conversationCount: 1,
  });

  const invite = await prisma.caseInviteToken.findUnique({
    where: { tokenHash },
    include: {
      caseParticipant: {
        include: {
          case: {
            select: { id: true, externalId: true },
          },
        },
      },
    },
  });
  if (!invite) {
    return NextResponse.json({ error: "Convite inválido." }, { status: 404 });
  }
  if (invite.revokedAt) {
    return NextResponse.json({ error: "Convite revogado." }, { status: 410 });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Convite expirado." }, { status: 410 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const response = await tx.participantResponse.create({
      data: {
        tenantId: invite.tenantId,
        caseId: invite.caseParticipant.case.id,
        caseParticipantId: invite.caseParticipant.id,
        questionText,
        answerText: encryptedAnswer,
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    await tx.caseMessage.create({
      data: {
        tenantId: invite.tenantId,
        caseId: invite.caseParticipant.case.id,
        authorType: "SYSTEM",
        content: encryptSensitiveText(`Resposta de participante externo registrada para a pergunta: ${questionText}`),
      },
    });

    await createImmutableAuditEvent(tx, {
      tenantId: invite.tenantId,
      caseId: invite.caseParticipant.case.id,
      action: "CASE_PARTICIPANT_RESPONSE_SUBMITTED",
      payload: {
        participantId: invite.caseParticipant.id,
        responseId: response.id,
        questionText,
      },
    });

    await createImmutableAuditEvent(tx, {
      tenantId: invite.tenantId,
      caseId: invite.caseParticipant.case.id,
      action: "AI_INJECTION_GUARD_EXECUTED",
      payload: {
        source: "participant-response",
        ...guard,
      },
    });

    if (guard.isMalicious) {
      await createImmutableAuditEvent(tx, {
        tenantId: invite.tenantId,
        caseId: invite.caseParticipant.case.id,
        action: "AI_INJECTION_GUARD_FLAGGED",
        payload: {
          source: "participant-response",
          ...guard,
        },
      });
    }

    return response;
  });

  return NextResponse.json({
    ok: true,
    responseId: created.id,
    caseId: invite.caseParticipant.case.externalId,
    createdAt: created.createdAt.toISOString(),
  });
}
