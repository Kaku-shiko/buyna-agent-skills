ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS display_original_monthly_fee integer,
  ADD COLUMN IF NOT EXISTS promotional_monthly_fee integer,
  ADD COLUMN IF NOT EXISTS promotional_months integer NOT NULL DEFAULT 0;

UPDATE public.subscription_plans
SET setup_fee = 10000,
    monthly_fee = 3980,
    display_original_monthly_fee = 3980,
    promotional_monthly_fee = 2980,
    promotional_months = 3,
    description = 'Basic 套餐：首次开通费 JPY 10,000，前 3 个月月费 JPY 2,980，之后 JPY 3,980/月'
WHERE code = 'basic';

UPDATE public.subscription_plans
SET setup_fee = 10000,
    monthly_fee = 4980,
    display_original_monthly_fee = 4980,
    promotional_monthly_fee = 3980,
    promotional_months = 3,
    description = 'Pro 套餐：首次开通费 JPY 10,000，前 3 个月月费 JPY 3,980，之后 JPY 4,980/月'
WHERE code = 'pro';