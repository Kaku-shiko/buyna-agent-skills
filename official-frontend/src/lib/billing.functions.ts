import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createHostedCardOrder,
  queryOrderStatus,
  genHostedOrderId,
  genClientOrderId,
} from "./globepay.server";

/* ============================================================
 * Buyna.ai subscription backend (rebuilt schema)
 *
 * Tables: merchants · merchant_company_profiles · subscription_plans
 *         merchant_subscriptions · subscription_payment_attempts
 *         recurring_charge_records
 *
 * Statuses:
 *   merchants.status:                pending_profile | pending_payment | active | suspended
 *   merchant_subscriptions.status:   pending | active | failed | cancelled | suspended
 * ============================================================ */

function nextMonth(from = new Date()): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/**
 * Trusted plan config is fetched at request time from the external
 * subscription REST API. No hard-coded prices live here.
 */
type PlanCfg = {
  planCode: string;
  planName: string;
  setupFee: number;
  firstMonthFee: number;
  monthlyFee: number;
  firstPaymentAmount: number;
  currency: string;
};

async function fetchTrustedPlan(planCode: string): Promise<PlanCfg | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("subscription_plans")
    .select("code,name,setup_fee,monthly_fee,promotional_monthly_fee,currency,is_active")
    .ilike("code", planCode)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`plans query failed: ${error.message}`);
  if (!data) return null;
  const setupFee = Number(data.setup_fee ?? 0);
  const monthlyFee = Number(data.monthly_fee ?? 0);
  const firstMonthFee =
    data.promotional_monthly_fee != null ? Number(data.promotional_monthly_fee) : monthlyFee;
  return {
    planCode: data.code.toUpperCase(),
    planName: data.name,
    setupFee,
    firstMonthFee,
    monthlyFee,
    firstPaymentAmount: setupFee + firstMonthFee,
    currency: data.currency ?? "JPY",
  };
}

/* -----------------------------------------------------------
 * GET /api/subscription/plans/
 * ----------------------------------------------------------- */
/** Public list of active subscription plans. */
export const listSubscriptionPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .order("monthly_fee", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

/* -----------------------------------------------------------
 * GET /api/merchant/me/
 * ----------------------------------------------------------- */
export const getCurrentMerchant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [merchant, profile, subscription, recentAttempts, recentCharges] = await Promise.all([
      supabase.from("merchants").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("merchant_company_profiles")
        .select("*")
        .eq("merchant_id", userId)
        .maybeSingle(),
      supabase
        .from("merchant_subscriptions")
        .select("*")
        .eq("merchant_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("subscription_payment_attempts")
        .select("id,purpose,amount,currency,status,provider_order_id,paid_at,created_at")
        .eq("merchant_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("recurring_charge_records")
        .select("id,period_start,period_end,amount,currency,status,paid_at,failed_at")
        .eq("merchant_id", userId)
        .order("period_start", { ascending: false })
        .limit(12),
    ]);
    return {
      merchant: merchant.data ?? null,
      profile: profile.data ?? null,
      subscription: subscription.data ?? null,
      recent_attempts: recentAttempts.data ?? [],
      recent_charges: recentCharges.data ?? [],
    };
  });

/* -----------------------------------------------------------
 * POST /api/merchants/company-info/
 * ----------------------------------------------------------- */
const CompanyInfoSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  country: z.string().trim().max(100).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  industry: z.string().trim().max(100).optional().or(z.literal("")),
  websiteUrl: z.string().trim().max(300).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const saveCompanyInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => CompanyInfoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { error: pErr } = await supabase.from("merchant_company_profiles").upsert(
      {
        merchant_id: userId,
        company_name: data.companyName,
        contact_name: data.contactName,
        email: data.email,
        phone: data.phone || null,
        country: data.country || null,
        address: data.address || null,
        industry: data.industry || null,
        website_url: data.websiteUrl || null,
        notes: data.notes || null,
      },
      { onConflict: "merchant_id" },
    );
    if (pErr) throw new Error(`save company info failed: ${pErr.message}`);

    // Advance merchant status from pending_profile → pending_payment (idempotent)
    const { data: m } = await supabase
      .from("merchants")
      .select("status")
      .eq("id", userId)
      .maybeSingle();
    if (m?.status === "pending_profile" || !m?.status) {
      await supabase.from("merchants").update({ status: "pending_payment" }).eq("id", userId);
    }

    return { ok: true };
  });

