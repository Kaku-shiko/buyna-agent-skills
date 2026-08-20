import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Buyna.ai WorldPay Recurring subscription server functions.
 * Public: startRecurringSubscription, verifyRecurringReturn
 * Admin:  adminListSubscriptions, adminRefreshAgreement, adminRunMonthlyBilling,
 *         adminChargeOne, adminPauseSubscription, adminCancelSubscription
 */

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
}

const StartSchema = z.object({
  planCode: z.string().min(1),
  company_name: z.string().min(1).max(200),
  contact_name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(50).optional().default(""),
  company_address: z.string().max(500).optional().default(""),
  country: z.string().max(100).optional().default(""),
  website_url: z.string().max(500).optional().default(""),
  notes: z.string().max(2000).optional().default(""),
  agree: z.boolean().refine((v) => v, "Must agree to monthly recurring billing"),
});

function cleanEnv(value: string | undefined) {
  return value?.trim().replace(/^=+/, "").trim();
}

function recurringNotifyUrl(origin: string) {
  return (
    cleanEnv(process.env.GLOBEPAY_RECURRING_NOTIFY_URL) ||
    cleanEnv(process.env.GLOBEPAY_NOTIFY_URL) ||
    `${origin}/api/public/globepay-recurring-notify`
  );
}

export const startRecurringSubscription = createServerFn({ method: "POST" })
  .validator((raw) => StartSchema.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createRecurringPreOrder, genMerchantAgreementId, genRecurringClientOrderId } =
      await import("./globepay-recurring.server");

    // Server-side plan re-read (never trust client price).
    const { data: plan, error: planErr } = await supabaseAdmin
      .from("subscription_plans")
      .select("id,code,name,monthly_fee,currency,is_active")
      .ilike("code", data.planCode)
      .eq("is_active", true)
      .maybeSingle();
    if (planErr) throw new Error(planErr.message);
    if (!plan) throw new Error(`Plan not found: ${data.planCode}`);
    if ((plan.currency ?? "JPY") !== "JPY") throw new Error("Only JPY is supported");

    // Customer row.
    const { data: customer, error: custErr } = await supabaseAdmin
      .from("buyna_customers")
      .insert({
        company_name: data.company_name,
        contact_name: data.contact_name,
        email: data.email,
        phone: data.phone || null,
        company_address: data.company_address || null,
        country: data.country || null,
        website_url: data.website_url || null,
        notes: data.notes || null,
      })
      .select("id")
      .single();
    if (custErr) throw new Error(custErr.message);

    const merchantAgreementId = genMerchantAgreementId();
    const monthly = Number(plan.monthly_fee);

    // Subscription draft.
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("buyna_subscriptions")
      .insert({
        customer_id: customer.id,
        plan_id: plan.id,
        plan_code: plan.code,
        locked_monthly_amount: monthly,
        currency: "JPY",
        status: "pending_authorization",
        merchant_agreement_id: merchantAgreementId,
      })
      .select("id")
      .single();
    if (subErr) throw new Error(subErr.message);

    // Origin & URLs
    const origin = process.env.PUBLIC_SITE_URL ?? process.env.APP_URL ?? "https://www.buyna.ai";
    const notifyUrl = recurringNotifyUrl(origin);
    const baseReturn = cleanEnv(process.env.GLOBEPAY_RETURN_URL) || `${origin}/subscription/return`;
    const sep = baseReturn.includes("?") ? "&" : "?";
    const redirectUrl = `${baseReturn}${sep}agreement=${encodeURIComponent(merchantAgreementId)}`;

    const preorder = await createRecurringPreOrder({
      clientOrderId: genRecurringClientOrderId(),
      merchantAgreementId,
      description: `Buyna.ai ${plan.name} monthly subscription`,
      priceJpy: monthly,
      notifyUrl,
      redirectUrl,
    });

    await supabaseAdmin.from("globepay_recurring_agreements").insert({
      subscription_id: sub.id,
      merchant_agreement_id: merchantAgreementId,
      platform_agreement_id: preorder.platform_agreement_id ?? null,
      status: "PENDING",
      raw_response: preorder.raw as unknown as never,
    });

    if (preorder.platform_agreement_id) {
      await supabaseAdmin
        .from("buyna_subscriptions")
        .update({ platform_agreement_id: preorder.platform_agreement_id })
        .eq("id", sub.id);
    }

    return {
      subscriptionId: sub.id,
      merchantAgreementId,
      payUrl: preorder.pay_url,
    };
  });

