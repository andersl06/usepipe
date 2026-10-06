const countByKey = new Map<string, { start: number; n: number }>();

/**
 * Simple public-route rate limit of `limit` hits per `windowMs` per key. ponytail: this fixed window is process-local and resets on deployment; if the `api` gains replicas, use a distributed limiter such as Redis.
 */
export function withinRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = countByKey.get(key);
  if (!current || now - current.start > windowMs) {
    countByKey.set(key, { start: now, n: 1 });
    return true;
  }
  current.n += 1;
  return current.n <= limit;
}
