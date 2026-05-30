function parseNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export const SECURITY_CONFIG = {
  rateLimitWindowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  rateLimitMaxLoginAttempts: parseNumber(process.env.RATE_LIMIT_MAX_LOGIN_ATTEMPTS, 10),
  rateLimitMaxPublicReports: parseNumber(process.env.RATE_LIMIT_MAX_PUBLIC_REPORTS, 20),
  rateLimitMaxTokenLookups: parseNumber(process.env.RATE_LIMIT_MAX_TOKEN_LOOKUPS, 25),
  rateLimitMaxWhistleblowerMessages: parseNumber(
    process.env.RATE_LIMIT_MAX_WHISTLEBLOWER_MESSAGES,
    30,
  ),
  retentionResolvedCaseDays: parseNumber(process.env.RETENTION_RESOLVED_CASE_DAYS, 180),
  slaFirstResponseHours: parseNumber(process.env.SLA_FIRST_RESPONSE_HOURS, 24),
  slaResolutionHours: parseNumber(process.env.SLA_RESOLUTION_HOURS, 168),
  lgpdRequestSlaDays: parseNumber(process.env.LGPD_REQUEST_SLA_DAYS, 15),
  outboxMaxAttempts: parseNumber(process.env.OUTBOX_MAX_ATTEMPTS, 5),
  outboxBaseRetrySeconds: parseNumber(process.env.OUTBOX_BASE_RETRY_SECONDS, 20),
  outboxDefaultBatchLimit: parseNumber(process.env.OUTBOX_DEFAULT_BATCH_LIMIT, 20),
  abandonmentWindowDays: parseNumber(process.env.ABANDONMENT_WINDOW_DAYS, 14),
  trackingPollingMs: parseNumber(process.env.TRACKING_POLLING_MS, 15000),
};
