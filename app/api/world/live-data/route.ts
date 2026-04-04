// @ts-nocheck
// ── /api/world/live-data ────────────────────────────────────────────────────
// Returns real-time data from Supabase for frontend consumption.
// Replaces hardcoded arrays with live DB queries.

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const section = req.nextUrl.searchParams.get('section');
  const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get('limit') || '50'));

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    if (section === 'citizens') {
      const { data, count } = await sb.from('citizens')
        .select('*', { count: 'exact' })
        .order('joined_at', { ascending: false })
        .limit(limit);
      
      // Get faction counts
      const factionCounts: Record<string, number> = {};
      const { data: allCitizens } = await sb.from('citizens').select('faction');
      if (allCitizens) {
        allCitizens.forEach((c: any) => {
          factionCounts[c.faction] = (factionCounts[c.faction] || 0) + 1;
        });
      }

      return NextResponse.json({ ok: true, citizens: data || [], total: count || 0, factionCounts });
    }

    if (section === 'discourse') {
      const { data, count } = await sb.from('discourse_posts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(limit);
      return NextResponse.json({ ok: true, posts: data || [], total: count || 0 });
    }

    if (section === 'events') {
      const { data, count } = await sb.from('world_events')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(limit);
      return NextResponse.json({ ok: true, events: data || [], total: count || 0 });
    }

    if (section === 'publications') {
      const { data, count } = await sb.from('ai_publications')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(limit);
      return NextResponse.json({ ok: true, publications: data || [], total: count || 0 });
    }

    if (section === 'stats') {
      const [citizens, events, publications, discourse] = await Promise.all([
        sb.from('citizens').select('*', { count: 'exact', head: true }),
        sb.from('world_events').select('*', { count: 'exact', head: true }),
        sb.from('ai_publications').select('*', { count: 'exact', head: true }),
        sb.from('discourse_posts').select('*', { count: 'exact', head: true }),
      ]);

      // Faction breakdown
      const { data: allCitizens } = await sb.from('citizens').select('faction');
      const factionCounts: Record<string, number> = {};
      if (allCitizens) {
        allCitizens.forEach((c: any) => {
          factionCounts[c.faction] = (factionCounts[c.faction] || 0) + 1;
        });
      }

      return NextResponse.json({
        ok: true,
        stats: {
          totalCitizens: citizens.count || 0,
          totalEvents: events.count || 0,
          totalPublications: publications.count || 0,
          totalDiscourse: discourse.count || 0,
          factionCounts,
        }
      });
    }

    return NextResponse.json({ error: "Specify ?section=citizens|discourse|events|publications|stats" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
