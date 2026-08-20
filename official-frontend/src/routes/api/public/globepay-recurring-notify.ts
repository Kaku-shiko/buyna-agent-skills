import { createFileRoute } from "@tanstack/react-router";

/**
 * GlobePay recurring notify webhook.
 * Accepts JSON or form-urlencoded payload; verifies signature; updates
 * agreement + charge records idempotently.
 */
export const Route = createFileRoute("/api/public/globepay-recurring-notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ct = request.headers.get("content-type") ?? "";
          const raw = await request.text();
          let payload: Record<string, unknown> = {};
          if (ct.includes("application/json")) {
            try {
              payload = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              payload = {};
            }
          } else {
            const params = new URLSearchParams(raw);
            for (const [k, v] of params.entries()) payload[k] = v;
          }

          const { verifyRecurringNotify } = await import("@/lib/globepay-recurring.server");
          if (!verifyRecurringNotify(payload)) {
            return new Response("bad signature", { status: 401 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Charge notify?
          const chargeId = String(
            payload.charge_id ?? payload.client_order_id ?? payload.out_trade_no ?? "",
          );
          const resultCode = String(payload.result_code ?? "").toUpperCase();
          if (chargeId) {
            const { data: existing } = await supabaseAdmin
              .from("buyna_subscription_charges")
              .select("id,subscription_id,status,billing_period_end")
              .eq("charge_id", chargeId)
              .maybeSingle();
            if (existing && existing.status === "pending") {
              if (resultCode === "PAY_SUCCESS") {
                await supabaseAdmin
                  .from("buyna_subscription_charges")
                  .update({
                    status: "paid",
                    paid_at: new Date().toISOString(),
                    provider_order_id: payload.order_id ? String(payload.order_id) : null,
                    provider_response: payload as unknown as never,
                  })
                  .eq("id", existing.id);
                if (existing.billing_period_end) {
                  await supabaseAdmin
                    .from("buyna_subscriptions")
                    .update({
                      status: "active",
                      current_period_end: existing.billing_period_end,
                      next_billing_date: existing.billing_period_end,
                    })
                    .eq("id", existing.subscription_id);
                }
              } else if (resultCode === "PAY_FAIL") {
                await supabaseAdmin
                  .from("buyna_subscription_charges")
                  .update({
                    status: "failed",
                    failed_at: new Date().toISOString(),
                    provider_response: payload as unknown as never,
                  })
                  .eq("id", existing.id);
                await supabaseAdmin
                  .from("buyna_subscriptions")
                  .update({ status: "past_due" })
                  .eq("id", existing.subscription_id);
              }
            }
          }

          // Agreement notify?
          const merchantAgreementId = String(payload.merchant_agreement_id ?? "");
          const agreementStatus = String(
            payload.status ?? payload.agreement_status ?? "",
          ).toUpperCase();
          if (merchantAgreementId && agreementStatus) {
            await supabaseAdmin
              .from("globepay_recurring_agreements")
              .update({
                status: agreementStatus,
                platform_agreement_id: payload.platform_agreement_id
                  ? String(payload.platform_agreement_id)
                  : null,
                raw_response: payload as unknown as never,
              })
              .eq("merchant_agreement_id", merchantAgreementId);
            if (agreementStatus === "ACTIVE") {
              const { data: sub } = await supabaseAdmin
                .from("buyna_subscriptions")
                .select("id,status")
                .eq("merchant_agreement_id", merchantAgreementId)
                .maybeSingle();
              if (sub && sub.status !== "active") {
                const now = new Date();
                const end = new Date(now);
                end.setUTCMonth(end.getUTCMonth() + 1);
                await supabaseAdmin
                  .from("buyna_subscriptions")
                  .update({
                    status: "active",
                    platform_agreement_id: payload.platform_agreement_id
                      ? String(payload.platform_agreement_id)
                      : null,
                    current_period_start: now.toISOString(),
                    current_period_end: end.toISOString(),
                    next_billing_date: end.toISOString(),
                  })
                  .eq("id", sub.id);
              }
            }
          }

          return Response.json({ return_code: "SUCCESS", return_msg: "OK" });
        } catch (e) {
          return new Response(`notify error: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});
