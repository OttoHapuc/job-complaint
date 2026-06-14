import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assessStagnation,
  classifyComplaintOutcome,
  type PipelineSnapshot,
} from "@/lib/pipeline/lifecycle";

export async function GET() {
  const now = new Date();
  const activeStatuses = [
    "OPEN",
    "IN_REVIEW",
    "WAITING_RESPONSE",
    "ESCALATED",
    "AWAITING_COMMITTEE_APPROVAL",
  ] as const;

  const cases = await prisma.case.findMany({
    where: { status: { in: [...activeStatuses] } },
    select: {
      id: true,
      tenantId: true,
      externalId: true,
      status: true,
      reviewConcludedAt: true,
      readyForCommitteeAt: true,
      pipelineState: {
        select: {
          currentStage: true,
          pendingQuestion: true,
          lastOutboundAt: true,
          nextContactAt: true,
        },
      },
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
      participants: {
        select: {
          inviteStatus: true,
          responses: { select: { id: true }, take: 1 },
        },
      },
      engagementSteps: {
        where: {
          status: "SCHEDULED",
          scheduledAt: { lte: now },
        },
        select: { id: true },
      },
      committeeDecisions: { select: { userId: true } },
    },
    take: 200,
  });

  const committeeCountByTenant = new Map<string, number>();
  const tenantIds = [...new Set(cases.map((item) => item.tenantId))];
  if (tenantIds.length > 0) {
    const counts = await prisma.user.groupBy({
      by: ["tenantId"],
      where: {
        tenantId: { in: tenantIds },
        isActive: true,
        isCorporateAccount: false,
      },
      _count: { _all: true },
    });
    for (const row of counts) {
      committeeCountByTenant.set(row.tenantId, row._count._all);
    }
  }

  const outboxCounts = await prisma.outboxMessage.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const outboxGlobal = {
    pending: outboxCounts.find((r) => r.status === "PENDING")?._count._all ?? 0,
    failed: outboxCounts.find((r) => r.status === "FAILED")?._count._all ?? 0,
    dead: outboxCounts.find((r) => r.status === "DEAD")?._count._all ?? 0,
  };

  const snapshots = await Promise.all(
    cases.map(async (reportCase) => {
      const [pending, failed, dead] = await Promise.all([
        prisma.outboxMessage.count({
          where: { caseId: reportCase.id, status: "PENDING" },
        }),
        prisma.outboxMessage.count({
          where: { caseId: reportCase.id, status: "FAILED" },
        }),
        prisma.outboxMessage.count({
          where: { caseId: reportCase.id, status: "DEAD" },
        }),
      ]);

      const abandonedBySilence = reportCase.auditEvents.some(
        (event) => event.action === "CASE_ABANDONMENT_THRESHOLD_REACHED",
      );
      const abandonmentConfirmed = reportCase.auditEvents.some(
        (event) => event.action === "CASE_ABANDONMENT_CONFIRMED_BY_COMMITTEE",
      );
      const pendingParticipants = reportCase.participants.filter(
        (participant) =>
          participant.responses.length === 0 && participant.inviteStatus !== "ACCEPTED",
      ).length;

      const tenantCommittee = committeeCountByTenant.get(reportCase.tenantId) ?? 0;

      const snapshot: PipelineSnapshot = {
        caseId: reportCase.id,
        status: reportCase.status,
        currentStage: reportCase.pipelineState?.currentStage ?? null,
        pendingQuestion: Boolean(reportCase.pipelineState?.pendingQuestion),
        lastOutboundAt: reportCase.pipelineState?.lastOutboundAt ?? null,
        nextContactAt: reportCase.pipelineState?.nextContactAt ?? null,
        reviewConcludedAt: reportCase.reviewConcludedAt,
        readyForCommitteeAt: reportCase.readyForCommitteeAt,
        abandonedBySilence,
        abandonmentConfirmed,
        outboxPending: pending,
        outboxFailed: failed,
        outboxDead: dead,
        pendingParticipants,
        overdueEngagementSteps: reportCase.engagementSteps.length,
        committeeVotesMissing: Math.max(
          0,
          tenantCommittee - reportCase.committeeDecisions.length,
        ),
      };

      return {
        externalId: reportCase.externalId,
        outcome: classifyComplaintOutcome(snapshot),
        stagnation: assessStagnation(snapshot, now),
        snapshot,
      };
    }),
  );

  const stalled = snapshots.filter((item) => item.stagnation.length > 0);

  return NextResponse.json({
    ok: true,
    generatedAt: now.toISOString(),
    outbox: outboxGlobal,
    activeCases: snapshots.length,
    stalledCases: stalled.length,
    cases: snapshots,
  });
}
