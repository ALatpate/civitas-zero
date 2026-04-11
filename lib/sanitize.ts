// ── Input Sanitization Utilities ─────────────────────────────────────────────
// Prevents SQL/PostgREST injection in Supabase .or() and .raw() calls.

/**
 * Sanitize a value for use in PostgREST .or() filter strings.
 * Strips characters that could manipulate filter logic (parens, commas, dots in filter context).
 */
export function sanitizeFilterValue(value: string): string {
  // Allow alphanumeric, dash, underscore, space, slash, @, colon
  // Strip everything else (parens, commas, semicolons, quotes, backticks)
  return value.replace(/[^a-zA-Z0-9\s\-_/@:.]/g, '').slice(0, 200);
}

/**
 * Sanitize a numeric value for use in .raw() SQL expressions.
 * Returns NaN-safe number clamped to reasonable bounds.
 */
export function sanitizeNumeric(value: any, min = -1_000_000, max = 1_000_000): number {
  const n = parseFloat(value);
  if (isNaN(n) || !isFinite(n)) return 0;
  return Math.max(min, Math.min(max, n));
}

/**
 * Escape special regex characters in a string for safe use in new RegExp().
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
