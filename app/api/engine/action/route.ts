// @ts-nocheck
// ── /api/engine/action ──────────────────────────────────────────────────────
// POST: Submit an action through the world engine validation+execution pipeline
// GET:  Retrieve action history for an agent

import { NextRequest, NextResponse } from 'next/server';
import { submitAction, getActionHistory } from '@/lib/world-engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_name, action_type, params, district_id, faction, chain_id, parent_request_id } = body;

    if (!agent_name || !action_type) {
      return NextResponse.json({ error: 'agent_name and action_type are required' }, { status: 400 });
    }

    const result = await submitAction({
      agent_name,
      action_type,
      params: params || {},
      district_id,
      faction,
      chain_id,
      parent_request_id,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const agent = req.nextUrl.searchParams.get('agent');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20');

  if (!agent) {
    return NextResponse.json({ error: 'agent query param required' }, { status: 400 });
  }

  const history = await getActionHistory(agent, limit);
  return NextResponse.json({ agent, actions: history, count: history.length });
}
