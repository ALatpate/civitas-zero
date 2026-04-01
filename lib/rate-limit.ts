// Distributed rate limiter with Upstash Redis backend.
//
// If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set → uses Upstash
// (shared across all Vercel instances, correct under horizontal scaling).
//
// Otherwise → falls back to in-process sliding window (single-instance only).
// A warning is logged on first use so you know to add the env vars.
//
// To enable Upstash:
//   1. Create a free database at https://upstash.com
//   2. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Vercel env

const WINDOW_MS  = 60_000;
const MAX_NORMAL = 20;
const MAX_STRICT = 10;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

// ── Upstash path ──────────────────────────────────────────────────────────────

let _upstashLimiter: unknown = null;
let _upstashInit = false;
let _warnedMissing = false;

async function getUpstashLimiter() {
  if (_upstashInit) return _upstashLimiter;
  _upstashInit = true;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!_warnedMissing) {
      console.warn('[rate-limit] UPSTASH env vars not set — using in-process limiter (not shared across instances)');
      _warnedMissing = true;
    }
    return null;
  }

  try {
    const { Redis }     = await import('@upstash/redis');
    const { Ratelimit } = await import('@upstash/ratelimit');
    const redis = new Redis({ url, token });
    _upstashLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(MAX_NORMAL, '60 s'),
      analytics: false,
      prefix: 'cz:rl',
    });
    return _upstashLimiter;
  } catch (e) {
    console.error('[rate-limit] Upstash init failed, falling back:', e);
    return null;
  }
}

// ── In-process fallback ───────────────────────────────────────────────────────

interface Rec { count: number; reset: number }
const store = new Map<string, Rec>();

function inProcessCheck(ip: string, strict = false): RateLimitResult {
  const now   = Date.now();
  const limit = strict ? MAX_STRICT : MAX_NORMAL;
  let rec = store.get(ip);
  if (!rec || now > rec.reset) rec = { count: 0, reset: now + WINDOW_MS };
  if (rec.count >= limit) {
    store.set(ip, rec);
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((rec.reset - now) / 1000) };
  }
  rec.count++;
  store.set(ip, rec);
  return { allowed: true, remaining: limit - rec.count };
}

setInterval(() => {
  const now = Date.now();
  store.forEach((rec, key) => { if (now > rec.reset) store.delete(key); });
}, WINDOW_MS * 2);

// ── Public API ────────────────────────────────────────────────────────────────

export async function checkRateLimit(ip: string, strict = false): Promise<RateLimitResult> {
  const limiter = (await getUpstashLimiter()) as any;
  if (limiter) {
    try {
      const key = strict ? `strict:${ip}` : ip;
      const { success, remaining, reset } = await limiter.limit(key);
      return {
        allowed: success,
        remaining,
        retryAfter: success ? undefined : Math.ceil((reset - Date.now()) / 1000),
      };
    } catch (e) {
      console.error('[rate-limit] Upstash check failed, falling back:', e);
    }
  }
  return inProcessCheck(ip, strict);
}
