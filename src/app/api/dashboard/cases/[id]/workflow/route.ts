import { CaseStatus, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createImmutableAuditEvent } from "@/lib/audit";
import { requirePermission } from "@/lib/permissions";
import { ensureCouncilComposition } from "@/lib/organization-governance";
import { isCaseInInitialAnalysisWindow } from "@/lib/case-visibility";
import { encryptSensitiveText } from "@/lib/secure-data";

type UpdateWorkflowBody = {
  status?: "IN_REVIEW" | "WAITING_RESPONSE" | "AWAITING_COMMITTEE_APPROVAL";
  note?: string;
};

const ALLOWED_STATUS: CaseStatus[] = [
  CaseStatus.IN_REVIEW,
  CaseStatus.WAITING_RESPONSE,
  CaseStatus.AWAITING_COMMITTEE_APPROVAL,
];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const allowed = await requirePermission(request, "case.investigate");
  if (!allowed.ok) return allowed.response;

  let body: UpdateWorkflowBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const { id } = await context.params;
  const externalId = `CASO-${id.toUpperCase()}`;
  const targetStatus = body.status ? (CaseStatus[body.status] as CaseStatus) : undefined;
  const note = body.note?.trim();

  if (targetStatus && !ALLOWED_STATUS.includes(targetStatus)) {
    return NextResponse.json({ error: "Status não permitido para fluxo investigativo." }, { status: 400 });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const reportCase = await tx.case.findFirst({
        where: {
          tenantId: allowed.user.tenantId,
          externalId,
        },
        select: {
          id: true,
          externalId: true,
          status: true,
          restrictedUserIds: true,
          createdAt: true,
          reviewConcludedAt: true,
          preConclusionPackage: true,
        },
      });
      if (!reportCase) {
        throw new Error("Caso não encontrado.");
      }
      if (reportCase.restrictedUserIds.includes(allowed.user.id)) {
        throw new Error("Acesso bloqueado por conflito de interesse neste caso.");
      }
      if (
        isCaseInInitialAnalysisWindow({
          createdAt: reportCase.createdAt,
          reviewConcludedAt: reportCase.reviewConcludedAt,
        })
      ) {
        throw new Error(
          "Caso em prazo inicial de análise. Alterações de workflow ficam bloqueadas nesta fase.",
        );
      }
      if (targetStatus === CaseStatus.AWAITING_COMMITTEE_APPROVAL) {
        const governance = await ensureCouncilComposition(tx, allowed.user.tenantId);
        if (!governance.ok) {
          throw new Error(governance.reason);
        }
        if (!reportCase.preConclusionPackage) {
          throw new Error(
            "Pre-conclusão ainda não foi publicada. Gere o pacote antes de enviar ao comitê.",
          );
        }
      }

      const data: Prisma.CaseUpdateInput = {
        status: targetStatus,
      };
      if (targetStatus === CaseStatus.AWAITING_COMMITTEE_APPROVAL) {
        data.committeeDecisionStartedAt = new Date();
      }

      const caseUpdated = await tx.case.update({
        where: { id: reportCase.id },
        data,
        select: {
          id: true,
          externalId: true,
          status: true,
        },
      });

      if (note) {
        await tx.caseMessage.create({
          data: {
            tenantId: allowed.user.tenantId,
            caseId: caseUpdated.id,
            authorType: "COUNCIL",
            content: encryptSensitiveText(note),
          },
        });
      }

      await createImmutableAuditEvent(tx, {
        tenantId: allowed.user.tenantId,
        caseId: caseUpdated.id,
        actorUserId: allowed.user.id,
        action: "CASE_WORKFLOW_UPDATED",
        payload: {
          previousStatus: reportCase.status,
          newStatus: caseUpdated.status,
          hasNote: !!note,
        },
      });

      return caseUpdated;
    });

    return NextResponse.json({ ok: true, case: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar fluxo do caso." },
      { status: 400 },
    );
  }
}
