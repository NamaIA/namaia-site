import type { Config } from '@netlify/functions';
import { getPlan, planPriceId, setupPriceId } from './_shared/plans.mts';
import { json, methodNotAllowed } from './_shared/responses.mts';
import { siteUrl } from './_shared/env.mts';
import { stripeClient } from './_shared/stripe.mts';

export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed();

  try {
    const body = await req.json().catch(() => ({}));
    const plan = getPlan(body.plan);
    const origin = siteUrl();
    const stripe = stripeClient();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        { price: planPriceId(plan), quantity: 1 },
        { price: setupPriceId(), quantity: 1 },
      ],
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: true },
      allow_promotion_codes: false,
      client_reference_id: plan.code,
      subscription_data: {
        metadata: {
          plan_code: plan.code,
          minutes_included: String(plan.minutesIncluded),
          setup_fee: '14900',
        },
      },
      metadata: {
        plan_code: plan.code,
        plan_label: plan.label,
        minutes_included: String(plan.minutesIncluded),
        setup_fee: '14900',
      },
      success_url: `${origin}/paiement-reussi.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/paiement-annule.html?plan=${plan.code}`,
    });

    return json({ url: session.url });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Erreur Stripe.' }, 400);
  }
};

export const config: Config = {
  path: '/api/create-checkout-session',
};
