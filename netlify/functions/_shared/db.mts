import { neon } from '@neondatabase/serverless';
import { requireEnv } from './env.mts';

export function sql() {
  return neon(requireEnv('DATABASE_URL'));
}

export async function upsertCustomerFromStripe(input: {
  stripeCustomerId: string;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = sql();
  const rows = await db`
    insert into public.nama_customers (stripe_customer_id, email, name, phone, metadata, updated_at)
    values (
      ${input.stripeCustomerId},
      ${input.email ?? null},
      ${input.name ?? null},
      ${input.phone ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      now()
    )
    on conflict (stripe_customer_id)
    do update set
      email = coalesce(excluded.email, public.nama_customers.email),
      name = coalesce(excluded.name, public.nama_customers.name),
      phone = coalesce(excluded.phone, public.nama_customers.phone),
      metadata = public.nama_customers.metadata || excluded.metadata,
      updated_at = now()
    returning id
  `;
  return rows[0] as { id: string };
}

export async function upsertSubscription(input: {
  customerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCheckoutSessionId?: string | null;
  planCode: string;
  status: string;
  minutesIncluded: number;
  setupPaid?: boolean;
  currentPeriodEnd?: Date | null;
}) {
  const db = sql();
  if (input.stripeSubscriptionId) {
    const updated = await db`
      update public.nama_subscriptions
      set
        customer_id = coalesce(${input.customerId ?? null}, customer_id),
        stripe_checkout_session_id = coalesce(${input.stripeCheckoutSessionId ?? null}, stripe_checkout_session_id),
        plan_code = ${input.planCode},
        status = ${input.status},
        minutes_included = ${input.minutesIncluded},
        setup_paid = ${Boolean(input.setupPaid)},
        current_period_end = coalesce(${input.currentPeriodEnd ?? null}, current_period_end),
        updated_at = now()
      where stripe_subscription_id = ${input.stripeSubscriptionId}
      returning id
    `;
    if (updated.length > 0) return;
  }

  if (input.stripeCheckoutSessionId) {
    const updated = await db`
      update public.nama_subscriptions
      set
        customer_id = coalesce(${input.customerId ?? null}, customer_id),
        stripe_subscription_id = coalesce(${input.stripeSubscriptionId ?? null}, stripe_subscription_id),
        plan_code = ${input.planCode},
        status = ${input.status},
        minutes_included = ${input.minutesIncluded},
        setup_paid = ${Boolean(input.setupPaid)},
        current_period_end = coalesce(${input.currentPeriodEnd ?? null}, current_period_end),
        updated_at = now()
      where stripe_checkout_session_id = ${input.stripeCheckoutSessionId}
      returning id
    `;
    if (updated.length > 0) return;
  }

  await db`
    insert into public.nama_subscriptions (
      customer_id,
      stripe_subscription_id,
      stripe_checkout_session_id,
      plan_code,
      status,
      minutes_included,
      setup_paid,
      current_period_end,
      updated_at
    )
    values (
      ${input.customerId ?? null},
      ${input.stripeSubscriptionId ?? null},
      ${input.stripeCheckoutSessionId ?? null},
      ${input.planCode},
      ${input.status},
      ${input.minutesIncluded},
      ${Boolean(input.setupPaid)},
      ${input.currentPeriodEnd ?? null},
      now()
    )
  `;
}

export async function findCustomerByCheckoutSession(sessionId: string) {
  const db = sql();
  const rows = await db`
    select c.id, c.stripe_customer_id, c.email
    from public.nama_customers c
    join public.nama_subscriptions s on s.customer_id = c.id
    where s.stripe_checkout_session_id = ${sessionId}
    limit 1
  `;
  return rows[0] as { id: string; stripe_customer_id: string; email: string | null } | undefined;
}
