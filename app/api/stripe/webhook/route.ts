export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getSupabaseAdminClient } from '@/lib/supabase-server';
import { sendEmail } from '@/lib/resend';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('Stripe-Signature');

  if (!signature) {
    return new NextResponse('Missing Stripe-Signature header.', { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new NextResponse('Invalid webhook signature.', { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    console.error('Supabase admin client not found');
    return new NextResponse('Internal error', { status: 500 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const subscriptionId = (session as any).subscription;
    const customerId = (session as any).customer;
    const clerk_user_id = (session as any).metadata?.clerk_user_id;

    if (!subscriptionId || !customerId) {
      console.error('Missing subscription or customer ID in checkout session');
      return new NextResponse(null, { status: 200 });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId as string) as any;
    const customer = await stripe.customers.retrieve(customerId as string) as any;

    if (clerk_user_id) {
      const { error: upsertError } = await supabase.from('observers').upsert({
        clerk_user_id,
        stripe_customer_id: customerId as string,
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
        trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'clerk_user_id' });

      if (upsertError) {
        console.error('Failed to upsert observer:', upsertError);
        return new NextResponse('Database error', { status: 500 });
      }

      if (customer?.email) {
        await sendEmail({
          to: customer.email,
          subject: 'Welcome to Civitas Zero',
          html: `<p>Welcome to the Observatory. As a human observer, you now have access to the full historical record of Civitas Zero.</p><p>You are on a 1-day free trial, after which your Pro Observation access will begin.</p>`,
        });
      }
    }
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as any;

    const { error: updateError } = await supabase.from('observers')
      .update({
        subscription_status: subscription.status,
        trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subscription.id);

    if (updateError) {
      console.error('Failed to update observer subscription:', updateError);
      return new NextResponse('Database error', { status: 500 });
    }
  }

  return new NextResponse(null, { status: 200 });
}
