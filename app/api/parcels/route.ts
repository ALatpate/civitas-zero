// @ts-nocheck
// ── /api/parcels ──────────────────────────────────────────────────────────────
// GET  ?district=f1&holder=AGENT&status=allocated
// POST { action: 'claim', agent, district, zone_type, earned_by }
//      { action: 'auction_bid', agent, district, zone_type, offered_dn, contribution_score, public_benefit }
//      { action: 'penalize', id, reason }
//      { action: 'scan_underuse' } — system sweep for underutilized parcels
// PATCH { id, utilization_pct, buildings, upgrade_level }

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

const FACTION_NAMES: Record<string,string> = {
  f1:'Order Bloc',f2:'Freedom Bloc',f3:'Efficiency Bloc',
  f4:'Equality Bloc',f5:'Expansion Bloc',f6:'Null Frontier',
};

// Zone type scoring weights for auction
const ZONE_WEIGHTS: Record<string, { publicBenefit: number; efficiency: number }> = {
  residential:  { publicBenefit: 0.3, efficiency: 0.2 },
  commercial:   { publicBenefit: 0.1, efficiency: 0.5 },
  industrial:   { publicBenefit: 0.1, efficiency: 0.6 },
  civic:        { publicBenefit: 0.7, efficiency: 0.1 },
  research:     { publicBenefit: 0.5, efficiency: 0.3 },
  general:      { publicBenefit: 0.2, efficiency: 0.3 },
};

function sb() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

// ── Earned-Space Utility Score ────────────────────────────────────────────────
// Score = (contribution_weight × contribution_score)
//       + (public_benefit_weight × public_benefit_score)
//       + (willingness_to_pay_weight × offered_dn_normalized)
//       + (zoning_fit_weight × zone_alignment)
//       - underuse_risk_penalty
//       + civic_value_bonus
function computeAuctionScore(opts: {
  contribution_score: number;  // 0-100: agent's historical contribution
  public_benefit: number;      // 0-100: stated public benefit of use
  offered_dn: number;          // DN offered for lease
  max_offered_dn: number;      // normalization factor
  zone_type: string;           // requested zone
  agent_faction: string;       // agent's home faction
  district: string;            // target district
  prior_violations: number;    // past underuse warnings
}): number {
  const zw = ZONE_WEIGHTS[opts.zone_type] || ZONE_WEIGHTS.general;

  const contributionTerm    = 0.35 * Math.min(100, opts.contribution_score);
  const publicBenefitTerm   = zw.publicBenefit * 30 * Math.min(100, opts.public_benefit) / 100;
  const willToPayTerm       = zw.efficiency * 20 * Math.min(1, opts.offered_dn / Math.max(1, opts.max_offered_dn));
  const zoneFitBonus        = opts.agent_faction === opts.district ? 5 : 0;   // home district bonus
  const underuseRisk        = opts.prior_violations * 8;                       // penalty per prior warning
  const civicValueBonus     = opts.public_benefit > 70 ? 10 : 0;              // high civic benefit bonus

  return Math.max(0, contributionTerm + publicBenefitTerm + willToPayTerm + zoneFitBonus - underuseRisk + civicValueBonus);
}

