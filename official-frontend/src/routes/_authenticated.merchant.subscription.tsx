import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string;
  plan_code: string;
  status: string;
  provider: string;
  started_at: string | null;
  next_billing_at: string | null;
  created_at: string;
  subscription_plans: {
    name: string;
    monthly_fee: number;
    setup_fee: number;
    currency: string;
  } | null;
};

export const Route = createFileRoute("/_authenticated/merchant/subscription")({
  head: () => ({ meta: [{ title: "我的订阅 — Buyna AI" }] }),
  component: MySub,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "待支付",
  active: "生效中",
  failed: "支付失败",
  cancelled: "已取消",
  suspended: "已暂停",
};

function MySub() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    supabase
      .from("merchant_subscriptions")
      .select(
        "id,plan_code,status,provider,started_at,next_billing_at,created_at,subscription_plans(name,monthly_fee,setup_fee,currency)",
      )
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as unknown as Row[]) ?? []));
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">我的订阅</h1>
        <Link
          to="/pricing"
          className="rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-xs hover:bg-secondary"
        >
          升级套餐
        </Link>
      </div>

      {rows === null ? (
        <div className="text-sm text-muted-foreground">加载中…</div>
      ) : rows.length === 0 ? (
        <div className="glass rounded-2xl p-10 text-center">
          <p className="text-sm text-muted-foreground">还没有订阅记录</p>
          <Link
            to="/pricing"
            className="mt-4 inline-block rounded-lg btn-primary px-4 py-2 text-sm font-semibold"
          >
            查看套餐
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="glass rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {r.provider}
                  </div>
                  <div className="text-lg font-semibold">
                    {r.subscription_plans?.name ?? r.plan_code.toUpperCase()}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    r.status === "active"
                      ? "bg-primary/15 text-primary"
                      : r.status === "pending"
                        ? "bg-yellow-500/15 text-yellow-500"
                        : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground md:grid-cols-4">
                <div>
                  <div className="text-[10px] uppercase">月费</div>
                  <div className="text-foreground">
                    {r.subscription_plans
                      ? `¥${r.subscription_plans.monthly_fee.toLocaleString()}`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase">建站费</div>
                  <div className="text-foreground">
                    {r.subscription_plans?.setup_fee
                      ? `¥${r.subscription_plans.setup_fee.toLocaleString()}`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase">下次扣款</div>
                  <div className="text-foreground">
                    {r.next_billing_at ? new Date(r.next_billing_at).toLocaleDateString() : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase">创建时间</div>
                  <div className="text-foreground">{new Date(r.created_at).toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
