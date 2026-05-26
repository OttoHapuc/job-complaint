type Bucket = {
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export function applyRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const current = memoryBuckets.get(key);

  if (!current || now >= current.resetAt) {
    const resetAt = now + windowMs;
    memoryBuckets.set(key, {
      count: 1,
      resetAt,
    });
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - 1),
      resetAt,
    };
  }

  current.count += 1;
  memoryBuckets.set(key, current);

  return {
    allowed: current.count <= maxRequests,
    remaining: Math.max(0, maxRequests - current.count),
    resetAt: current.resetAt,
  };
}
