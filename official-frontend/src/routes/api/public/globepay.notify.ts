import { createFileRoute } from "@tanstack/react-router";
import { verifyNotifySignature } from "@/lib/globepay.server";
import { markAttemptPaid } from "@/lib/billing.functions";

function parseNotifyPayload(requestUrl: string, contentType: string, raw: string) {
  const payload: Record<string, unknown> = {};

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return payload;
    }
  }

  const params = new URLSearchParams(raw);
  for (const [key, value] of params.entries()) payload[key] = value;

  if (Object.keys(payload).length === 0) {
    const query = new URL(requestUrl).searchParams;
    for (const [key, value] of query.entries()) payload[key] = value;
  }

  return payload;
}

export const Route = createFileRoute("/api/public/globepay/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentType = request.headers.get("content-type") ?? "";
        const raw = await request.text();
        const payload = parseNotifyPayload(request.url, contentType, raw);

        if (!verifyNotifySignature(payload)) {
          return new Response("invalid signature", { status: 401 });
        }

        const returnCode = String(payload.return_code ?? "SUCCESS").toUpperCase();
        const resultCode = String(payload.result_code ?? "").toUpperCase();
        if (returnCode !== "SUCCESS" || resultCode !== "PAY_SUCCESS") {
          return Response.json({ return_code: "SUCCESS" });
        }

        const partnerOrderId = String(
          payload.partner_order_id ??
            payload.client_order_id ??
            payload.out_trade_no ??
            payload.order_id ??
            "",
        );
        const totalFee = Number(payload.total_fee ?? payload.real_fee ?? payload.price ?? 0);
        const currency = String(payload.currency ?? "JPY");
        const channelOrderId = (payload.channel_order_id as string | undefined) ?? null;
        if (!partnerOrderId) return Response.json({ return_code: "SUCCESS" });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await markAttemptPaid({
          supabase: supabaseAdmin,
          providerOrderId: partnerOrderId,
          totalFee,
          currency,
          channelOrderId,
          rawPayload: payload,
        });

        return Response.json({ return_code: "SUCCESS" });
      },
    },
  },
});
