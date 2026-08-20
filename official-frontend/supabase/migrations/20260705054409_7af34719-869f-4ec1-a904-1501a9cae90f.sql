
-- 1. Update Pro plan monthly amount
UPDATE public.subscription_plans SET monthly_fee = 5980, display_original_monthly_fee = 5980, promotional_monthly_fee = NULL, promotional_months = 0 WHERE code = 'pro';
UPDATE public.subscription_plans SET monthly_fee = 2980, display_original_monthly_fee = 2980, promotional_monthly_fee = NULL, promotional_months = 0 WHERE code = 'basic';

-- 2. buyna_customers
CREATE TABLE public.buyna_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text,
  company_address text,
  country text,
  website_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.buyna_customers TO authenticated;
GRANT ALL ON public.buyna_customers TO service_role;
ALTER TABLE public.buyna_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read customers" ON public.buyna_customers FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER buyna_customers_touch BEFORE UPDATE ON public.buyna_customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. buyna_subscriptions
CREATE TABLE public.buyna_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.buyna_customers(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.subscription_plans(id),
  plan_code text NOT NULL,
  locked_monthly_amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'JPY',
  status text NOT NULL DEFAULT 'pending_authorization'
    CHECK (status IN ('pending_authorization','active','past_due','grace_period','paused','cancelled','expired','failed')),
  merchant_agreement_id text UNIQUE,
  platform_agreement_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_billing_date timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_buyna_sub_next_billing ON public.buyna_subscriptions(next_billing_date) WHERE status='active';
CREATE INDEX idx_buyna_sub_customer ON public.buyna_subscriptions(customer_id);
GRANT SELECT ON public.buyna_subscriptions TO authenticated;
GRANT ALL ON public.buyna_subscriptions TO service_role;
ALTER TABLE public.buyna_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read subs" ON public.buyna_subscriptions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER buyna_subs_touch BEFORE UPDATE ON public.buyna_subscriptions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. buyna_subscription_charges
CREATE TABLE public.buyna_subscription_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.buyna_subscriptions(id) ON DELETE CASCADE,
  charge_id text NOT NULL UNIQUE,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'JPY',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','failed','cancelled')),
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  provider_order_id text,
  provider_response jsonb,
  paid_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_buyna_charge_sub ON public.buyna_subscription_charges(subscription_id);
GRANT SELECT ON public.buyna_subscription_charges TO authenticated;
GRANT ALL ON public.buyna_subscription_charges TO service_role;
ALTER TABLE public.buyna_subscription_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read charges" ON public.buyna_subscription_charges FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 5. globepay_recurring_agreements
CREATE TABLE public.globepay_recurring_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.buyna_subscriptions(id) ON DELETE CASCADE,
  merchant_agreement_id text NOT NULL UNIQUE,
  platform_agreement_id text,
  status text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.globepay_recurring_agreements TO authenticated;
GRANT ALL ON public.globepay_recurring_agreements TO service_role;
ALTER TABLE public.globepay_recurring_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read agreements" ON public.globepay_recurring_agreements FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER buyna_agreements_touch BEFORE UPDATE ON public.globepay_recurring_agreements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
