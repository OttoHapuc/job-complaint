import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashInviteToken } from "@/lib/security";
import { createImmutableAuditEvent } from "@/lib/audit";
import { decryptSensitiveText } from "@/lib/secure-data";
import { sendParticipantInviteAcceptedNotification } from "@/lib/notifications";

function extractParticipantQuestions(events: Array<{ immutableData: unknown }>, participantId: string) {
  for (const event of events) {
    const payload = (event.immutableData as { payload?: unknown } | null)?.payload as
      | { participantId?: string; questionnaire?: string[] }
      | undefined;
    if (payload?.participantId === participantId && Array.isArray(payload.questionnaire)) {
      return payload.questionnaire;
    }
  }
  return [
    "Você confirma os fatos observados? Descreva com contexto objetivo.",
    "Há evidências adicionais que possam apoiar a investigação?",
  ];
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const tokenHash = hashInviteToken(token);

  const invite = await prisma.caseInviteToken.findUnique({
    where: { tokenHash },
    include: {
      caseParticipant: {
        include: {
          case: {
            select: { id: true },
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

  const questionnaireEvents = await prisma.auditEvent.findMany({
    where: {
      tenantId: invite.tenantId,
      caseId: invite.caseParticipant.case.id,
      action: "CASE_PARTICIPANT_QUESTIONNAIRE_CREATED",
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      immutableData: true,
    },
  });
  const questions = extractParticipantQuestions(questionnaireEvents, invite.caseParticipant.id);

  return NextResponse.json({
    ok: true,
    invite: {
      role: invite.caseParticipant.role,
      acceptedAt: invite.caseParticipant.acceptedAt?.toISOString() ?? null,
      expiresAt: invite.expiresAt.toISOString(),
      questions,
    },
  });
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const tokenHash = hashInviteToken(token);

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
      tenant: {
        select: { name: true },
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

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.caseInviteToken.update({
      where: { id: invite.id },
      data: {
        consumedAt: invite.consumedAt ?? now,
      },
    });
    await tx.caseParticipant.update({
      where: { id: invite.caseParticipant.id },
      data: {
        inviteStatus: "ACCEPTED",
        acceptedAt: now,
      },
    });
    await createImmutableAuditEvent(tx, {
      tenantId: invite.tenantId,
      caseId: invite.caseParticipant.case.id,
      action: "CASE_PARTICIPANT_INVITE_ACCEPTED",
      payload: {
        participantId: invite.caseParticipant.id,
        inviteId: invite.id,
      },
    });
  });

  const profile = JSON.parse(
    decryptSensitiveText(invite.caseParticipant.emailEncrypted) || "{}",
  ) as { contact?: string };
  const participantEmail = profile.contact?.trim().toLowerCase();
  if (participantEmail) {
    void sendParticipantInviteAcceptedNotification({
      to: participantEmail,
      tenantName: invite.tenant.name,
      caseExternalId: invite.caseParticipant.case.externalId,
      inviteToken: token,
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    caseId: invite.caseParticipant.case.externalId,
  });
}
