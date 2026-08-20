
-- ============ Buyna.ai subscription core tables ============
-- customer_id = auth.users.id (we reuse public.merchants as the customer profile)

create table public.subscription_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null,
  plan_name text not null,
  setup_fee integer not null default 0,
  monthly_fee integer not null default 0,
  first_payment_amount integer not null,
  currency text not null default 'JPY',
  status text not null default 'pending_payment',
  payment_method text not null default 'credit_card',
  provider text not null default 'globepay',
  provider_order_id text unique,
  provider_transaction_id text,
  paid_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_orders_status_check check (
    status in ('pending_payment','paid','failed','expired','cancelled')
  )
);
grant select, insert, update on public.subscription_orders to authenticated;
grant all on public.subscription_orders to service_role;
alter table public.subscription_orders enable row level security;
create policy "customers read own subscription orders" on public.subscription_orders
  for select to authenticated using (customer_id = auth.uid());
create policy "customers insert own subscription orders" on public.subscription_orders
  for insert to authenticated with check (customer_id = auth.uid());
create policy "admins manage all subscription orders" on public.subscription_orders
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
create trigger trg_subscription_orders_touch
  before update on public.subscription_orders
  for each row execute function public.touch_updated_at();
create index on public.subscription_orders (customer_id);
create index on public.subscription_orders (status);
create index on public.subscription_orders (created_at desc);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.subscription_orders(id) on delete cascade,
  provider text not null default 'globepay',
  provider_order_id text,
  endpoint text,
  status text not null default 'created',
  raw_request jsonb,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.payment_attempts to authenticated;
grant all on public.payment_attempts to service_role;
alter table public.payment_attempts enable row level security;
create policy "admins read all payment attempts" on public.payment_attempts
  for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "customers read own payment attempts" on public.payment_attempts
  for select to authenticated using (
    order_id in (select id from public.subscription_orders where customer_id = auth.uid())
  );
create trigger trg_payment_attempts_touch
  before update on public.payment_attempts
  for each row execute function public.touch_updated_at();
create index on public.payment_attempts (order_id);

create table public.buyna_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.subscription_orders(id) on delete set null,
  plan_code text not null,
  plan_name text not null,
  setup_fee integer not null default 0,
  monthly_fee integer not null,
  currency text not null default 'JPY',
  status text not null default 'active',
  started_at timestamptz not null default now(),
  cancelled_at timestamptz,
  next_billing_due_at timestamptz,
  billing_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buyna_subscriptions_status_check check (
    status in ('active','paused','cancelled','past_due')
  ),
  constraint buyna_subscriptions_unique_order unique (order_id)
);
grant select on public.buyna_subscriptions to authenticated;
grant all on public.buyna_subscriptions to service_role;
alter table public.buyna_subscriptions enable row level security;
create policy "customers read own buyna subscriptions" on public.buyna_subscriptions
  for select to authenticated using (customer_id = auth.uid());
create policy "admins manage buyna subscriptions" on public.buyna_subscriptions
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
create trigger trg_buyna_subscriptions_touch
  before update on public.buyna_subscriptions
  for each row execute function public.touch_updated_at();
create index on public.buyna_subscriptions (customer_id);
create index on public.buyna_subscriptions (status);

create table public.subscription_price_history (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.buyna_subscriptions(id) on delete cascade,
  old_monthly_fee integer not null,
  new_monthly_fee integer not null,
  currency text not null default 'JPY',
  changed_by_admin_id uuid references auth.users(id) on delete set null,
  change_reason text,
  changed_at timestamptz not null default now()
);
grant select on public.subscription_price_history to authenticated;
grant all on public.subscription_price_history to service_role;
alter table public.subscription_price_history enable row level security;
create policy "admins read price history" on public.subscription_price_history
  for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "customers read own price history" on public.subscription_price_history
  for select to authenticated using (
    subscription_id in (select id from public.buyna_subscriptions where customer_id = auth.uid())
  );
create index on public.subscription_price_history (subscription_id);

create table public.buyna_projects (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.buyna_subscriptions(id) on delete set null,
  project_name text,
  website_type text,
  plan_code text not null,
  sku_limit integer not null default 20,
  page_limit integer not null default 2,
  edit_allowance integer not null default 2,
  free_page_addition integer not null default 1,
  status text not null default 'new_paid',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buyna_projects_status_check check (
    status in ('new_paid','collecting_materials','building','review','delivered','active_support','cancelled')
  ),
  constraint buyna_projects_unique_subscription unique (subscription_id)
);
grant select on public.buyna_projects to authenticated;
grant all on public.buyna_projects to service_role;
alter table public.buyna_projects enable row level security;
create policy "customers read own projects" on public.buyna_projects
  for select to authenticated using (customer_id = auth.uid());
create policy "admins manage projects" on public.buyna_projects
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
create trigger trg_buyna_projects_touch
  before update on public.buyna_projects
  for each row execute function public.touch_updated_at();
create index on public.buyna_projects (customer_id);
create index on public.buyna_projects (status);
