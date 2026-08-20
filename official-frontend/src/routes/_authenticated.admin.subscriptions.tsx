import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatJPY } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  head: () => ({ meta: [{ title: "订阅 — Buyna.ai 管理后台" }] }),
  component: SubsAdmin,
});

type Row = {
  id: string;
  plan_code: string | null;
  status: string;
  monthly_fee: number | null;
  merchant_id: string;
  started_at: string | null;
  next_billing_at: string | null;
};

function SubsAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("merchant_subscriptions")
        .select("id,plan_code,status,monthly_fee,merchant_id,started_at,next_billing_at")
        .order("created_at", { ascending: false });
      if (error) {
        setError(error.message);
        return;
      }
      setRows((data ?? []) as Row[]);
    })();
  }, []);

  if (error)
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4" /> <span>{error}</span>
      </div>
    );
  if (!rows) return <div className="text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">订阅</h1>
      <div className="glass overflow-x-auto rounded-xl">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">商家</th>
              <th className="px-4 py-3">套餐</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">月费</th>
              <th className="px-4 py-3">下次扣款</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-border/60">
                <td className="px-4 py-3 font-mono text-[10px]">{s.id.slice(0, 8)}…</td>
                <td className="px-4 py-3 font-mono text-[10px]">{s.merchant_id.slice(0, 8)}…</td>
                <td className="px-4 py-3">{s.plan_code ?? "—"}</td>
                <td className="px-4 py-3">{s.status}</td>
                <td className="px-4 py-3">{formatJPY(s.monthly_fee)}</td>
                <td className="px-4 py-3">
                  {s.next_billing_at
                    ? new Date(s.next_billing_at).toLocaleDateString("ja-JP")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to="/admin/subscriptions/$id"
                    params={{ id: s.id }}
                    className="text-primary hover:underline"
                  >
                    详情
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  暂无订阅
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
