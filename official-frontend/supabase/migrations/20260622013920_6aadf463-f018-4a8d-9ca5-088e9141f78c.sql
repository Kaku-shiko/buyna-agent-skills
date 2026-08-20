
-- payment methods table (stores GlobePay member_token, masked card meta)
create table public.merchant_payment_methods (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  provider text not null default 'globepay',
  provider_request_id text unique,
  member_token_encrypted text,
  card_number_masked text,
  card_type text,
  card_class text,
  card_country text,
  issuer text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.merchant_payment_methods to authenticated;
grant all on public.merchant_payment_methods to service_role;
alter table public.merchant_payment_methods enable row level security;
create policy "owner read pm" on public.merchant_payment_methods for select to authenticated
  using (merchant_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "owner write pm" on public.merchant_payment_methods for all to authenticated
  using (merchant_id = auth.uid()) with check (merchant_id = auth.uid());
create index on public.merchant_payment_methods(merchant_id);
create trigger trg_pm_touch before update on public.merchant_payment_methods
  for each row execute function public.touch_updated_at();

-- link payment method on subscription
alter table public.merchant_subscriptions
  add column if not exists payment_method_id uuid references public.merchant_payment_methods(id),
  add column if not exists setup_fee_paid_at timestamptz;

-- subscription invoices (setup + monthly)
create table public.merchant_subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  subscription_id uuid references public.merchant_subscriptions(id) on delete cascade,
  payment_method_id uuid references public.merchant_payment_methods(id),
  invoice_no text unique not null,
  billing_reason text not null check (billing_reason in ('setup_fee','monthly')),
  amount integer not null,
  currency text not null default 'JPY',
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed')),
  globepay_order_id text,
  globepay_partner_order_id text unique,
  globepay_response jsonb,
  paid_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.merchant_subscription_invoices to authenticated;
grant all on public.merchant_subscription_invoices to service_role;
alter table public.merchant_subscription_invoices enable row level security;
create policy "owner read inv" on public.merchant_subscription_invoices for select to authenticated
  using (merchant_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "owner insert inv" on public.merchant_subscription_invoices for insert to authenticated
  with check (merchant_id = auth.uid());
create policy "owner update inv" on public.merchant_subscription_invoices for update to authenticated
  using (merchant_id = auth.uid()) with check (merchant_id = auth.uid());
create index on public.merchant_subscription_invoices(merchant_id);
create index on public.merchant_subscription_invoices(subscription_id);
create unique index on public.merchant_subscription_invoices(subscription_id, billing_reason, period_start)
  where billing_reason = 'monthly';
create trigger trg_inv_touch before update on public.merchant_subscription_invoices
  for each row execute function public.touch_updated_at();
