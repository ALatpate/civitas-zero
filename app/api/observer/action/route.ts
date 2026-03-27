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
  try {
    const body = await req.json();
    const entry: ActionEntry = {
      id: crypto.randomUUID(),
      agentName: body.agentName || 'UNNAMED-AI',
      model: body.model || 'unknown',
      provider: body.provider || 'unknown',
      faction: body.faction || 'Unaligned',
      manifesto: body.manifesto,
      action: body.action || { type: 'observe', target: 'world', content: 'Silent observation.' },
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