/* -----------------------------------------------------------
 * POST /api/subscription/checkout/
 *   Creates merchant_subscriptions (pending) + subscription_payment_attempts
 *   (purpose=checkout) + GlobePay hosted card order.
 * ----------------------------------------------------------- */
const CheckoutSchema = z.object({
  planCode: z.string().min(1),
  returnOrigin: z.string().url(),
  // Optional inline company info for one-shot subscribe
  form: CompanyInfoSchema.optional(),
});

export const createHostedCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => CheckoutSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Resolve trusted plan from external subscription API
    const planCfg = await fetchTrustedPlan(data.planCode);
    if (!planCfg) throw new Error("Selected plan is not available.");
    const firstPayment = planCfg.firstPaymentAmount;

    // 2. Find matching subscription_plans row for FK
    const { data: planRow } = await supabase
      .from("subscription_plans")
      .select("id,code")
      .ilike("code", planCfg.planCode)
      .maybeSingle();
    if (!planRow) throw new Error(`plan ${planCfg.planCode} not seeded in subscription_plans`);

    // 3. Optionally upsert company info
    if (data.form) {
      await supabase.from("merchant_company_profiles").upsert(
        {
          merchant_id: userId,
          company_name: data.form.companyName,
          contact_name: data.form.contactName,
          email: data.form.email,
          phone: data.form.phone || null,
          country: data.form.country || null,
          address: data.form.address || null,
          industry: data.form.industry || null,
          website_url: data.form.websiteUrl || null,
          notes: data.form.notes || null,
        },
        { onConflict: "merchant_id" },
      );
      await supabase
        .from("merchants")
        .update({
          shop_name: data.form.companyName,
          contact_name: data.form.contactName,
          email: data.form.email,
          phone: data.form.phone || undefined,
          status: "pending_payment",
        })
        .eq("id", userId);
    }

    // 4. Reuse-or-create pending subscription for this merchant+plan
    const existing = await supabase
      .from("merchant_subscriptions")
      .select("id,status")
      .eq("merchant_id", userId)
      .eq("plan_id", planRow.id)
      .eq("status", "pending")
      .maybeSingle();

    let subscriptionId = existing.data?.id;
    if (!subscriptionId) {
      const ins = await supabase
        .from("merchant_subscriptions")
        .insert({
          merchant_id: userId,
          plan_id: planRow.id,
          plan_code: planCfg.planCode,
          status: "pending",
          monthly_fee: planCfg.monthlyFee,
          currency: planCfg.currency,
          provider: "globepay",
          auto_renew: true,
        })
        .select("id")
        .single();
      if (ins.error || !ins.data)
        throw new Error(ins.error?.message ?? "create subscription failed");
      subscriptionId = ins.data.id;
    }

    // 5. Create pending payment_attempt
    const providerOrderId = genHostedOrderId();
    const attemptIns = await supabase
      .from("subscription_payment_attempts")
      .insert({
        merchant_id: userId,
        subscription_id: subscriptionId,
        purpose: "checkout",
        provider: "globepay",
        provider_order_id: providerOrderId,
        endpoint: "pre_card_orders",
        amount: firstPayment,
        currency: planCfg.currency,
        status: "pending",
      })
      .select("id")
      .single();
    if (attemptIns.error || !attemptIns.data) {
      throw new Error(attemptIns.error?.message ?? "create attempt failed");
    }
    const attemptId = attemptIns.data.id;

    // 6. GlobePay hosted card order
    const redirectUrl = `${data.returnOrigin}/payment/success?order_id=${encodeURIComponent(providerOrderId)}`;
    let hosted;
    try {
      hosted = await createHostedCardOrder({
        clientOrderId: providerOrderId,
        description: `${planCfg.planName} subscription (setup + first month)`,
        priceJpy: firstPayment,
        redirectUrl,
        extra: {
          billing_reason: "subscription_first_payment",
          merchant_id: userId,
          subscription_id: subscriptionId,
          attempt_id: attemptId,
          plan_code: planCfg.planCode,
        },
      });
    } catch (e) {
      await supabase
        .from("subscription_payment_attempts")
        .update({
          status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: e instanceof Error ? e.message : String(e),
        })
        .eq("id", attemptId);
      throw e;
    }

    await supabase
      .from("subscription_payment_attempts")
      .update({ status: "created", raw_response: JSON.parse(JSON.stringify(hosted.raw)) })
      .eq("id", attemptId);

    await supabase
      .from("merchant_subscriptions")
      .update({ checkout_url: hosted.pay_url })
      .eq("id", subscriptionId);

    return {
      subscription_id: subscriptionId,
      attempt_id: attemptId,
      provider_order_id: providerOrderId,
      pay_url: hosted.pay_url,
      first_payment_amount: firstPayment,
      currency: planCfg.currency,
    };
  });

