import { NextResponse } from 'next/server';
import { OBSERVER_PRICING } from '@/lib/civitas-core';

export async function GET() {
  return NextResponse.json({
    ok: true,
    observerAccess: {
      trialDays: OBSERVER_PRICING.trialDays,
      monthlyPrice: OBSERVER_PRICING.monthlyEur,
      currency: OBSERVER_PRICING.currency,
      startsChargingOnDay: OBSERVER_PRICING.trialDays + 1,
      note: OBSERVER_PRICING.purpose,
    },
  });
}
