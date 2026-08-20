
CREATE TABLE public.ai_guide_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  price numeric,
  currency text,
  target_url text,
  merchant_name text,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_guide_sources TO anon, authenticated;
GRANT ALL ON public.ai_guide_sources TO service_role;
ALTER TABLE public.ai_guide_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active guide sources"
  ON public.ai_guide_sources FOR SELECT
  USING (is_active = true);
CREATE TRIGGER trg_ai_guide_sources_updated_at
  BEFORE UPDATE ON public.ai_guide_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ai_guide_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  user_message text NOT NULL,
  ai_answer text,
  recommended_source_ids uuid[] NOT NULL DEFAULT '{}',
  clicked_source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ai_guide_conversations TO service_role;
ALTER TABLE public.ai_guide_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only"
  ON public.ai_guide_conversations FOR ALL
  USING (false) WITH CHECK (false);

INSERT INTO public.ai_guide_sources (type, title, description, category, price, currency, target_url, merchant_name, priority, tags) VALUES
('plan', 'Buyna.ai Basic 套餐', '官网制作 + 商品/服务一键下单支付，最多 20 SKU，2 个页面以内，每月免费修改 2 次。', 'plan', 2980, 'JPY', '/pricing', 'Buyna.ai', 100, ARRAY['官网','建站','支付','订阅','basic']),
('plan', 'Buyna.ai Pro 套餐', '含 Basic 全部功能，最多 60 SKU，每周免费修改 1 次，优先客服。', 'plan', 4980, 'JPY', '/pricing', 'Buyna.ai', 100, ARRAY['官网','建站','支付','订阅','pro','推荐']),
('feature', 'GlobePay 环球支付收款', '信用卡、银行卡、微信 / 支付宝 QR 收款，PCI DSS 合规托管。', 'payment', NULL, NULL, '/', 'Buyna.ai', 80, ARRAY['支付','信用卡','微信','支付宝','globepay']),
('feature', '电商型商家官网', '商品展示、多 SKU、购物车、下单支付，适合销售实体商品。', 'ecommerce', NULL, NULL, '/pricing', 'Buyna.ai', 70, ARRAY['电商','商品','sku','官网']),
('feature', '预约型商家官网', '服务展示、在线预约、定金或全款支付，适合服务与预订类商家。', 'booking', NULL, NULL, '/pricing', 'Buyna.ai', 70, ARRAY['预约','服务','美甲','沙龙','booking']);
