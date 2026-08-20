import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatJPY } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Dashboard — Buyna.ai 管理后台" }] }),
  component: AdminDashboard,
});

type Dashboard = {
  total_merchants: number;
  active_subscriptions: number;
  mrr: number;
  failed_charges_last_30d: number;
  recent_charges: Array<{
    id: string;
    amount: number;
    status: string;
    created_at: string;
    merchant_id: string;
  }>;
};

function AdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
        const [merchants, activeSubs, mrrSubs, failedCharges, recent] = await Promise.all([
          supabase.from("merchants").select("id", { count: "exact", head: true }),
          supabase
            .from("merchant_subscriptions")
            .select("id", { count: "exact", head: true })
            .eq("status", "active"),
          supabase.from("merchant_subscriptions").select("monthly_fee").eq("status", "active"),
          supabase
            .from("subscription_payment_attempts")
            .select("id", { count: "exact", head: true })
            .eq("status", "failed")
            .gte("created_at", since),
          supabase
            .from("subscription_payment_attempts")
            .select("id,amount,status,created_at,merchant_id")
            .order("created_at", { ascending: false })
            .limit(10),
        ]);
        const mrr = (mrrSubs.data ?? []).reduce(
          (sum, r: { monthly_fee: number | null }) => sum + (r.monthly_fee ?? 0),
          0,
        );
        setData({
          total_merchants: merchants.count ?? 0,
          active_subscriptions: activeSubs.count ?? 0,
          mrr,
          failed_charges_last_30d: failedCharges.count ?? 0,
          recent_charges: (recent.data ?? []) as Dashboard["recent_charges"],
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  if (error)
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4" />
        <span>{error}</span>
      </div>
    );
  if (!data) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const stats: Array<[string, string]> = [
    ["商家总数", String(data.total_merchants)],
    ["活跃订阅", String(data.active_subscriptions)],
    ["MRR (月经常性收入)", formatJPY(data.mrr)],
    ["近 30 天失败扣款", String(data.failed_charges_last_30d)],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="glass rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
            <div className="mt-2 text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      {data.recent_charges.length > 0 && (
        <div className="glass rounded-xl p-4">
          <div className="mb-3 text-sm font-semibold">最近付款</div>
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="pb-2">时间</th>
                <th className="pb-2">商家</th>
                <th className="pb-2">金额</th>
                <th className="pb-2">状态</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_charges.map((c) => (
                <tr key={c.id} className="border-t border-border/60">
                  <td className="py-2">{new Date(c.created_at).toLocaleString("ja-JP")}</td>
                  <td className="py-2 font-mono text-[10px]">{c.merchant_id.slice(0, 8)}…</td>
                  <td className="py-2">{formatJPY(c.amount)}</td>
                  <td className="py-2">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
