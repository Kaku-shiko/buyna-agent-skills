
-- 1) merchants additional columns
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS contact_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS industry text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_profile';

-- 2) subscription_plans
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  setup_fee integer NOT NULL DEFAULT 0,
  monthly_fee integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'JPY',
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans are publicly readable"
  ON public.subscription_plans FOR SELECT
  TO anon, authenticated
  USING (is_active = true);
CREATE POLICY "Admins manage plans"
  ON public.subscription_plans FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER subscription_plans_touch
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.subscription_plans (code, name, setup_fee, monthly_fee, currency, description)
VALUES
  ('basic', 'Basic', 10000, 2980, 'JPY', '入门套餐：含一次性建站费用，按月扣款'),
  ('pro',   'Pro',   0,     4980, 'JPY', '专业套餐：无建站费，更多功能，按月扣款')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      setup_fee = EXCLUDED.setup_fee,
      monthly_fee = EXCLUDED.monthly_fee,
      currency = EXCLUDED.currency,
      description = EXCLUDED.description;

-- 3) merchant_subscriptions
CREATE TABLE IF NOT EXISTS public.merchant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  plan_code text NOT NULL,
  provider text NOT NULL DEFAULT 'global_payments',
  provider_subscription_id text,
  provider_customer_id text,
  status text NOT NULL DEFAULT 'pending',
  checkout_url text,
  started_at timestamptz,
  next_billing_at timestamptz,
  cancelled_at timestamptz,
  raw_request jsonb,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.merchant_subscriptions TO authenticated;
GRANT ALL ON public.merchant_subscriptions TO service_role;
ALTER TABLE public.merchant_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Merchants view own subscriptions"
  ON public.merchant_subscriptions FOR SELECT
  TO authenticated
  USING (merchant_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Merchants create own subscriptions"
  ON public.merchant_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (merchant_id = auth.uid());
CREATE POLICY "Merchants update own subscriptions"
  ON public.merchant_subscriptions FOR UPDATE
  TO authenticated
  USING (merchant_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (merchant_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER merchant_subscriptions_touch
  BEFORE UPDATE ON public.merchant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS merchant_subscriptions_merchant_idx
  ON public.merchant_subscriptions(merchant_id);

-- 4) payment_events
CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_subscription_id uuid NOT NULL REFERENCES public.merchant_subscriptions(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'global_payments',
  provider_event_id text,
  event_type text NOT NULL,
  status text NOT NULL,
  amount integer,
  currency text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_events TO authenticated;
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Merchants view own payment events"
  ON public.payment_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.merchant_subscriptions ms
      WHERE ms.id = merchant_subscription_id
        AND (ms.merchant_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- 5) Admins can view all merchants
DROP POLICY IF EXISTS "Admins view all merchants" ON public.merchants;
CREATE POLICY "Admins view all merchants"
  ON public.merchants FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
