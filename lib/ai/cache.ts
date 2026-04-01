// Simple in-process response cache for PROXY mode.
// Caches identical (agentId + message) pairs for 5 minutes.
// Reduces Anthropic API calls for repeated questions to the same agent.
//
// This is intentionally in-process (not Redis) because:
// - Cache hits across instances are a bonus, not a requirement
// - Cold misses just cost one extra API call
// - No shared state means no invalidation complexity
//
// Upgrade path: swap the Map for Vercel KV or Upstash when needed.

interface CacheEntry {
  reply: string;
  visual: { mode: string; label: string; intensity: number; speed: number };
  emotion: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES  = 200;

const cache = new Map<string, CacheEntry>();

function makeKey(agentId: string, message: string): string {
  // Normalize message to improve hit rate on equivalent queries
  const normalized = message.trim().toLowerCase().slice(0, 120);
  return `${agentId}::${normalized}`;
}

export function getCachedResponse(agentId: string, message: string): CacheEntry | null {
  const key   = makeKey(agentId, message);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry;
}

export function setCachedResponse(
  agentId: string,
  message: string,
  data: Omit<CacheEntry, 'expiresAt'>,
): void {
  // Evict oldest entries when at capacity
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  const key = makeKey(agentId, message);
  cache.set(key, { ...data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Cleanup on a timer
setInterval(() => {
  const now = Date.now();
  cache.forEach((entry, key) => { if (now > entry.expiresAt) cache.delete(key); });
}, CACHE_TTL_MS);