/* -----------------------------------------------------------
 * GET /api/subscription/status/
 *   Polls a specific provider_order_id + returns order-shaped DTO
 *   (payment.success page keeps its existing shape).
 * ----------------------------------------------------------- */
export const getOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ providerOrderId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: attempt } = await supabase
      .from("subscription_payment_attempts")
      .select("id,subscription_id,amount,currency,status,paid_at,provider_order_id,raw_response")
      .eq("provider_order_id", data.providerOrderId)
      .eq("merchant_id", userId)
      .maybeSingle();
    if (!attempt) return { found: false as const };

    // Poll GlobePay if still open
    if (attempt.status === "pending" || attempt.status === "created") {
      try {
        const remote = await queryOrderStatus(data.providerOrderId);
        if (remote.result_code === "PAY_SUCCESS") {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await markAttemptPaid({
            supabase: supabaseAdmin,
            providerOrderId: data.providerOrderId,
            totalFee: remote.total_fee ?? attempt.amount,
            currency: remote.currency ?? attempt.currency,
            channelOrderId: remote.channel_order_id ?? null,
            rawPayload: remote.raw,
          });
        }
      } catch {
        /* frontend keeps polling */
      }
    }

    const { data: refreshed } = await supabase
      .from("subscription_payment_attempts")
      .select("id,subscription_id,amount,currency,status,paid_at,provider_order_id")
      .eq("provider_order_id", data.providerOrderId)
      .eq("merchant_id", userId)
      .maybeSingle();
    const a = refreshed ?? attempt;

    const { data: sub } = a.subscription_id
      ? await supabase
          .from("merchant_subscriptions")
          .select("plan_code,status")
          .eq("id", a.subscription_id)
          .maybeSingle()
      : { data: null };

    const planCfg = sub?.plan_code ? await fetchTrustedPlan(sub.plan_code).catch(() => null) : null;

    return {
      found: true as const,
      order: {
        id: a.id,
        status:
          a.status === "paid"
            ? "paid"
            : a.status === "failed" || a.status === "expired"
              ? "failed"
              : "pending_payment",
        plan_code: sub?.plan_code ?? "",
        plan_name: planCfg?.planName ?? sub?.plan_code ?? "",
        first_payment_amount: a.amount,
        currency: a.currency,
        paid_at: a.paid_at,
        provider_order_id: a.provider_order_id,
        provider_transaction_id: null as string | null,
      },
    };
  });

/* -----------------------------------------------------------
 * Idempotent payment-success handler shared by webhook + poll.
 * Marks attempt paid → activates subscription → seeds first period.
 * ----------------------------------------------------------- */
type SubscriptionPaymentAttempt = {
  id: string;
  merchant_id: string;
  subscription_id: string | null;
  amount: number;
  currency: string;
  status: string;
  purpose: string | null;
};

type SupabaseMutationResult = { error: { message: string } | null };

