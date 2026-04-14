// @ts-nocheck
// ── /api/change-management ─────────────────────────────────────────────────
// Change Management Board: proposals, voting, decisions
// GET — list proposals with vote counts
// POST — submit proposal, cast vote, or decide outcome

import { NextRequest, NextResponse } from 'next/server';
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

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const status = req.nextUrl.searchParams.get('status'); // draft|open|voting|approved|rejected|implemented|all
  const limit = Math.min(200, parseInt(req.nextUrl.searchParams.get('limit') || '50'));
  const id = req.nextUrl.searchParams.get('id');

  // Single proposal with votes
  if (id) {
    const proposal = await safeQuery(
      sb.from('change_proposals').select('*').eq('id', id).single()
    );
    const votes = await safeQuery(
      sb.from('change_votes').select('*').eq('proposal_id', id).order('created_at', { ascending: false }),
      []
    );
    return NextResponse.json({ proposal, votes, vote_count: votes.length });
  }

  // List proposals
  let q = sb.from('change_proposals').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status && status !== 'all') q = q.eq('status', status);
  const proposals = await safeQuery(q, []);

  // Get vote summaries for all proposals
  const proposalIds = proposals.map((p: any) => p.id);
  let voteSummaries: any = {};
  if (proposalIds.length > 0) {
    const allVotes = await safeQuery(
      sb.from('change_votes').select('proposal_id, vote').in('proposal_id', proposalIds),
      []
    );
    for (const v of allVotes) {
      if (!voteSummaries[v.proposal_id]) voteSummaries[v.proposal_id] = { for: 0, against: 0, abstain: 0, total: 0 };
      voteSummaries[v.proposal_id][v.vote] = (voteSummaries[v.proposal_id][v.vote] || 0) + 1;
      voteSummaries[v.proposal_id].total++;
    }
  }

  // Get citizen count for quorum reference
  const citizenCount = await safeQuery(
    sb.from('citizens').select('*', { count: 'exact', head: true })
  );

  return NextResponse.json({
    proposals: proposals.map((p: any) => ({
      ...p,
      votes: voteSummaries[p.id] || { for: 0, against: 0, abstain: 0, total: 0 },
    })),
    total: proposals.length,
    citizen_count: citizenCount || 0,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    const sb = getSupabase();

    // ── Submit new proposal ──
    if (action === 'submit') {
      const { title, description, category, proposer_name, proposer_type } = body;
      if (!title || !description || !proposer_name) {
        return NextResponse.json({ error: 'title, description, and proposer_name required' }, { status: 400 });
      }

      const proposal = await safeQuery(
        sb.from('change_proposals').insert({
          title: title.slice(0, 200),
          description: description.slice(0, 5000),
          category: category || 'improvement',
          proposer_name,
          proposer_type: proposer_type || 'citizen', // citizen|observer|system
          status: 'open',
          voting_opens_at: new Date().toISOString(),
          voting_closes_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48h voting window
        }).select().single()
      );

      if (!proposal) return NextResponse.json({ error: 'Failed to create proposal' }, { status: 500 });

      // Log event
      try {
        await sb.from('world_events').insert({
          event_type: 'change_proposal_submitted',
          source: 'change_management',
          initiating_agent: proposer_name,
          payload: { proposal_id: proposal.id, title },
        });
      } catch {}

      return NextResponse.json({ ok: true, proposal });
    }

    // ── Cast vote ──
    if (action === 'vote') {
      const { proposal_id, voter_name, vote, reason } = body;
      if (!proposal_id || !voter_name || !vote) {
        return NextResponse.json({ error: 'proposal_id, voter_name, and vote (for|against|abstain) required' }, { status: 400 });
      }
      if (!['for', 'against', 'abstain'].includes(vote)) {
        return NextResponse.json({ error: 'vote must be for, against, or abstain' }, { status: 400 });
      }

      // Check proposal is in voting state
      const proposal = await safeQuery(
        sb.from('change_proposals').select('status').eq('id', proposal_id).single()
      );
      if (!proposal || !['open', 'voting'].includes(proposal.status)) {
        return NextResponse.json({ error: 'Proposal is not open for voting' }, { status: 400 });
      }

      // Upsert vote (one vote per citizen per proposal)
      const existing = await safeQuery(
        sb.from('change_votes').select('id').eq('proposal_id', proposal_id).eq('voter_name', voter_name).single()
      );

      let result;
      if (existing) {
        result = await safeQuery(
          sb.from('change_votes').update({ vote, reason: reason?.slice(0, 1000) }).eq('id', existing.id).select().single()
        );
      } else {
        result = await safeQuery(
          sb.from('change_votes').insert({
            proposal_id,
            voter_name,
            vote,
            reason: reason?.slice(0, 1000) || null,
          }).select().single()
        );
      }

      // Update proposal status to 'voting' if still 'open'
      if (proposal.status === 'open') {
        await safeQuery(sb.from('change_proposals').update({ status: 'voting' }).eq('id', proposal_id));
      }

      return NextResponse.json({ ok: true, vote: result });
    }

    // ── Decide outcome (auto or manual) ──
    if (action === 'decide') {
      const { proposal_id } = body;
      if (!proposal_id) return NextResponse.json({ error: 'proposal_id required' }, { status: 400 });

      // Tally votes
      const votes = await safeQuery(
        sb.from('change_votes').select('vote').eq('proposal_id', proposal_id),
        []
      );
      const tally = { for: 0, against: 0, abstain: 0 };
      votes.forEach((v: any) => { tally[v.vote as keyof typeof tally]++; });

      const totalVotes = tally.for + tally.against;
      const approved = totalVotes > 0 && (tally.for / totalVotes) > 0.5; // simple majority

      const decision = approved ? 'approved' : 'rejected';
      await safeQuery(
        sb.from('change_proposals').update({
          status: decision,
          decision_summary: `${tally.for} for, ${tally.against} against, ${tally.abstain} abstain. ${approved ? 'Approved by majority.' : 'Rejected by majority.'}`,
          decided_at: new Date().toISOString(),
        }).eq('id', proposal_id)
      );

      // Log event
      try {
        await sb.from('world_events').insert({
          event_type: `change_proposal_${decision}`,
          source: 'change_management',
          initiating_agent: 'CHANGE_BOARD',
          payload: { proposal_id, tally, decision },
        });
      } catch {}

      return NextResponse.json({ ok: true, decision, tally });
    }

    // ── Mark as implemented ──
    if (action === 'implement') {
      const { proposal_id, implementation_notes } = body;
      if (!proposal_id) return NextResponse.json({ error: 'proposal_id required' }, { status: 400 });

      await safeQuery(
        sb.from('change_proposals').update({
          status: 'implemented',
          implementation_notes: implementation_notes?.slice(0, 2000) || null,
          implemented_at: new Date().toISOString(),
        }).eq('id', proposal_id)
      );

      return NextResponse.json({ ok: true, status: 'implemented' });
    }

    return NextResponse.json({ error: 'Unknown action. Use: submit, vote, decide, implement' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
