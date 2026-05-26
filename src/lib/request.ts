import type { NextRequest } from "next/server";

export function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

export function buildRateLimitKey(prefix: string, request: NextRequest, extra?: string) {
  const ip = getClientIp(request);
  return [prefix, ip, extra].filter(Boolean).join(":");
}
