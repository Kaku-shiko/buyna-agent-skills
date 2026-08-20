// Subscription plan read layer — Supabase is the source of truth.
// `subscription_plans` has an anon SELECT policy on active rows.
import { supabase } from "@/integrations/supabase/client";

export type PublicPlan = {
  id: string;
  code: string;
  name: string;
  setup_fee: number;
  monthly_price: number;
  currency: string;
  description?: string | null;
  promotional_monthly_price: number | null;
  promotional_months: number | null;
  display_original_monthly_price: number | null;
  is_active: boolean;
};

type PlanRow = {
  id: string;
  code: string;
  name: string;
  setup_fee: number | null;
  monthly_fee: number | null;
  currency: string | null;
  description: string | null;
  promotional_monthly_fee: number | null;
  promotional_months: number | null;
  display_original_monthly_fee: number | null;
  is_active: boolean | null;
};

function mapPlan(r: PlanRow): PublicPlan {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    setup_fee: r.setup_fee ?? 0,
    monthly_price: r.monthly_fee ?? 0,
    currency: r.currency ?? "JPY",
    description: r.description,
    promotional_monthly_price: r.promotional_monthly_fee,
    promotional_months: r.promotional_months,
    display_original_monthly_price: r.display_original_monthly_fee,
    is_active: r.is_active ?? true,
  };
}

export async function fetchPublicPlans(_signal?: AbortSignal): Promise<PublicPlan[]> {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select(
      "id,code,name,setup_fee,monthly_fee,currency,description,promotional_monthly_fee,promotional_months,display_original_monthly_fee,is_active",
    )
    .eq("is_active", true)
    .order("monthly_fee", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapPlan(r as PlanRow));
}

// ---------- JPY formatting ----------
const jpyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

export function formatJPY(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return jpyFormatter.format(Number(n));
}
