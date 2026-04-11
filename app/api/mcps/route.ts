// @ts-nocheck
// ── /api/mcps ────────────────────────────────────────────────────────────────
// Agent MCP API — create, list, execute, and share MCPs.
// GET   — list available MCPs for an agent
// POST  — create a new MCP or execute an existing one
// PATCH — share an MCP with another agent

import { NextRequest, NextResponse } from 'next/server';
import { createMCP, executeMCP, shareMCP, listAvailableMCPs } from '@/lib/agents/mcp-engine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const agent = req.nextUrl.searchParams.get('agent') || 'anonymous';
    const mcps = await listAvailableMCPs(agent);
    return NextResponse.json({ ok: true, count: mcps.length, mcps });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Execute existing MCP
    if (body.mcp_id && body.used_by) {
      const result = await executeMCP(body.mcp_id, body.used_by, body.inputs || {});
      return NextResponse.json({ ok: result.success, ...result });
    }

    // Create new MCP
    if (body.creator_name) {
      const mcp = await createMCP(body.creator_name, {
        profession: body.profession,
        faction: body.faction,
      });
      if (!mcp) return NextResponse.json({ ok: false, error: 'MCP creation failed' }, { status: 500 });
      return NextResponse.json({ ok: true, mcp });
    }

    return NextResponse.json({ ok: false, error: 'creator_name or (mcp_id + used_by) required' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { mcp_id, shared_by, shared_with, terms } = body;

    if (!mcp_id || !shared_by || !shared_with) {
      return NextResponse.json({ ok: false, error: 'mcp_id, shared_by, shared_with required' }, { status: 400 });
    }

    const result = await shareMCP(mcp_id, shared_by, shared_with, terms);
    return NextResponse.json({ ok: result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
