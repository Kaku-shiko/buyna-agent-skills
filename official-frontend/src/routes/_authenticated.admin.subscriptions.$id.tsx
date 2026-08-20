import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatJPY } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/subscriptions/$id")({
  head: () => ({ meta: [{ title: "订阅详情 — Buyna.ai 管理后台" }] }),
  component: SubDetailView,
});

type SubDetail = {
  id: string;
  status: string;
  plan_code: string | null;
  monthly_fee: number | null;
  merchant_id: string;
  next_billing_at: string | null;
  started_at: string | null;
  cancelled_at: string | null;
};

const STATUSES = ["pending", "active", "failed", "cancelled", "suspended"];

function SubDetailView() {
  const { id } = Route.useParams();
  const [data, setData] = useState<SubDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: row, error } = await supabase
        .from("merchant_subscriptions")
        .select(
          "id,status,plan_code,monthly_fee,merchant_id,next_billing_at,started_at,cancelled_at",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) {
        setError(error.message);
        return;
      }
      if (!row) {
        setError("未找到该订阅");
        return;
      }
      setData(row as SubDetail);
      setStatus(row.status);
    })();
  }, [id]);

  async function save() {
    if (!data) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { status };
      if (status === "cancelled") patch.cancelled_at = new Date().toISOString();
      const { error } = await supabase
        .from("merchant_subscriptions")
        .update(patch as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      setData({
        ...data,
        status,
        cancelled_at: status === "cancelled" ? new Date().toISOString() : data.cancelled_at,
      });
      toast.success("已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (error)
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4" /> <span>{error}</span>
      </div>
    );
  if (!data) return <div className="text-sm text-muted-foreground">加载中…</div>;

  const fields: Array<[string, string]> = [
    ["商家 ID", data.merchant_id],
    ["套餐", data.plan_code ?? "—"],
    ["月费", formatJPY(data.monthly_fee)],
    ["开始时间", data.started_at ? new Date(data.started_at).toLocaleString("ja-JP") : "—"],
    [
      "下次扣款",
      data.next_billing_at ? new Date(data.next_billing_at).toLocaleString("ja-JP") : "—",
    ],
    ["取消时间", data.cancelled_at ? new Date(data.cancelled_at).toLocaleString("ja-JP") : "—"],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        订阅 <span className="font-mono text-sm text-muted-foreground">{data.id.slice(0, 8)}…</span>
      </h1>
      <div className="glass grid gap-3 rounded-xl p-4 sm:grid-cols-2">
        {fields.map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
            <div className="text-sm break-all">{v}</div>
          </div>
        ))}
      </div>
      <div className="glass rounded-xl p-4">
        <div className="text-sm font-semibold">修改状态</div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-border bg-background/40 px-3 py-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={save}
            disabled={saving || status === data.status}
            className="rounded-md btn-primary px-3 py-2 text-xs disabled:opacity-60"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
