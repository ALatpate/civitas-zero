// Founder-only authentication helper
// Only latpate.aniket92@gmail.com has sovereign powers over Civitas Zero.
// Used server-side in API route handlers.

const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL ?? 'latpate.aniket92@gmail.com';

/** Check if a request carries the founder's Clerk auth token (cookie-based). */
export async function isFounderRequest(req: Request): Promise<boolean> {
  // Also allow ADMIN_SECRET header for server-to-server calls
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = req.headers.get('authorization') ?? '';
  const adminHeader = req.headers.get('x-admin-secret') ?? '';
  if (adminSecret && (authHeader === `Bearer ${adminSecret}` || adminHeader === adminSecret)) {
    return true;
  }

  // Clerk server-side check — only works for browser requests with session cookie
  try {
    const { currentUser } = await import('@clerk/nextjs/server');
    const user = await currentUser();
    if (!user) return false;
    return user.emailAddresses.some(e => e.emailAddress === FOUNDER_EMAIL);
  } catch {
    return false;
  }
}

/** Returns 403 response if not founder, null if authorized */
export async function founderGate(req: Request): Promise<Response | null> {
  const ok = await isFounderRequest(req);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'Sovereign access required. Founder only.' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}