// ---- Verify return / query agreement ----

export const verifyRecurringReturn = createServerFn({ method: "POST" })
  .validator((raw) => z.object({ merchantAgreementId: z.string().min(1) }).parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { queryAgreement } = await import("./globepay-recurring.server");

    const { data: sub, error } = await supabaseAdmin
      .from("buyna_subscriptions")
      .select(
        "id,status,platform_agreement_id,current_period_start,current_period_end,next_billing_date,locked_monthly_amount,plan_code",
      )
      .eq("merchant_agreement_id", data.merchantAgreementId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sub) throw new Error("Subscription not found");

    const q = await queryAgreement(data.merchantAgreementId);

    await supabaseAdmin
      .from("globepay_recurring_agreements")
      .update({
        status: q.status,
        platform_agreement_id: q.platform_agreement_id ?? null,
        raw_response: q.raw as unknown as never,
      })
      .eq("merchant_agreement_id", data.merchantAgreementId);

    if (q.status === "ACTIVE" && sub.status !== "active") {
      const now = new Date();
      const periodEnd = addMonths(now, 1);
      await supabaseAdmin
        .from("buyna_subscriptions")
        .update({
          status: "active",
          platform_agreement_id: q.platform_agreement_id ?? sub.platform_agreement_id ?? null,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          next_billing_date: periodEnd.toISOString(),
        })
        .eq("id", sub.id);
      return { status: "active" as const };
    }
    if (q.status === "FAILED") {
      await supabaseAdmin.from("buyna_subscriptions").update({ status: "failed" }).eq("id", sub.id);
      return { status: "failed" as const };
    }
    return { status: q.status === "PENDING" ? ("pending" as const) : ("unknown" as const) };
  });

// ---- Admin helpers ----

type AuthSupabaseClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
};

