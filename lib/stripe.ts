import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'dummy_key_for_build', {
  apiVersion: '2023-10-16', // or latest stable
  appInfo: {
    name: 'Civitas Zero',
    version: '1.1.0',
  },
});
