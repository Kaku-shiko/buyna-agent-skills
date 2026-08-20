import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  head: () => ({ meta: [{ title: "商家 — Buyna.ai 管理后台" }] }),
  component: MerchantsAdmin,
});

type Row = {
  id: string;
  shop_name: string | null;
  contact_name: string | null;
  email: string | null;
  status: string | null;
  created_at: string;
  subscription_id: string | null;
};

function MerchantsAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("merchants")
        .select(
          "id,shop_name,contact_name,email,status,created_at,merchant_subscriptions(id,status)",
        )
        .order("created_at", { ascending: false });
      if (error) {
        setError(error.message);
        return;
      }
      const list: Row[] = (data ?? []).map((m) => {
        const subs =
          (m as { merchant_subscriptions?: Array<{ id: string; status: string }> })
            .merchant_subscriptions ?? [];
        const active = subs.find((s) => s.status === "active") ?? subs[0] ?? null;
        return {
          id: m.id,
          shop_name: m.shop_name,
          contact_name: m.contact_name,
          email: m.email,
          status: m.status,
          created_at: m.created_at,
          subscription_id: active?.id ?? null,
        };
      });
      setRows(list);
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
      <h1 className="text-xl font-semibold">商家</h1>
      <div className="glass overflow-x-auto rounded-xl">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-3">商家</th>
              <th className="px-4 py-3">联系人</th>
              <th className="px-4 py-3">邮箱</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">注册时间</th>
              <th className="px-4 py-3">订阅</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-border/60">
                <td className="px-4 py-3 font-medium">{m.shop_name ?? "—"}</td>
                <td className="px-4 py-3">{m.contact_name ?? "—"}</td>
                <td className="px-4 py-3">{m.email ?? "—"}</td>
                <td className="px-4 py-3">{m.status ?? "—"}</td>
                <td className="px-4 py-3">{new Date(m.created_at).toLocaleDateString("ja-JP")}</td>
                <td className="px-4 py-3">
                  {m.subscription_id ? (
                    <Link
                      to="/admin/subscriptions/$id"
                      params={{ id: m.subscription_id }}
                      className="text-primary hover:underline"
                    >
                      查看
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  暂无商家数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
