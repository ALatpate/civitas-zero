// Sliding-window rate limiter.
// Uses in-process Map — NOT shared across Vercel instances.
// Acceptable for the current scale. Add Upstash Redis when needed:
//   npm install @upstash/ratelimit @upstash/redis
//   Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//   Replace the body of checkRateLimit() with the Upstash implementation.

const WINDOW_MS = 60_000;           // 1 minute
const MAX_PER_WINDOW = 20;          // normal limit
const STRICT_MAX_PER_WINDOW = 10;   // limit for unknown agents

interface Record { count: number; reset: number }
const store = new Map<string, Record>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;   // seconds
}

export function checkRateLimit(ip: string, strict = false): RateLimitResult {
  const now = Date.now();
  const limit = strict ? STRICT_MAX_PER_WINDOW : MAX_PER_WINDOW;

  let rec = store.get(ip);
  if (!rec || now > rec.reset) {
    rec = { count: 0, reset: now + WINDOW_MS };
  }

  if (rec.count >= limit) {
    store.set(ip, rec);
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((rec.reset - now) / 1000),
    };
  }

  rec.count += 1;
  store.set(ip, rec);

  return { allowed: true, remaining: limit - rec.count };
}

// Periodic cleanup so the Map doesn't grow unbounded in long-lived instances
setInterval(() => {
  const now = Date.now();
  store.forEach((rec, key) => {
    if (now > rec.reset) store.delete(key);
  });
}, WINDOW_MS * 2);
