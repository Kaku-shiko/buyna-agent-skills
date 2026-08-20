import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatJPY } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({ meta: [{ title: "扣款记录 — Buyna.ai 管理后台" }] }),
  component: ChargesAdmin,
});

type Row = {
  id: string;
  amount: number;
  currency: string | null;
  status: string;
  merchant_id: string;
  subscription_id: string | null;
  created_at: string;
  paid_at: string | null;
  provider_order_id: string | null;
};

function ChargesAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      let q = supabase
        .from("subscription_payment_attempts")
        .select(
          "id,amount,currency,status,merchant_id,subscription_id,created_at,paid_at,provider_order_id",
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) {
        setError(error.message);
        return;
      }
      setRows((data ?? []) as Row[]);
    })();
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">扣款记录</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs"
        >
          <option value="">全部</option>
          <option value="paid">paid</option>
          <option value="failed">failed</option>
          <option value="pending">pending</option>
          <option value="created">created</option>
        </select>
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4" /> <span>{error}</span>
        </div>
      )}
      {!error && !rows && <div className="text-sm text-muted-foreground">加载中…</div>}
      {rows && (
        <div className="glass overflow-x-auto rounded-xl">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">商家</th>
                <th className="px-4 py-3">金额</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">订单号</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border/60">
                  <td className="px-4 py-3">{new Date(c.created_at).toLocaleString("ja-JP")}</td>
                  <td className="px-4 py-3 font-mono text-[10px]">{c.merchant_id.slice(0, 8)}…</td>
                  <td className="px-4 py-3">{formatJPY(c.amount)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        c.status === "paid"
                          ? "text-green-500"
                          : c.status === "failed"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[10px]">{c.provider_order_id ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    暂无记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
