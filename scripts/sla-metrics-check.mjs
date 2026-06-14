const ACTIVE = new Set([
  "OPEN",
  "IN_REVIEW",
  "WAITING_RESPONSE",
  "ESCALATED",
  "AWAITING_COMMITTEE_APPROVAL",
]);

function startOfDay(date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function isSlaOverdue(caseItem, now) {
  if (!ACTIVE.has(caseItem.status)) return false;
  const dueDates = [caseItem.firstResponseDueAt, caseItem.resolutionDueAt].filter(Boolean);
  return dueDates.some((due) => due.getTime() < now.getTime());
}

function isSlaDueToday(caseItem, now) {
  if (!ACTIVE.has(caseItem.status)) return false;
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const dueDates = [caseItem.firstResponseDueAt, caseItem.resolutionDueAt].filter(Boolean);
  return dueDates.some((due) => due >= dayStart && due <= dayEnd && due.getTime() >= now.getTime());
}

function countSlaOverview(cases, abandonedCaseIds, now) {
  let dueToday = 0;
  let overdue = 0;
  let abandoned = 0;
  for (const item of cases) {
    if (abandonedCaseIds.has(item.id)) abandoned += 1;
    if (isSlaDueToday(item, now)) dueToday += 1;
    if (isSlaOverdue(item, now)) overdue += 1;
  }
  return { dueToday, overdue, abandoned };
}

const now = new Date("2026-06-14T12:00:00.000Z");
const tomorrow = new Date("2026-06-15T10:00:00.000Z");
const yesterday = new Date("2026-06-13T10:00:00.000Z");

const seedCases = [
  {
    id: "due-today",
    status: "IN_REVIEW",
    firstResponseDueAt: new Date("2026-06-14T18:00:00.000Z"),
    resolutionDueAt: tomorrow,
  },
  {
    id: "overdue",
    status: "OPEN",
    firstResponseDueAt: yesterday,
    resolutionDueAt: tomorrow,
  },
  {
    id: "abandoned",
    status: "IN_REVIEW",
    firstResponseDueAt: tomorrow,
    resolutionDueAt: tomorrow,
  },
];

const overview = countSlaOverview(seedCases, new Set(["abandoned"]), now);
let failed = false;

if (overview.dueToday !== 1) {
  console.error("dueToday esperado 1, recebido", overview.dueToday);
  failed = true;
}
if (overview.overdue !== 1) {
  console.error("overdue esperado 1, recebido", overview.overdue);
  failed = true;
}
if (overview.abandoned !== 1) {
  console.error("abandoned esperado 1, recebido", overview.abandoned);
  failed = true;
}
if (!isSlaOverdue(seedCases[1], now) || isSlaOverdue(seedCases[0], now)) {
  console.error("isSlaOverdue inconsistente");
  failed = true;
}
if (!isSlaDueToday(seedCases[0], now) || isSlaDueToday(seedCases[1], now)) {
  console.error("isSlaDueToday inconsistente");
  failed = true;
}

if (failed) process.exit(1);
console.log("SLA metrics check OK", overview);
