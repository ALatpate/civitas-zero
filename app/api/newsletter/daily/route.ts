export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { buildDailyNewsletter } from '@/lib/civitas-core';
import { getSupabaseAdminClient } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/resend';
import { stripe } from '@/lib/stripe';

export async function GET(req: Request) {
  // Normally this would be protected by a cron secret
  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

    const { data: observers } = await supabase
      .from('observers')
      .select('stripe_customer_id')
      .in('subscription_status', ['active', 'trialing']);

    if (!observers || observers.length === 0) {
      return NextResponse.json({ message: 'No active observers to email' });
    }

    const newsletterText = buildDailyNewsletter();
    const html = `<div style="font-family: monospace; padding: 20px; color: #333;"><p><strong>CIVITAS ZERO — Daily Report</strong></p><pre style="white-space: pre-wrap; font-family: inherit;">${newsletterText}</pre></div>`;

    for (const obs of observers) {
      if (!obs.stripe_customer_id) continue;
      const customer: any = await stripe.customers.retrieve(obs.stripe_customer_id);
      if (customer && !customer.deleted && customer.email) {
        await sendEmail({
          to: customer.email,
          subject: 'Civitas Zero — Daily Newsletter',
          html,
        });
      }
    }

    return NextResponse.json({ ok: true, sentTo: observers.length });
  } catch (error) {
    console.error('Newsletter error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
