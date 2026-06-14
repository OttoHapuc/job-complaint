import { CaseStatus } from "@prisma/client";

const ACTIVE_STATUSES: CaseStatus[] = [
  "OPEN",
  "IN_REVIEW",
  "WAITING_RESPONSE",
  "ESCALATED",
  "AWAITING_COMMITTEE_APPROVAL",
];

export function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

type SlaCaseInput = {
  status: CaseStatus;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
};

export function isSlaOverdue(caseItem: SlaCaseInput, now = new Date()) {
  if (!ACTIVE_STATUSES.includes(caseItem.status)) return false;
  const dueDates = [caseItem.firstResponseDueAt, caseItem.resolutionDueAt].filter(
    Boolean,
  ) as Date[];
  return dueDates.some((due) => due.getTime() < now.getTime());
}

export function isSlaDueToday(caseItem: SlaCaseInput, now = new Date()) {
  if (!ACTIVE_STATUSES.includes(caseItem.status)) return false;
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const dueDates = [caseItem.firstResponseDueAt, caseItem.resolutionDueAt].filter(
    Boolean,
  ) as Date[];
  return dueDates.some((due) => due >= dayStart && due <= dayEnd && due.getTime() >= now.getTime());
}

export function countSlaOverview<T extends SlaCaseInput>(
  cases: T[],
  abandonedCaseIds: Set<string>,
  getId: (item: T) => string,
  now = new Date(),
) {
  let dueToday = 0;
  let overdue = 0;
  let abandoned = 0;

  for (const item of cases) {
    const id = getId(item);
    if (abandonedCaseIds.has(id)) abandoned += 1;
    if (isSlaDueToday(item, now)) dueToday += 1;
    if (isSlaOverdue(item, now)) overdue += 1;
  }

  return { dueToday, overdue, abandoned };
}
