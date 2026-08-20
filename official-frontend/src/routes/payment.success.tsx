import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getOrderStatus } from "@/lib/billing.functions";
import { formatOfficialJPY, type OfficialLanguage } from "@/content/official-site";
import { useOfficialLanguage } from "@/hooks/use-official-language";

type OrderInfo = {
  id: string;
  status: string;
  plan_code: string;
  plan_name: string;
  first_payment_amount: number;
  currency: string;
  paid_at: string | null;
  provider_order_id: string;
  provider_transaction_id: string | null;
};

export const Route = createFileRoute("/payment/success")({
  validateSearch: (s: Record<string, unknown>) => ({
    order_id: typeof s.order_id === "string" ? s.order_id : "",
    plan: typeof s.plan === "string" ? s.plan : "",
    mock: typeof s.mock === "string" ? s.mock : "",
    provider_order_id: typeof s.provider_order_id === "string" ? s.provider_order_id : "",
  }),
  head: () => ({ meta: [{ title: "支付状态 - Buyna AI" }] }),
  component: SuccessPage,
});

function formatMoney(amount: number, currency: string, language: OfficialLanguage) {
  if (currency === "JPY") return formatOfficialJPY(amount, language);
  return `${currency} ${amount.toLocaleString()}`;
}

function SuccessPage() {
  const search = Route.useSearch();
  const providerOrderId = search.order_id || search.provider_order_id;
  const query = useServerFn(getOrderStatus);
  const { content, language } = useOfficialLanguage();
  const copy = content.paymentSuccess;
  const [email, setEmail] = useState<string>("");
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [phase, setPhase] = useState<"loading" | "paid" | "pending" | "failed">("loading");
  const polls = useRef(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => {
    if (!providerOrderId) {
      setPhase("failed");
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await query({ data: { providerOrderId } });
        if (cancelled) return;
        if (!res.found) {
          setPhase("failed");
          return;
        }
        setOrder(res.order as OrderInfo);
        if (res.order.status === "paid") {
          setPhase("paid");
          try {
            window.sessionStorage.removeItem(`buyna_subscribe_draft_${res.order.plan_code}`);
          } catch {
            /* ignore */
          }
        } else if (res.order.status === "pending_payment") {
          setPhase("pending");
          polls.current += 1;
          if (polls.current < 30) {
            setTimeout(tick, 3000);
          }
        } else {
          setPhase("failed");
        }
      } catch {
        if (!cancelled) setPhase("failed");
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [providerOrderId, query]);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-xl flex-col items-center justify-center px-6 py-10 text-center">
      <div className="glass w-full rounded-2xl p-10">
        {phase === "loading" || phase === "pending" ? (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <h1 className="mt-4 text-xl font-semibold">
              {phase === "loading" ? copy.loadingTitle : copy.pendingTitle}
            </h1>
            <p className="mt-2 text-xs text-muted-foreground">
              {phase === "pending" ? (
                <>
                  <Clock className="mr-1 inline h-3 w-3" />
                  {copy.pendingDescription}
                </>
              ) : (
                copy.loadingDescription
              )}
            </p>
          </>
        ) : phase === "paid" && order ? (
          <>
            <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
            <h1 className="mt-4 text-2xl font-semibold">{copy.paidTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{copy.paidDescription}</p>

            <dl className="mt-6 grid gap-2 rounded-xl border border-border bg-background/40 p-4 text-left text-sm">
              <Row k={copy.rows.plan} v={order.plan_name || order.plan_code.toUpperCase()} />
              <Row
                k={copy.rows.amount}
                v={formatMoney(order.first_payment_amount, order.currency, language)}
              />
              <Row k={copy.rows.method} v="Credit Card / GlobePay Japan" />
              <Row k={copy.rows.order} v={order.provider_order_id} mono />
              {order.provider_transaction_id && (
                <Row k={copy.rows.transaction} v={order.provider_transaction_id} mono />
              )}
              {email && <Row k={copy.rows.email} v={email} />}
              {order.paid_at && (
                <Row
                  k={copy.rows.paidAt}
                  v={new Date(order.paid_at).toLocaleString("ja-JP", {
                    timeZone: "Asia/Tokyo",
                  })}
                />
              )}
            </dl>

            <p className="mt-5 rounded-md bg-primary/10 px-3 py-2 text-xs text-foreground">
              {copy.contactNote}
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <Link
                to="/merchant/subscription"
                className="rounded-lg btn-primary px-4 py-2.5 text-sm font-semibold"
              >
                {copy.viewSubscription}
              </Link>
            </div>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-xl font-semibold">{copy.failedTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{copy.failedDescription}</p>
            <div className="mt-6 flex flex-col gap-2">
              <Link
                to="/pricing"
                className="rounded-lg btn-primary px-4 py-2.5 text-sm font-semibold"
              >
                {copy.retryPricing}
              </Link>
              <Link
                to="/merchant/subscription"
                className="rounded-lg border border-border bg-secondary/60 px-4 py-2.5 text-sm hover:bg-secondary"
              >
                {copy.viewSubscriptionAlt}
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className={mono ? "font-mono text-xs" : "text-sm"}>{v}</dd>
    </div>
  );
}