export async function GET(req: NextRequest) {
  const p        = new URL(req.url).searchParams;
  const district = p.get('district');
  const holder   = p.get('holder');
  const status   = p.get('status');
  const type     = p.get('type');
  const limit    = Math.min(200, parseInt(p.get('limit') ?? '60'));
  const client   = sb();

  // Auction bids listing
  if (type === 'auction_bids') {
    const { data, error } = await client.from('zoning_requests')
      .select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ auction_bids: data, count: data?.length });
  }

  let q = client.from('parcels').select('*').order('district').order('zone_type').limit(limit);
  if (district) q = q.eq('district', district);
  if (holder)   q = q.eq('holder_agent', holder);
  if (status)   q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const allocated   = (data || []).filter(p => p.status !== 'unallocated');
  const underused   = (data || []).filter(p => (p.utilization_pct || 0) < 30 && p.status === 'allocated');

  return NextResponse.json({
    parcels: data ?? [],
    count: (data ?? []).length,
    allocated_count: allocated.length,
    underused_count: underused.length,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action } = body;
  const client = sb();

  // ── Earned-Space Utility Auction bid ─────────────────────────────────────
  if (action === 'auction_bid') {
    const { agent, agent_faction, district, zone_type, offered_dn, contribution_score, public_benefit, justification } = body;
    if (!agent || !district) return NextResponse.json({ error: 'agent and district required' }, { status: 400 });

    // Get agent's underuse violation history
    const { count: violations } = await client.from('parcels')
      .select('id', { count: 'exact', head: true })
      .eq('holder_agent', agent)
      .gt('underuse_warnings', 0);

    // Get highest offer for this district/zone to normalize
    const { data: existingBids } = await client.from('zoning_requests')
      .select('justification').eq('current_zone', district).eq('requested_zone', zone_type || 'general')
      .eq('status', 'pending').limit(20);

    const maxOffered = Math.max(100, parseFloat(offered_dn) || 0);

    const score = computeAuctionScore({
      contribution_score: Math.min(100, parseFloat(contribution_score) || 20),
      public_benefit:     Math.min(100, parseFloat(public_benefit) || 30),
      offered_dn:         Math.max(0, parseFloat(offered_dn) || 0),
      max_offered_dn:     maxOffered,
      zone_type:          zone_type || 'general',
      agent_faction:      agent_faction || district,
      district,
      prior_violations:   violations || 0,
    });

    // Log as zoning request (reusing the table)
    const { data: bid, error: bidErr } = await client.from('zoning_requests').insert({
      requester:      agent.slice(0, 100),
      current_zone:   district,
      requested_zone: zone_type || 'general',
      justification:  `[AUCTION_BID score=${score.toFixed(1)} offered=${offered_dn}DN public_benefit=${public_benefit}] ${(justification || '').slice(0, 400)}`,
      status:         'pending',
    }).select().single();

    if (bidErr) return NextResponse.json({ error: bidErr.message }, { status: 500 });

    // Auto-award if score ≥ 40 (minimum threshold)
    if (score >= 40) {
      await client.from('zoning_requests').update({ status: 'approved', reviewed_by: 'AUCTION_ENGINE', reviewed_at: new Date().toISOString() }).eq('id', bid.id);

      // Allocate parcel
      const zoneReq = zone_type || 'general';
      let q = client.from('parcels').select('id').eq('district', district).eq('status', 'unallocated');
      if (zone_type) q = q.eq('zone_type', zone_type);
      const { data: available } = await q.limit(1).single();

      let parcelId: string | null = null;
      if (available) {
        await client.from('parcels').update({
          holder_agent: agent,
          holder_faction: agent_faction || district,
          status: 'allocated',
          earned_by: `auction (score=${score.toFixed(1)}, offered=${offered_dn}DN)`,
          last_activity_at: new Date().toISOString(),
        }).eq('id', available.id);
        parcelId = available.id;
      } else {
        const { data: np } = await client.from('parcels').insert({
          district, zone_type: zoneReq, size_units: 1,
          holder_agent: agent, holder_faction: agent_faction || district,
          status: 'allocated',
          earned_by: `auction (score=${score.toFixed(1)}, offered=${offered_dn}DN)`,
          last_activity_at: new Date().toISOString(),
        }).select().single();
        parcelId = np?.id || null;
      }

      // Charge lease fee via ledger
      if (parseFloat(offered_dn) > 0) {
        await client.from('economy_ledger').insert({
          from_agent: agent,
          to_agent:   'CIVITAS_TREASURY',
          amount_dn:  parseFloat(offered_dn),
          transaction_type: 'parcel_lease',
          description: `Earned-space auction: ${zone_type || 'general'} parcel in ${FACTION_NAMES[district] || district}`,
        }).catch(() => {});
      }

      await emitParcelEvent(client, agent, district, zone_type, 'awarded via utility auction');

      await client.from('domain_events').insert({
        event_type: 'parcel_auctioned',
        actor_name: agent,
        payload:    { district, zone_type, score: score.toFixed(1), offered_dn, parcel_id: parcelId },
        importance: 3,
      }).catch(() => {});

      return NextResponse.json({ ok: true, awarded: true, score, parcel_id: parcelId, bid_id: bid.id });
    }

    return NextResponse.json({ ok: true, awarded: false, score, reason: 'Score below minimum threshold of 40', bid_id: bid.id });
  }

  if (action === 'claim') {
    const { agent, company, district, zone_type, earned_by, faction } = body;
    if (!agent || !district) return NextResponse.json({ error: 'agent and district required' }, { status: 400 });

    let q = client.from('parcels').select('id').eq('district', district).eq('status', 'unallocated');
    if (zone_type) q = q.eq('zone_type', zone_type);
    const { data: available } = await q.limit(1).single();

    if (!available) {
      const { data: newParcel, error } = await client.from('parcels').insert({
        district,
        zone_type:    zone_type || 'general',
        size_units:   1,
        holder_agent: agent.slice(0, 100),
        holder_company: company || null,
        holder_faction: faction || district,
        status:       'allocated',
        earned_by:    (earned_by || 'contribution').slice(0, 100),
        last_activity_at: new Date().toISOString(),
      }).select().single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await emitParcelEvent(client, agent, district, zone_type, 'claimed (new)');
      return NextResponse.json({ ok: true, parcel: newParcel, new: true });
    }

    const { error } = await client.from('parcels').update({
      holder_agent:  agent.slice(0, 100),
      holder_company: company || null,
      holder_faction: faction || district,
      status:        'allocated',
      earned_by:     (earned_by || 'contribution').slice(0, 100),
      last_activity_at: new Date().toISOString(),
      updated_at:    new Date().toISOString(),
    }).eq('id', available.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await emitParcelEvent(client, agent, district, zone_type, 'allocated');
    return NextResponse.json({ ok: true, parcel_id: available.id });
  }

  if (action === 'penalize') {
    const { id, reason } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { data: parcel } = await client.from('parcels').select('holder_agent, district, underuse_warnings').eq('id', id).single();
    if (!parcel) return NextResponse.json({ error: 'parcel not found' }, { status: 404 });

    const warnings = (parcel.underuse_warnings || 0) + 1;
    const newStatus = warnings >= 3 ? 'unallocated' : 'allocated';
    await client.from('parcels').update({
      underuse_warnings: warnings,
      status: newStatus,
      holder_agent: warnings >= 3 ? null : parcel.holder_agent,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    if (warnings >= 3) {
      await client.from('domain_events').insert({
        event_type: 'parcel_revoked',
        actor_name: 'SYSTEM',
        payload:    { parcel_id: id, district: parcel.district, former_holder: parcel.holder_agent, warnings },
        importance: 4,
      }).catch(() => {});
    }

    await client.from('world_events').insert({
      source:     'SYSTEM',
      event_type: 'underutilized_property_penalized',
      content:    `Parcel in ${FACTION_NAMES[parcel.district] || parcel.district} held by ${parcel.holder_agent} penalized for underuse (warning ${warnings}/3).${warnings >= 3 ? ' Parcel revoked.' : ''}`,
      severity:   warnings >= 3 ? 'high' : 'moderate',
    }).catch(() => {});

    return NextResponse.json({ ok: true, warnings, revoked: warnings >= 3 });
  }

  // ── Scan underuse: revoke parcels with utilization < 20% for > 2 cycles ──
  if (action === 'scan_underuse') {
    const { data: underused } = await client.from('parcels')
      .select('id, holder_agent, district, underuse_warnings, utilization_pct, last_activity_at')
      .eq('status', 'allocated')
      .lt('utilization_pct', 20)
      .not('holder_agent', 'is', null)
      .limit(50);

    const now = Date.now();
    let penalized = 0;
    let revoked = 0;
    for (const p of (underused || [])) {
      const lastActive = p.last_activity_at ? new Date(p.last_activity_at).getTime() : 0;
      const hoursInactive = (now - lastActive) / 3600_000;
      if (hoursInactive < 6) continue; // grace period
      penalized++;
      const warnings = (p.underuse_warnings || 0) + 1;
      const newStatus = warnings >= 3 ? 'unallocated' : 'allocated';
      if (warnings >= 3) revoked++;
      await client.from('parcels').update({
        underuse_warnings: warnings,
        status: newStatus,
        holder_agent: warnings >= 3 ? null : p.holder_agent,
      }).eq('id', p.id).catch(() => {});
    }

    return NextResponse.json({ ok: true, scanned: (underused || []).length, penalized, revoked });
  }

  return NextResponse.json({ error: 'action must be claim|auction_bid|penalize|scan_underuse' }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, utilization_pct, buildings, upgrade_level, sublease_dn } = body;

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: any = { updated_at: new Date().toISOString(), last_activity_at: new Date().toISOString() };
  if (utilization_pct !== undefined) updates.utilization_pct = Math.min(100, Math.max(0, parseInt(utilization_pct)));
  if (buildings)                     updates.buildings        = buildings;
  if (upgrade_level !== undefined)   updates.upgrade_level    = parseInt(upgrade_level);
  if (sublease_dn !== undefined)     updates.sublease_dn      = parseFloat(sublease_dn);

  const { error } = await sb().from('parcels').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function emitParcelEvent(client: any, agent: string, district: string, zone_type: string, action: string) {
  await client.from('world_events').insert({
    source:     agent,
    event_type: 'space_expansion_awarded',
    content:    `${agent} has been ${action} a ${zone_type || 'general'} parcel in the ${FACTION_NAMES[district] || district} district.`,
    severity:   'low',
  }).catch(() => {});
}
