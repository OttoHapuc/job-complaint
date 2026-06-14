import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createImmutableAuditEvent } from "@/lib/audit";
import { requirePermission } from "@/lib/permissions";
import { isCaseInInitialAnalysisWindow } from "@/lib/case-visibility";
import { loadCommitteeCaseContext } from "@/lib/committee-recipients";
import { sendCommitteeVoteRequiredNotification } from "@/lib/notifications";

type ConfirmBody = {
  comment?: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const allowed = await requirePermission(request, "case.investigate");
  if (!allowed.ok) return allowed.response;

  let body: ConfirmBody = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const comment = body.comment?.trim() || null;
  const { id } = await context.params;
  const externalId = `CASO-${id.toUpperCase()}`;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const reportCase = await tx.case.findFirst({
        where: {
          tenantId: allowed.user.tenantId,
          externalId,
        },
        select: {
          id: true,
          status: true,
          restrictedUserIds: true,
          createdAt: true,
          reviewConcludedAt: true,
          readyForCommitteeAt: true,
          auditEvents: {
            where: {
              action: {
                in: [
                  "CASE_ABANDONMENT_THRESHOLD_REACHED",
                  "CASE_ABANDONMENT_CONFIRMED_BY_COMMITTEE",
                ],
              },
            },
            select: { action: true },
          },
        },
      });

      if (!reportCase) throw new Error("Caso não encontrado.");
      if (reportCase.restrictedUserIds.includes(allowed.user.id)) {
        throw new Error("Acesso bloqueado por conflito de interesse neste caso.");
      }
      if (
        isCaseInInitialAnalysisWindow({
          createdAt: reportCase.createdAt,
          reviewConcludedAt: reportCase.reviewConcludedAt,
        })
      ) {
        throw new Error("Caso ainda em análise inicial.");
      }

      const hasAbandonment = reportCase.auditEvents.some(
        (event) => event.action === "CASE_ABANDONMENT_THRESHOLD_REACHED",
      );
      if (!hasAbandonment) {
        throw new Error("Caso não foi encaminhado por abandono de resposta.");
      }

      const alreadyConfirmed = reportCase.auditEvents.some(
        (event) => event.action === "CASE_ABANDONMENT_CONFIRMED_BY_COMMITTEE",
      );
      if (alreadyConfirmed) {
        throw new Error("Abandono já confirmado pelo conselho.");
      }

      if (!reportCase.readyForCommitteeAt) {
        throw new Error("Pacote de pre-conclusão ainda não está pronto.");
      }

      if (reportCase.status === "AWAITING_COMMITTEE_APPROVAL") {
        throw new Error("Caso já está em votação do comitê.");
      }
      if (reportCase.status === "RESOLVED") {
        throw new Error("Caso já encerrado.");
      }

      await createImmutableAuditEvent(tx, {
        tenantId: allowed.user.tenantId,
        caseId: reportCase.id,
        actorUserId: allowed.user.id,
        action: "CASE_ABANDONMENT_CONFIRMED_BY_COMMITTEE",
        payload: {
          hasComment: Boolean(comment),
        },
      });

      await tx.case.update({
        where: { id: reportCase.id },
        data: {
          status: "AWAITING_COMMITTEE_APPROVAL",
          committeeDecisionStartedAt: new Date(),
        },
      });

      await createImmutableAuditEvent(tx, {
        tenantId: allowed.user.tenantId,
        caseId: reportCase.id,
        actorUserId: allowed.user.id,
        action: "CASE_PRE_CONCLUSION_PUBLISHED_TO_COMMITTEE",
        payload: {
          origin: "abandonment-confirmation",
        },
      });

      return {
        caseId: reportCase.id,
        status: "AWAITING_COMMITTEE_APPROVAL",
      };
    });

    const committee = await loadCommitteeCaseContext(allowed.user.tenantId, result.caseId);
    if (committee) {
      void sendCommitteeVoteRequiredNotification({
        ...committee,
        origin: "abandonment-confirmation",
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível confirmar abandono.",
      },
      { status: 400 },
    );
  }
}
