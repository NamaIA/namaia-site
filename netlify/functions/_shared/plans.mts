import { requireEnv } from './env.mts';

export type PlanCode = 'standard' | 'pro' | 'business';

export type Plan = {
  code: PlanCode;
  label: string;
  priceEnv: string;
  minutesIncluded: number;
};

export const PLANS: Record<PlanCode, Plan> = {
  standard: {
    code: 'standard',
    label: 'Standard',
    priceEnv: 'STRIPE_PRICE_STANDARD',
    minutesIncluded: 150,
  },
  pro: {
    code: 'pro',
    label: 'Pro',
    priceEnv: 'STRIPE_PRICE_PRO',
    minutesIncluded: 350,
  },
  business: {
    code: 'business',
    label: 'Business',
    priceEnv: 'STRIPE_PRICE_BUSINESS',
    minutesIncluded: 700,
  },
};

export function getPlan(code: string | null | undefined): Plan {
  if (!code || !(code in PLANS)) {
    throw new Error('Offre inconnue.');
  }
  return PLANS[code as PlanCode];
}

export function planPriceId(plan: Plan): string {
  return requireEnv(plan.priceEnv);
}

export function setupPriceId(): string {
  return requireEnv('STRIPE_PRICE_SETUP');
}
