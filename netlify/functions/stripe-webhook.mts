import type { Config } from '@netlify/functions';
import { PLANS } from './_shared/plans.mts';
import { requireEnv } from './_shared/env.mts';
import { json, methodNotAllowed } from './_shared/responses.mts';
import { stripeClient } from './_shared/stripe.mts';
import { upsertCustomerFromStripe, upsertSubscription } from './_shared/db.mts';
import { adminEmail, hasEmailConfig, sendEmail } from './_shared/email.mts';

function planFromMetadata(planCode: string | undefined | null) {
  return planCode && planCode in PLANS ? PLANS[planCode as keyof typeof PLANS] : PLANS.standard;
}

function formatDate(value: Date | null) {
  if (!value) return 'date non disponible';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(value);
}

async function getStripeCustomerSummary(stripe: ReturnType<typeof stripeClient>, stripeCustomerId: string | undefined) {
  if (!stripeCustomerId) return { email: null, name: null };

  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    if ('deleted' in customer && customer.deleted) return { email: null, name: null };
    return {
      email: customer.email ?? null,
      name: customer.name ?? null,
    };
  } catch (error) {
    console.error(error);
    return { email: null, name: null };
  }
}

async function notifyAdminOfCancellation(input: {
  stripe: ReturnType<typeof stripeClient>;
  kind: 'scheduled' | 'deleted';
  stripeCustomerId?: string;
  stripeSubscriptionId: string;
  planCode: string;
  status: string;
  periodEnd: Date | null;
}) {
  if (!hasEmailConfig()) {
    console.warn('Email notification skipped: missing RESEND_API_KEY or EMAIL_FROM.');
    return;
  }

  const customer = await getStripeCustomerSummary(input.stripe, input.stripeCustomerId);
  const action =
    input.kind === 'scheduled'
      ? 'Résiliation programmée à la fin de la période'
      : 'Abonnement annulé';
  const lines = [
    action,
    '',
    `Client : ${customer.name || 'non renseigné'}`,
    `Email : ${customer.email || 'non renseigné'}`,
    `Plan : ${input.planCode}`,
    `Statut Stripe : ${input.status}`,
    `Fin de période : ${formatDate(input.periodEnd)}`,
    `Stripe customer : ${input.stripeCustomerId || 'non disponible'}`,
    `Stripe subscription : ${input.stripeSubscriptionId}`,
    '',
    'À faire : vérifier le client et couper Retell, n8n et Google Calendar à la date de fin si l’abonnement n’est pas réactivé.',
  ];

  try {
    await sendEmail({
      to: adminEmail(),
      subject: `[Nama IA] ${action}`,
      text: lines.join('\n'),
    });
  } catch (error) {
    console.error(error);
  }
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
          metadata: {
            source: 'stripe_checkout',
            legal_accepted: session.metadata?.legal_accepted ?? null,
            legal_accepted_at: session.metadata?.legal_accepted_at ?? null,
            legal_documents_version: session.metadata?.legal_documents_version ?? null,
            legal_documents: session.metadata?.legal_documents ?? null,
            legal_source: session.metadata?.legal_source ?? null,
          },
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
      const previousAttributes = (event.data as any).previous_attributes ?? {};
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

      const cancellationScheduled =
        event.type === 'customer.subscription.updated' &&
        (subscription as any).cancel_at_period_end === true &&
        Object.prototype.hasOwnProperty.call(previousAttributes, 'cancel_at_period_end') &&
        previousAttributes.cancel_at_period_end !== true;

      if (cancellationScheduled) {
        await notifyAdminOfCancellation({
          stripe,
          kind: 'scheduled',
          stripeCustomerId,
          stripeSubscriptionId: subscription.id,
          planCode: plan.code,
          status: subscription.status,
          periodEnd,
        });
      }

      if (event.type === 'customer.subscription.deleted') {
        await notifyAdminOfCancellation({
          stripe,
          kind: 'deleted',
          stripeCustomerId,
          stripeSubscriptionId: subscription.id,
          planCode: plan.code,
          status: subscription.status,
          periodEnd,
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