async function assertAdmin(context: { supabase: AuthSupabaseClient; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const adminListRecurringSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("buyna_subscriptions")
      .select(
        "id,plan_code,locked_monthly_amount,currency,status,merchant_agreement_id,platform_agreement_id,current_period_end,next_billing_date,created_at,customer:buyna_customers(company_name,contact_name,email)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminGetSubscriptionCharges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ subscriptionId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("buyna_subscription_charges")
      .select("*")
      .eq("subscription_id", data.subscriptionId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminRefreshAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ subscriptionId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { queryAgreement } = await import("./globepay-recurring.server");
    const { data: sub, error } = await supabaseAdmin
      .from("buyna_subscriptions")
      .select("id,merchant_agreement_id,status")
      .eq("id", data.subscriptionId)
      .single();
    if (error) throw new Error(error.message);
    const q = await queryAgreement(sub.merchant_agreement_id!);
    await supabaseAdmin
      .from("globepay_recurring_agreements")
      .update({
        status: q.status,
        platform_agreement_id: q.platform_agreement_id ?? null,
        raw_response: q.raw as unknown as never,
      })
      .eq("merchant_agreement_id", sub.merchant_agreement_id!);
    if (q.status === "ACTIVE" && sub.status !== "active") {
      const now = new Date();
      const end = addMonths(now, 1);
      await supabaseAdmin
        .from("buyna_subscriptions")
        .update({
          status: "active",
          platform_agreement_id: q.platform_agreement_id ?? null,
          current_period_start: now.toISOString(),
          current_period_end: end.toISOString(),
          next_billing_date: end.toISOString(),
        })
        .eq("id", sub.id);
    }
    return { status: q.status };
  });

export const adminPauseSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ subscriptionId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("buyna_subscriptions")
      .update({ status: "paused" })
      .eq("id", data.subscriptionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminCancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ subscriptionId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("buyna_subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", data.subscriptionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- MIT: charge one subscription now ----

async function chargeSubscriptionNow(subscriptionId: string): Promise<{
  ok: boolean;
  status: string;
  message?: string;
  chargeId?: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { createRecurringCharge, queryRecurringCharge, genRecurringChargeId } =
    await import("./globepay-recurring.server");
  const { data: sub, error } = await supabaseAdmin
    .from("buyna_subscriptions")
    .select("id,platform_agreement_id,locked_monthly_amount,plan_code,status,current_period_end")
    .eq("id", subscriptionId)
    .single();
  if (error) throw new Error(error.message);
  if (!sub.platform_agreement_id)
    return { ok: false, status: "no_agreement", message: "Missing platform_agreement_id" };

  const origin = process.env.PUBLIC_SITE_URL ?? process.env.APP_URL ?? "https://www.buyna.ai";
  const notifyUrl = recurringNotifyUrl(origin);

  const chargeId = genRecurringChargeId();
  const periodStart = new Date();
  const periodEnd = addMonths(periodStart, 1);

  // Insert pending charge row (idempotent by unique charge_id).
  const { error: chErr } = await supabaseAdmin.from("buyna_subscription_charges").insert({
    subscription_id: sub.id,
    charge_id: chargeId,
    amount: sub.locked_monthly_amount,
    currency: "JPY",
    status: "pending",
    billing_period_start: periodStart.toISOString(),
    billing_period_end: periodEnd.toISOString(),
  });
  if (chErr) throw new Error(chErr.message);

  const created = await createRecurringCharge({
    platformAgreementId: sub.platform_agreement_id,
    chargeId,
    description: `Buyna.ai ${sub.plan_code.toUpperCase()} monthly charge`,
    priceJpy: sub.locked_monthly_amount,
    notifyUrl,
  });
  if (!created.ok) {
    await supabaseAdmin
      .from("buyna_subscription_charges")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        provider_response: created.raw as unknown as never,
      })
      .eq("charge_id", chargeId);
    await supabaseAdmin.from("buyna_subscriptions").update({ status: "past_due" }).eq("id", sub.id);
    return { ok: false, status: "create_failed", chargeId };
  }
  const q = await queryRecurringCharge(sub.platform_agreement_id, chargeId);
  if (q.status === "PAY_SUCCESS") {
    await supabaseAdmin
      .from("buyna_subscription_charges")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        provider_order_id: q.provider_order_id ?? null,
        provider_response: q.raw as unknown as never,
      })
      .eq("charge_id", chargeId);
    await supabaseAdmin
      .from("buyna_subscriptions")
      .update({
        status: "active",
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        next_billing_date: periodEnd.toISOString(),
      })
      .eq("id", sub.id);
    return { ok: true, status: "paid", chargeId };
  }
  if (q.status === "PAY_FAIL") {
    await supabaseAdmin
      .from("buyna_subscription_charges")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        provider_response: q.raw as unknown as never,
      })
      .eq("charge_id", chargeId);
    await supabaseAdmin.from("buyna_subscriptions").update({ status: "past_due" }).eq("id", sub.id);
    return { ok: false, status: "pay_fail", chargeId };
  }
  // PAYING / UNKNOWN — leave pending, notify webhook will resolve.
  return { ok: true, status: q.status.toLowerCase(), chargeId };
}

export const adminChargeOneNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ subscriptionId: z.string().uuid() }).parse(raw))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    return chargeSubscriptionNow(data.subscriptionId);
  });

export const adminRunMonthlyBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data: due, error } = await supabaseAdmin
      .from("buyna_subscriptions")
      .select("id")
      .eq("status", "active")
      .lte("next_billing_date", nowIso);
    if (error) throw new Error(error.message);
    const results: Array<{ id: string; status: string }> = [];
    for (const row of due ?? []) {
      try {
        const r = await chargeSubscriptionNow(row.id);
        results.push({ id: row.id, status: r.status });
      } catch (e) {
        results.push({ id: row.id, status: `error: ${(e as Error).message}` });
      }
    }
    return { processed: results.length, results };
  });
