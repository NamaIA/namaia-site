import Stripe from 'stripe';
import { requireEnv } from './env.mts';

export function stripeClient(): Stripe {
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'));
}
