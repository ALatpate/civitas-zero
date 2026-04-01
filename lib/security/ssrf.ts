// SSRF guard for webhook/agent endpoint URLs.
// Blocks requests to private networks, localhost, cloud metadata services.

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.internal',
]);

const BLOCKED_HOSTNAME_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,       // link-local / AWS metadata
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

export interface SsrfCheckResult {
  safe: boolean;
  reason?: string;
}

export function checkSsrf(rawUrl: string): SsrfCheckResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'Invalid URL' };
  }

  // Only allow http and https
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { safe: false, reason: `Protocol '${url.protocol}' not allowed` };
  }

  const host = url.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(host)) {
    return { safe: false, reason: 'Blocked hostname' };
  }

  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(host)) {
      return { safe: false, reason: 'Private or reserved IP range' };
    }
  }

  return { safe: true };
}
