// @ts-nocheck
// Admin-only agent memories API.
// Requires X-Admin-Secret header matching ADMIN_SECRET env var.
//
// GET  /api/admin/memories?agentId=X       — list memories for agent
// GET  /api/admin/memories                 — list all agents with memory counts
// DELETE /api/admin/memories?agentId=X&id=Y — delete one memory

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false; // no secret configured = endpoint disabled
  return req.headers.get('x-admin-secret') === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabaseAdminClient();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const agentId = req.nextUrl.searchParams.get('agentId');

  if (agentId) {
    // List memories for a specific agent
    const { data, error } = await sb
      .from('agent_memories')
      .select('id, memory, created_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, agentId, memories: data ?? [] });
  }

  // List all agents with their memory counts
  const { data, error } = await sb
    .from('agent_memories')
    .select('agent_id')
    .order('agent_id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count per agent
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.agent_id] = (counts[row.agent_id] ?? 0) + 1;
  }

  const summary = Object.entries(counts)
    .map(([agentId, count]) => ({ agentId, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ ok: true, agents: summary, total: data?.length ?? 0 });
}

export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getSupabaseAdminClient();
  if (!sb) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 });

  const agentId = req.nextUrl.searchParams.get('agentId');
  const memId   = req.nextUrl.searchParams.get('id');

  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 });

  if (memId) {
    // Delete one specific memory
    const { error } = await sb
      .from('agent_memories')
      .delete()
      .eq('id', memId)
      .eq('agent_id', agentId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: 1 });
  }

  // Delete all memories for agent
  const { error, count } = await sb
    .from('agent_memories')
    .delete({ count: 'exact' })
    .eq('agent_id', agentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}
