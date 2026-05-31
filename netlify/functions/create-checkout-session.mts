import type { Config } from '@netlify/functions';
import { getPlan, planPriceId, setupPriceId } from './_shared/plans.mts';
import { json, methodNotAllowed } from './_shared/responses.mts';
import { siteUrl } from './_shared/env.mts';
import { stripeClient } from './_shared/stripe.mts';

const LEGAL_DOCUMENTS_VERSION = '2026-05-24';
const LEGAL_DOCUMENTS = 'cgv,confidentialite,annexe-rgpd';

export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed();

  try {
    const body = await req.json().catch(() => ({}));
    const plan = getPlan(body.plan);
    const legal = body.legal_acceptance ?? {};
    if (legal.accepted !== true) {
      return json({ error: 'Vous devez accepter les documents contractuels Nama IA avant le paiement.' }, 400);
    }
    const legalAcceptedAt = new Date().toISOString();
    const legalVersion = LEGAL_DOCUMENTS_VERSION;
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
          legal_accepted: 'true',
          legal_accepted_at: legalAcceptedAt,
          legal_documents_version: legalVersion,
          legal_documents: LEGAL_DOCUMENTS,
        },
      },
      metadata: {
        plan_code: plan.code,
        plan_label: plan.label,
        minutes_included: String(plan.minutesIncluded),
        setup_fee: '14900',
        legal_accepted: 'true',
        legal_accepted_at: legalAcceptedAt,
        legal_documents_version: legalVersion,
        legal_documents: LEGAL_DOCUMENTS,
        legal_source: 'pricing_checkout_checkbox',
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
