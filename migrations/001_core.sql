create extension if not exists pgcrypto;

create table if not exists public.nama_customers (
  id uuid primary key default gen_random_uuid(),
  stripe_customer_id text unique,
  email text,
  name text,
  phone text,
  company text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nama_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.nama_customers(id) on delete set null,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text unique,
  plan_code text not null,
  status text not null default 'pending',
  minutes_included integer not null,
  setup_paid boolean not null default false,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  stripe_checkout_session_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists public.google_tokens (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.nama_customers(id) on delete cascade,
  stripe_checkout_session_id text,
  google_email text,
  scope text,
  token_type text,
  access_token_enc text,
  refresh_token_enc text,
  expiry_date timestamptz,
  raw_token_enc text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id)
);

create index if not exists nama_subscriptions_customer_idx on public.nama_subscriptions(customer_id);
create index if not exists google_tokens_customer_idx on public.google_tokens(customer_id);
create index if not exists google_oauth_states_session_idx on public.google_oauth_states(stripe_checkout_session_id);
