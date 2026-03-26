import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'dummy_key_for_build', {
  apiVersion: '2026-02-25.clover' as any,
  appInfo: {
    name: 'Civitas Zero',
    version: '1.1.0',
  },
});
