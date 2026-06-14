import { CommitteeDecision } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createImmutableAuditEvent } from "@/lib/audit";
import { canVoteAsCommittee, requirePermission } from "@/lib/permissions";
import { isCaseInInitialAnalysisWindow } from "@/lib/case-visibility";
import { loadCommitteeCaseContext } from "@/lib/committee-recipients";
import {
  sendCommitteeCaseReturnedNotification,
  sendWhistleblowerCaseResolvedNotification,
} from "@/lib/notifications";
import { loadWhistleblowerNotifyTargetByCaseId } from "@/lib/whistleblower-contact";

type VoteBody = {
  decision?: "APPROVE" | "REJECT";
  comment?: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const allowed = await requirePermission(request, "case.vote_close");
  if (!allowed.ok) return allowed.response;
  if (!canVoteAsCommittee(allowed.user)) {
    return NextResponse.json({ error: "Somente membros do comitê podem votar." }, { status: 403 });
  }

  let body: VoteBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  if (!body.decision) {
    return NextResponse.json({ error: "Campo decision é obrigatório." }, { status: 400 });
  }

  const { id } = await context.params;
  const externalId = `CASO-${id.toUpperCase()}`;
  const decision = CommitteeDecision[body.decision];
  const comment = body.comment?.trim();

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
          "Caso em prazo inicial de análise. Votação do comitê ainda indisponível.",
        );
      }
      if (reportCase.status !== "AWAITING_COMMITTEE_APPROVAL") {
        throw new Error("Caso ainda não está em votação de comitê.");
      }

      const vote = await tx.caseCommitteeDecision.upsert({
        where: {
          caseId_userId: {
            caseId: reportCase.id,
            userId: allowed.user.id,
          },
        },
        update: {
          decision,
          comment: comment || null,
        },
        create: {
          tenantId: allowed.user.tenantId,
          caseId: reportCase.id,
          userId: allowed.user.id,
          decision,
          comment: comment || null,
        },
      });

      await createImmutableAuditEvent(tx, {
        tenantId: allowed.user.tenantId,
        caseId: reportCase.id,
        actorUserId: allowed.user.id,
        action: "CASE_COMMITTEE_VOTE_RECORDED",
        payload: {
          decision: vote.decision,
          hasComment: !!comment,
        },
      });

      const requiredMembers = await tx.user.findMany({
        where: {
          tenantId: allowed.user.tenantId,
          isActive: true,
          isCorporateAccount: false,
        },
        select: { id: true },
      });
      const decisions = await tx.caseCommitteeDecision.findMany({
        where: {
          caseId: reportCase.id,
          userId: { in: requiredMembers.map((member) => member.id) },
        },
        select: {
          userId: true,
          decision: true,
        },
      });
      const hasAllVotes = requiredMembers.every((member) =>
        decisions.some((voteItem) => voteItem.userId === member.id),
      );
      const hasAnyReject = decisions.some((voteItem) => voteItem.decision === "REJECT");
      const allApproved =
        hasAllVotes &&
        !hasAnyReject &&
        decisions.length === requiredMembers.length &&
        requiredMembers.length > 0;

      let nextStatus: "AWAITING_COMMITTEE_APPROVAL" | "RESOLVED" | "IN_REVIEW" =
        reportCase.status;
      if (allApproved) {
        await tx.case.update({
          where: { id: reportCase.id },
          data: {
            status: "RESOLVED",
            closedAt: new Date(),
          },
        });
        nextStatus = "RESOLVED";
        await createImmutableAuditEvent(tx, {
          tenantId: allowed.user.tenantId,
          caseId: reportCase.id,
          actorUserId: allowed.user.id,
          action: "CASE_RESOLVED_BY_COMMITTEE_CONSENSUS",
          payload: {
            requiredVoters: requiredMembers.length,
          },
        });
      } else if (hasAnyReject) {
        await tx.case.update({
          where: { id: reportCase.id },
          data: {
            status: "IN_REVIEW",
          },
        });
        nextStatus = "IN_REVIEW";
        await createImmutableAuditEvent(tx, {
          tenantId: allowed.user.tenantId,
          caseId: reportCase.id,
          actorUserId: allowed.user.id,
          action: "CASE_RETURNED_TO_INVESTIGATION_BY_COMMITTEE_REJECTION",
          payload: {
            requiredVoters: requiredMembers.length,
          },
        });
      }

      return {
        nextStatus,
        votesCount: decisions.length,
        requiredVotes: requiredMembers.length,
        hasAnyReject,
        allApproved,
        caseId: reportCase.id,
      };
    });

    const { caseId: resolvedCaseId, ...publicResult } = result;

    if (publicResult.allApproved) {
      const whistleblower = await loadWhistleblowerNotifyTargetByCaseId(resolvedCaseId);
      if (whistleblower) {
        void sendWhistleblowerCaseResolvedNotification(whistleblower).catch(() => {});
      }
    } else if (publicResult.hasAnyReject) {
      const committee = await loadCommitteeCaseContext(allowed.user.tenantId, resolvedCaseId);
      if (committee) {
        void sendCommitteeCaseReturnedNotification(committee).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, ...publicResult });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível registrar voto." },
      { status: 400 },
    );
  }
}
