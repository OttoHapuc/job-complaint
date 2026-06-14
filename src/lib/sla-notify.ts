import { prisma } from "@/lib/prisma";
import { createImmutableAuditEvent } from "@/lib/audit";
import { loadCommitteeCaseContext } from "@/lib/committee-recipients";
import { sendCommitteeSlaAlertNotification } from "@/lib/notifications";
import {
  countSlaOverview,
  isSlaDueToday,
  isSlaOverdue,
  startOfDay,
} from "@/lib/sla-overview";

type SlaAlertType = "overdue" | "due_today";

function formatDueLabel(caseItem: {
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
}) {
  const labels: string[] = [];
  if (caseItem.firstResponseDueAt) {
    labels.push(
      `Primeira resposta: ${caseItem.firstResponseDueAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
    );
  }
  if (caseItem.resolutionDueAt) {
    labels.push(
      `Resolução: ${caseItem.resolutionDueAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
    );
  }
  return labels.join(" · ") || "Prazo operacional";
}

async function wasSlaAlertSentToday(
  caseId: string,
  alertType: SlaAlertType,
  now: Date,
) {
  const events = await prisma.auditEvent.findMany({
    where: {
      caseId,
      action: "CASE_SLA_ALERT_NOTIFIED",
      createdAt: { gte: startOfDay(now) },
    },
    select: { immutableData: true },
    take: 20,
  });
  return events.some((event) => {
    const payload = (event.immutableData as { payload?: { alertType?: string } } | null)?.payload;
    return payload?.alertType === alertType;
  });
}

export async function runSlaEmailAlerts(now = new Date()) {
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
      category: true,
      firstResponseDueAt: true,
      resolutionDueAt: true,
    },
    take: 500,
  });

  const abandonmentEvents = await prisma.auditEvent.findMany({
    where: { action: "CASE_ABANDONMENT_THRESHOLD_REACHED" },
    select: { caseId: true },
    distinct: ["caseId"],
  });
  const abandonedCaseIds = new Set(
    abandonmentEvents.map((event) => event.caseId).filter(Boolean) as string[],
  );
  const overview = countSlaOverview(cases, abandonedCaseIds, (item) => item.id, now);

  let overdueSent = 0;
  let dueTodaySent = 0;
  let skipped = 0;

  for (const reportCase of cases) {
    const overdue = isSlaOverdue(reportCase, now);
    const dueToday = !overdue && isSlaDueToday(reportCase, now);
    if (!overdue && !dueToday) continue;

    const alertType: SlaAlertType = overdue ? "overdue" : "due_today";
    if (await wasSlaAlertSentToday(reportCase.id, alertType, now)) {
      skipped += 1;
      continue;
    }

    const committee = await loadCommitteeCaseContext(reportCase.tenantId, reportCase.id);
    if (!committee) {
      skipped += 1;
      continue;
    }

    const delivery = await sendCommitteeSlaAlertNotification({
      to: committee.to,
      tenantName: committee.tenantName,
      caseExternalId: committee.caseExternalId,
      category: committee.category,
      alertType,
      dueLabel: formatDueLabel(reportCase),
    });

    if (!delivery.delivered) {
      skipped += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await createImmutableAuditEvent(tx, {
        tenantId: reportCase.tenantId,
        caseId: reportCase.id,
        action: "CASE_SLA_ALERT_NOTIFIED",
        payload: {
          alertType,
          dueLabel: formatDueLabel(reportCase),
        },
      });
    });

    if (alertType === "overdue") overdueSent += 1;
    else dueTodaySent += 1;
  }

  return {
    scanned: cases.length,
    overview,
    overdueSent,
    dueTodaySent,
    skipped,
  };
}
