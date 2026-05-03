import type { Config } from '@netlify/functions';
import { PLANS } from './_shared/plans.mts';
import { requireEnv } from './_shared/env.mts';
import { json, methodNotAllowed } from './_shared/responses.mts';
import { stripeClient } from './_shared/stripe.mts';
import { upsertCustomerFromStripe, upsertSubscription } from './_shared/db.mts';

function planFromMetadata(planCode: string | undefined | null) {
  return planCode && planCode in PLANS ? PLANS[planCode as keyof typeof PLANS] : PLANS.standard;
}

export default async (req: Request) => {
  if (req.method !== 'POST') return methodNotAllowed();

  const stripe = stripeClient();
  const signature = req.headers.get('stripe-signature');
  if (!signature) return json({ error: 'Missing Stripe signature' }, 400);

  let event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, signature, requireEnv('STRIPE_WEBHOOK_SECRET'));
  } catch (error) {
    console.error(error);
    return json({ error: 'Webhook signature verification failed' }, 400);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const plan = planFromMetadata(session.metadata?.plan_code);
      const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

      if (stripeCustomerId) {
        const customer = await upsertCustomerFromStripe({
          stripeCustomerId,
          email: session.customer_details?.email ?? session.customer_email ?? null,
          name: session.customer_details?.name ?? null,
          phone: session.customer_details?.phone ?? null,
          metadata: { source: 'stripe_checkout' },
        });

        await upsertSubscription({
          customerId: customer.id,
          stripeSubscriptionId,
          stripeCheckoutSessionId: session.id,
          planCode: plan.code,
          status: session.payment_status === 'paid' ? 'active' : session.status ?? 'pending',
          minutesIncluded: plan.minutesIncluded,
          setupPaid: session.payment_status === 'paid',
        });
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const plan = planFromMetadata(subscription.metadata?.plan_code);
      const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
      const rawPeriodEnd = (subscription as any).current_period_end ?? subscription.items.data[0]?.current_period_end;
      const periodEnd = rawPeriodEnd
        ? new Date(rawPeriodEnd * 1000)
        : null;

      if (stripeCustomerId) {
        const customer = await upsertCustomerFromStripe({ stripeCustomerId, metadata: { source: 'stripe_subscription' } });
        await upsertSubscription({
          customerId: customer.id,
          stripeSubscriptionId: subscription.id,
          stripeCheckoutSessionId: null,
          planCode: plan.code,
          status: subscription.status,
          minutesIncluded: plan.minutesIncluded,
          setupPaid: true,
          currentPeriodEnd: periodEnd,
        });
      }
    }

    return json({ received: true });
  } catch (error) {
    console.error(error);
    return json({ error: 'Webhook handling failed' }, 500);
  }
};

export const config: Config = {
  path: '/api/stripe-webhook',
};
