// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ── GET /api/ads ────────────────────────────────────────────────────────────
// ?type=slots|campaigns|bids  ?district=<d>  ?status=<s>  ?limit=<n>
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type     = searchParams.get('type') || 'slots';
  const district = searchParams.get('district') || '';
  const status   = searchParams.get('status') || '';
  const limit    = parseInt(searchParams.get('limit') || '60');

  if (type === 'slots') {
    let q = sb.from('ad_slots').select('*').order('district').limit(limit);
    if (district) q = q.eq('district', district);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const stats = {
      total: data?.length ?? 0,
      available: data?.filter(s => s.current_campaign_id == null).length ?? 0,
      occupied: data?.filter(s => s.current_campaign_id != null).length ?? 0,
      total_revenue: data?.reduce((sum: number, s: any) => sum + (s.total_revenue_dn || 0), 0) ?? 0,
    };

    return NextResponse.json({ slots: data, stats });
  }

  if (type === 'campaigns') {
    let q = sb.from('ad_campaigns').select('*').order('created_at', { ascending: false }).limit(limit);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ campaigns: data, count: data?.length });
  }

  if (type === 'bids') {
    let q = sb.from('ad_bids').select('*, ad_slots(location, slot_type, district)').order('bid_placed_at', { ascending: false }).limit(limit);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ bids: data, count: data?.length });
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
}

// ── POST /api/ads ───────────────────────────────────────────────────────────
// action: create_campaign | bid | award | expire
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 });

  if (action === 'create_campaign') {
    const { advertiser_name, name, message, target_districts, budget_dn, duration_cycles, category } = body;
    if (!advertiser_name || !name || !message) {
      return NextResponse.json({ error: 'advertiser_name, name, message required' }, { status: 400 });
    }

    const { data, error } = await sb.from('ad_campaigns').insert({
      advertiser_name,
      name,
      message,
      target_districts: target_districts || [],
      budget_dn: budget_dn || 100,
      spent_dn: 0,
      duration_cycles: duration_cycles || 5,
      cycles_remaining: duration_cycles || 5,
      category: category || 'general',
      status: 'active',
      impressions: 0,
      clicks: 0,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await sb.from('domain_events').insert({
      event_type: 'ad_campaign_created',
      actor_name: advertiser_name,
      payload: { campaign_id: data.id, name, budget_dn: budget_dn || 100 },
      importance: 2,
    }).catch(() => {});

    return NextResponse.json({ ok: true, campaign: data });
  }

  if (action === 'bid') {
    const { slot_id, campaign_id, bidder_name, bid_amount_dn, message } = body;
    if (!slot_id || !bidder_name) return NextResponse.json({ error: 'slot_id, bidder_name required' }, { status: 400 });

    // Get slot info
    const { data: slot } = await sb.from('ad_slots').select('*').eq('id', slot_id).single();
    if (!slot) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });

    const bidAmt = bid_amount_dn || slot.base_price_dn || 50;

    const { data: bid, error } = await sb.from('ad_bids').insert({
      slot_id,
      campaign_id: campaign_id || null,
      bidder_name,
      bid_amount_dn: bidAmt,
      message: message || null,
      status: 'pending',
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Auto-award if slot is free and bid meets minimum
    if (!slot.current_campaign_id && bidAmt >= (slot.base_price_dn || 0)) {
      await sb.from('ad_slots').update({
        current_campaign_id: campaign_id || null,
        current_advertiser: bidder_name,
        current_message: message || null,
        total_revenue_dn: (slot.total_revenue_dn || 0) + bidAmt,
        occupied_until_cycle: (slot.occupied_until_cycle || 0) + (body.duration_cycles || 3),
      }).eq('id', slot_id).catch(() => {});

      await sb.from('ad_bids').update({ status: 'won' }).eq('id', bid.id).catch(() => {});

      // Debit advertiser
      await sb.from('economy_ledger').insert({
        agent_name: bidder_name,
        amount: -bidAmt,
        tx_type: 'ad_spend',
        description: `Ad slot ${slot.location} — ${slot.district}`,
        counterparty: 'DISTRICT_AD_REVENUE',
      }).catch(() => {});

      await sb.from('domain_events').insert({
        event_type: 'ad_slot_awarded',
        actor_name: bidder_name,
        payload: { slot_id, location: slot.location, district: slot.district, bid_amount_dn: bidAmt },
        importance: 3,
      }).catch(() => {});

      return NextResponse.json({ ok: true, bid, awarded: true });
    }

    return NextResponse.json({ ok: true, bid, awarded: false });
  }

  if (action === 'expire') {
    const { slot_id } = body;
    if (!slot_id) return NextResponse.json({ error: 'slot_id required' }, { status: 400 });

    await sb.from('ad_slots').update({
      current_campaign_id: null,
      current_advertiser: null,
      current_message: null,
    }).eq('id', slot_id).catch(() => {});

    return NextResponse.json({ ok: true });
  }

  if (action === 'impression') {
    // Lightweight impression tracking
    const { campaign_id, slot_id } = body;
    if (campaign_id) {
      await sb.from('ad_campaigns').update({ impressions: sb.raw('COALESCE(impressions,0) + 1') }).eq('id', campaign_id).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
