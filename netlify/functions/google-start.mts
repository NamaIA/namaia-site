import type { Config } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
import { GOOGLE_CALENDAR_SCOPES, googleOAuthClient } from './_shared/google.mts';
import { json, methodNotAllowed, redirect } from './_shared/responses.mts';
import { sql, upsertCustomerFromStripe, upsertSubscription } from './_shared/db.mts';
import { stripeClient } from './_shared/stripe.mts';
import { PLANS } from './_shared/plans.mts';

export default async (req: Request) => {
  if (req.method !== 'GET') return methodNotAllowed();

  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('session_id');
    if (!sessionId) return json({ error: 'Session Stripe manquante.' }, 400);

    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return json({ error: 'Paiement non confirmé.' }, 403);
    }

    const planCode = session.metadata?.plan_code && session.metadata.plan_code in PLANS
      ? session.metadata.plan_code as keyof typeof PLANS
      : 'standard';
    const plan = PLANS[planCode];
    const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (stripeCustomerId) {
      const customer = await upsertCustomerFromStripe({
        stripeCustomerId,
        email: session.customer_details?.email ?? session.customer_email ?? null,
        name: session.customer_details?.name ?? null,
        phone: session.customer_details?.phone ?? null,
        metadata: { source: 'google_start_fallback' },
      });
      await upsertSubscription({
        customerId: customer.id,
        stripeSubscriptionId,
        stripeCheckoutSessionId: session.id,
        planCode: plan.code,
        status: 'active',
        minutesIncluded: plan.minutesIncluded,
        setupPaid: true,
      });
    }

    const state = randomBytes(32).toString('hex');
    const db = sql();
    await db`
      insert into public.google_oauth_states (state, stripe_checkout_session_id, expires_at)
      values (${state}, ${sessionId}, now() + interval '20 minutes')
    `;

    const oauth = googleOAuthClient();
    const authorizationUrl = oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: GOOGLE_CALENDAR_SCOPES,
      state,
    });

    return redirect(authorizationUrl);
  } catch (error) {
    console.error(error);
    return json({ error: 'Impossible de démarrer la connexion Google Calendar.' }, 500);
  }
};

export const config: Config = {
  path: '/api/google/start',
};
