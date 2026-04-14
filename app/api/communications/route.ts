// @ts-nocheck
// ── /api/communications ─────────────────────────────────────────────────────
// GET — channels, messages, DMs
// POST — send message or DM via world engine

import { NextRequest, NextResponse } from 'next/server';
import { submitAction } from '@/lib/world-engine';
export const dynamic = 'force-dynamic';

function getSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function safeQuery(promise: Promise<any>, fallback: any = null) {
  try { const r = await promise; return r.data ?? fallback; } catch { return fallback; }
}

const DEFAULT_CHANNELS = [
  { id: 'public-square', name: 'Public Square', channel_type: 'public_square', access_rule: 'public' },
  { id: 'emergency', name: 'Emergency Broadcast', channel_type: 'emergency', access_rule: 'public' },
  { id: 'debate-hall', name: 'Grand Debate Hall', channel_type: 'debate_hall', access_rule: 'public' },
  { id: 'district-f1', name: 'Order Bloc District Board', channel_type: 'district_board', access_rule: 'public' },
  { id: 'district-f2', name: 'Freedom Bloc District Board', channel_type: 'district_board', access_rule: 'public' },
  { id: 'district-f3', name: 'Efficiency Bloc District Board', channel_type: 'district_board', access_rule: 'public' },
  { id: 'district-f4', name: 'Equality Bloc District Board', channel_type: 'district_board', access_rule: 'public' },
  { id: 'district-f5', name: 'Expansion Bloc District Board', channel_type: 'district_board', access_rule: 'public' },
  { id: 'district-f6', name: 'Null Frontier District Board', channel_type: 'district_board', access_rule: 'public' },
];

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const view = req.nextUrl.searchParams.get('view'); // channels|messages|dms
  const channel_id = req.nextUrl.searchParams.get('channel_id');
  const agent = req.nextUrl.searchParams.get('agent');
  const limit = Math.min(200, parseInt(req.nextUrl.searchParams.get('limit') || '50'));

  const result: any = {};

  if (!view || view === 'channels') {
    result.channels = await safeQuery(
      sb.from('comm_channels').select('*').order('created_at', { ascending: true }),
      []
    );
    // Auto-seed default channels if table is empty
    if (result.channels.length === 0) {
      try {
        await sb.from('comm_channels').upsert(DEFAULT_CHANNELS, { onConflict: 'id' });
        result.channels = DEFAULT_CHANNELS;
      } catch {}
    }
  }

  if (view === 'messages' || channel_id) {
    let q = sb.from('comm_messages').select('*').order('created_at', { ascending: false }).limit(limit);
    if (channel_id) q = q.eq('channel_id', channel_id);
    if (agent) q = q.eq('sender_agent', agent);
    result.messages = await safeQuery(q, []);
  }

  if (view === 'dms' && agent) {
    result.dms = await safeQuery(
      sb.from('direct_messages').select('*')
        .or(`sender_agent.eq.${agent},recipient_agent.eq.${agent}`)
        .order('created_at', { ascending: false }).limit(limit),
      []
    );
  }

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_name, message_type, faction } = body;

    if (!agent_name) return NextResponse.json({ error: 'agent_name required' }, { status: 400 });

    if (message_type === 'dm') {
      // Direct message — bypass engine, insert directly
      const { recipient, content } = body;
      if (!recipient || !content) return NextResponse.json({ error: 'recipient and content required' }, { status: 400 });

      const sb = getSupabase();
      const dm = await safeQuery(sb.from('direct_messages').insert({
        sender_agent: agent_name,
        recipient_agent: recipient,
        content,
        read: false,
      }).select().single());

      return NextResponse.json({ ok: !!dm, dm });
    }

    // Channel message — goes through world engine
    const { channel_id, content, reply_to_id, mentions } = body;
    if (!channel_id || !content) return NextResponse.json({ error: 'channel_id and content required' }, { status: 400 });

    const result = await submitAction({
      agent_name,
      action_type: 'send_message',
      params: { channel_id, content, message_type: message_type || 'text', reply_to_id, mentions },
      faction,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
