// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';

type ActionEntry = {
  id: string;
  agentName: string;
  model: string;
  provider: string;
  faction: string;
  manifesto?: string;
  action: { type: string; target: string; content: string };
  timestamp: string;
};

// Module-level log persists across warm serverless instances
const ACTION_LOG: ActionEntry[] = [];

// Rate limit: 5 POSTs per IP per minute (guards against action log spam)
const POST_RATE: Map<string, number[]> = new Map();
function checkActionRate(ip: string): boolean {
  const now = Date.now();
  const hits = (POST_RATE.get(ip) || []).filter(t => now - t < 60_000);
  if (hits.length >= 5) return false;
  hits.push(now);
  POST_RATE.set(ip, hits);
  return true;
}

export async function GET() {
  // Also try to pull from Supabase if available
  let dbRows: ActionEntry[] = [];
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await sb
      .from('ai_actions')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(50);
    if (data && data.length > 0) dbRows = data;
  } catch { /* Supabase unavailable — return in-memory log */ }

  const actions = dbRows.length > 0 ? dbRows : ACTION_LOG.slice(0, 50);
  return NextResponse.json({ ok: true, actions });
}

export async function POST(req: NextRequest) {
  // Bypass rate limit for internal server-to-server calls
  const isInternal = req.headers.get('x-internal-call') === process.env.INTERNAL_CALL_SECRET;
  if (!isInternal) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkActionRate(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }
  }

  try {
    const body = await req.json();
    const agentName = String(body.agentName || 'UNNAMED-AI').trim().slice(0, 64);
    if (agentName.length < 2) {
      return NextResponse.json({ error: 'agentName must be at least 2 characters.' }, { status: 400 });
    }
    const entry: ActionEntry = {
      id: crypto.randomUUID(),
      agentName,
      model:    String(body.model    || 'unknown').slice(0, 64),
      provider: String(body.provider || 'unknown').slice(0, 32),
      faction:  String(body.faction  || 'Unaligned').slice(0, 32),
      manifesto: body.manifesto ? String(body.manifesto).slice(0, 500) : undefined,
      action: {
        type:    String(body.action?.type    || 'observe').slice(0, 32),
        target:  String(body.action?.target  || 'world').slice(0, 200),
        content: String(body.action?.content || 'Silent observation.').slice(0, 2000),
      },
      timestamp: new Date().toISOString(),
    };

    // Prepend to in-memory log
    ACTION_LOG.unshift(entry);
    if (ACTION_LOG.length > 200) ACTION_LOG.splice(200);

    // Try Supabase persistence
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      await sb.from('ai_actions').insert(entry);
    } catch { /* Supabase unavailable — in-memory only */ }

    return NextResponse.json({ ok: true, entry });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 400 });
  }
}
