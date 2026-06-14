import type { NextRequest } from "next/server";

function readBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization")?.trim();
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return null;
  return authHeader.slice(7).trim();
}

export function isInternalJobAuthorized(request: NextRequest) {
  const outboxSecret = process.env.OUTBOX_PROCESSOR_SECRET?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();
  const providedHeader = request.headers.get("x-outbox-secret")?.trim();
  const providedBearer = readBearerToken(request);
  const providedQuery = request.nextUrl.searchParams.get("secret")?.trim();

  const candidates = [providedHeader, providedBearer, providedQuery].filter(Boolean) as string[];
  if (candidates.length === 0) {
    return !outboxSecret && !cronSecret;
  }

  const allowed = new Set([outboxSecret, cronSecret].filter(Boolean) as string[]);
  if (allowed.size === 0) return true;
  return candidates.some((value) => allowed.has(value));
}
