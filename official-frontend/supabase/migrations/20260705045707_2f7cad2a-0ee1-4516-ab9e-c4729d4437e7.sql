
-- 1. Drop legacy tables (cascade FKs)
DROP TABLE IF EXISTS public.subscription_price_history CASCADE;
DROP TABLE IF EXISTS public.payment_attempts CASCADE;
DROP TABLE IF EXISTS public.merchant_subscription_invoices CASCADE;
DROP TABLE IF EXISTS public.subscription_orders CASCADE;
DROP TABLE IF EXISTS public.buyna_projects CASCADE;
DROP TABLE IF EXISTS public.buyna_subscriptions CASCADE;
DROP TABLE IF EXISTS public.merchant_payment_methods CASCADE;
DROP TABLE IF EXISTS public.merchant_subscriptions CASCADE;

-- 2. Merchants: normalize status vocabulary
ALTER TABLE public.merchants
  ALTER COLUMN status SET DEFAULT 'pending_profile';

UPDATE public.merchants SET status = 'pending_profile'
  WHERE status IS NULL OR status NOT IN ('pending_profile','pending_payment','active','suspended');

ALTER TABLE public.merchants
  DROP CONSTRAINT IF EXISTS merchants_status_check;
ALTER TABLE public.merchants
  ADD CONSTRAINT merchants_status_check
  CHECK (status IN ('pending_profile','pending_payment','active','suspended'));

-- 3. merchant_company_profiles
CREATE TABLE public.merchant_company_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL UNIQUE REFERENCES public.merchants(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  country TEXT,
  address TEXT,
  industry TEXT,
  website_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_company_profiles TO authenticated;
GRANT ALL ON public.merchant_company_profiles TO service_role;
ALTER TABLE public.merchant_company_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Merchant manages own profile" ON public.merchant_company_profiles
  FOR ALL TO authenticated
  USING (merchant_id = auth.uid()) WITH CHECK (merchant_id = auth.uid());
CREATE POLICY "Admins view all profiles" ON public.merchant_company_profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.merchant_company_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. merchant_subscriptions (rebuilt)
CREATE TABLE public.merchant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','failed','cancelled','suspended')),
  monthly_fee INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JPY',
  provider TEXT NOT NULL DEFAULT 'globepay',
  provider_agreement_id TEXT,
  checkout_url TEXT,
  started_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_billing_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_msub_merchant ON public.merchant_subscriptions(merchant_id);
CREATE INDEX idx_msub_next_billing ON public.merchant_subscriptions(next_billing_at) WHERE status = 'active';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_subscriptions TO authenticated;
GRANT ALL ON public.merchant_subscriptions TO service_role;
ALTER TABLE public.merchant_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Merchant views own subscription" ON public.merchant_subscriptions
  FOR SELECT TO authenticated USING (merchant_id = auth.uid());
CREATE POLICY "Admins view all subscriptions" ON public.merchant_subscriptions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_msub_updated_at BEFORE UPDATE ON public.merchant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. subscription_payment_attempts
CREATE TABLE public.subscription_payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.merchant_subscriptions(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('checkout','monthly_charge','retry')),
  provider TEXT NOT NULL DEFAULT 'globepay',
  provider_order_id TEXT NOT NULL UNIQUE,
  endpoint TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JPY',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','created','paid','failed','expired')),
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  raw_request JSONB,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_spa_merchant ON public.subscription_payment_attempts(merchant_id);
CREATE INDEX idx_spa_subscription ON public.subscription_payment_attempts(subscription_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_payment_attempts TO authenticated;
GRANT ALL ON public.subscription_payment_attempts TO service_role;
ALTER TABLE public.subscription_payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Merchant views own payment attempts" ON public.subscription_payment_attempts
  FOR SELECT TO authenticated USING (merchant_id = auth.uid());
CREATE POLICY "Admins view all attempts" ON public.subscription_payment_attempts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_spa_updated_at BEFORE UPDATE ON public.subscription_payment_attempts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. recurring_charge_records
CREATE TABLE public.recurring_charge_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.merchant_subscriptions(id) ON DELETE CASCADE,
  attempt_id UUID REFERENCES public.subscription_payment_attempts(id) ON DELETE SET NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'JPY',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','failed','skipped')),
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, period_start)
);
CREATE INDEX idx_rcr_merchant ON public.recurring_charge_records(merchant_id);
CREATE INDEX idx_rcr_subscription ON public.recurring_charge_records(subscription_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_charge_records TO authenticated;
GRANT ALL ON public.recurring_charge_records TO service_role;
ALTER TABLE public.recurring_charge_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Merchant views own charges" ON public.recurring_charge_records
  FOR SELECT TO authenticated USING (merchant_id = auth.uid());
CREATE POLICY "Admins view all charges" ON public.recurring_charge_records
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_rcr_updated_at BEFORE UPDATE ON public.recurring_charge_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7. subscription_plans: make publicly readable
DROP POLICY IF EXISTS "Plans public read" ON public.subscription_plans;
CREATE POLICY "Plans public read" ON public.subscription_plans
  FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.subscription_plans TO anon;