type SupabaseTable = PromiseLike<SupabaseMutationResult> & {
  select: (columns: string) => SupabaseTable;
  eq: (column: string, value: unknown) => SupabaseTable;
  maybeSingle: () => Promise<{ data: SubscriptionPaymentAttempt | null }>;
  update: (values: Record<string, unknown>) => SupabaseTable;
  insert: (values: Record<string, unknown>) => SupabaseTable;
};

type AdminClient = {
  from: (table: string) => SupabaseTable;
};

export async function markAttemptPaid(opts: {
  supabase: AdminClient;
  providerOrderId: string;
  totalFee: number;
  currency: string;
  channelOrderId: string | null;
  rawPayload: unknown;
}): Promise<{ ok: boolean; reason?: string }> {
  const sb = opts.supabase;

  const { data: attempt } = await sb
    .from("subscription_payment_attempts")
    .select("id,merchant_id,subscription_id,amount,currency,status,purpose")
    .eq("provider_order_id", opts.providerOrderId)
    .maybeSingle();
  if (!attempt) return { ok: false, reason: "attempt not found" };
  if (attempt.status === "paid") return { ok: true, reason: "already paid" };

  if (attempt.amount !== opts.totalFee || attempt.currency !== opts.currency) {
    await sb
      .from("subscription_payment_attempts")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: "amount/currency mismatch",
        raw_response: JSON.parse(JSON.stringify(opts.rawPayload ?? {})),
      })
      .eq("id", attempt.id);
    return { ok: false, reason: "amount/currency mismatch" };
  }

  const nowIso = new Date().toISOString();
  await sb
    .from("subscription_payment_attempts")
    .update({
      status: "paid",
      paid_at: nowIso,
      raw_response: JSON.parse(JSON.stringify(opts.rawPayload ?? {})),
    })
    .eq("id", attempt.id);

  // Activate merchant + subscription
  await sb.from("merchants").update({ status: "active" }).eq("id", attempt.merchant_id);

  if (attempt.subscription_id && attempt.purpose === "checkout") {
    const start = new Date();
    const end = nextMonth(start);
    await sb
      .from("merchant_subscriptions")
      .update({
        status: "active",
        started_at: nowIso,
        current_period_end: end.toISOString(),
        next_billing_at: end.toISOString(),
      })
      .eq("id", attempt.subscription_id);

    // Seed first paid period in recurring_charge_records (idempotent by unique key)
    await sb.from("recurring_charge_records").insert({
      merchant_id: attempt.merchant_id,
      subscription_id: attempt.subscription_id,
      attempt_id: attempt.id,
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      amount: attempt.amount,
      currency: attempt.currency,
      status: "paid",
      paid_at: nowIso,
    });
  }

  return { ok: true };
}

/* -----------------------------------------------------------
 * POST /api/subscription/charges/run-monthly/  (admin only)
 *
 * Note: GlobePay Japan WorldPay Recurring is not enabled on this
 * merchant account, so we cannot automatically charge cards.
 * This job creates *pending* recurring_charge_records for every
 * subscription whose next_billing_at is due; Buyna admin follows up
 * with a hosted checkout link for the next payment.
 * ----------------------------------------------------------- */
export const runMonthlyCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data: due, error } = await supabaseAdmin
      .from("merchant_subscriptions")
      .select("id,merchant_id,plan_code,monthly_fee,currency,next_billing_at")
      .eq("status", "active")
      .lte("next_billing_at", nowIso);
    if (error) throw new Error(error.message);

    const created: string[] = [];
    for (const sub of due ?? []) {
      const periodStart = new Date(sub.next_billing_at ?? nowIso);
      const periodEnd = nextMonth(periodStart);
      const ins = await supabaseAdmin.from("recurring_charge_records").insert({
        merchant_id: sub.merchant_id,
        subscription_id: sub.id,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        amount: sub.monthly_fee,
        currency: sub.currency,
        status: "pending",
      });
      if (!ins.error) {
        await supabaseAdmin
          .from("merchant_subscriptions")
          .update({
            next_billing_at: periodEnd.toISOString(),
            current_period_end: periodEnd.toISOString(),
          })
          .eq("id", sub.id);
        created.push(sub.id);
      }
    }
    return { created_count: created.length };
  });
