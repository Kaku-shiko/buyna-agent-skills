import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatJPY } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertCircle, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/projects")({
  head: () => ({ meta: [{ title: "套餐价格 — Buyna.ai 管理后台" }] }),
  component: PlansAdmin,
});

type AdminPlan = {
  id: string;
  code: string;
  name: string;
  setup_fee: number;
  monthly_fee: number;
  promotional_monthly_fee: number | null;
  promotional_months: number | null;
  display_original_monthly_fee: number | null;
  is_active: boolean;
};

function PlansAdmin() {
  const [plans, setPlans] = useState<AdminPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | number | null>(null);

  useEffect(() => {
    supabase
      .from("subscription_plans")
      .select(
        "id,code,name,setup_fee,monthly_fee,promotional_monthly_fee,promotional_months,display_original_monthly_fee,is_active",
      )
      .order("monthly_fee", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setPlans((data ?? []) as AdminPlan[]);
      });
  }, []);

  function updateField<K extends keyof AdminPlan>(idx: number, key: K, val: AdminPlan[K]) {
    setPlans((cur) => cur && cur.map((p, i) => (i === idx ? { ...p, [key]: val } : p)));
  }

  async function save(p: AdminPlan) {
    setSavingId(p.id);
    try {
      const patch = {
        setup_fee: Number(p.setup_fee),
        monthly_fee: Number(p.monthly_fee),
        promotional_monthly_fee:
          p.promotional_monthly_fee == null || String(p.promotional_monthly_fee) === ""
            ? null
            : Number(p.promotional_monthly_fee),
        promotional_months:
          p.promotional_months == null || String(p.promotional_months) === ""
            ? null
            : Number(p.promotional_months),
        display_original_monthly_fee:
          p.display_original_monthly_fee == null
            ? Number(p.monthly_fee)
            : Number(p.display_original_monthly_fee),
      };
      const { error } = await supabase
        .from("subscription_plans")
        .update(patch as never)
        .eq("id", p.id);
      if (error) throw new Error(error.message);
      toast.success(`${p.name} 已更新,前台刷新即生效`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingId(null);
    }
  }

  if (error)
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4" />
        <span>{error}</span>
      </div>
    );
  if (!plans) return <div className="text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">套餐价格</h1>
      <p className="text-xs text-muted-foreground">
        修改后立即保存到数据库,公开 /pricing 页面刷新后同步显示。
      </p>
      <div className="space-y-4">
        {plans.map((p, i) => (
          <div
            key={p.id}
            className="glass grid gap-3 rounded-xl p-4 sm:grid-cols-[1fr_repeat(4,140px)_auto] sm:items-end"
          >
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">套餐</div>
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="text-[10px] text-muted-foreground">code: {p.code}</div>
            </div>
            <NumField
              label="初期开通费 (JPY)"
              value={p.setup_fee}
              onChange={(v) => updateField(i, "setup_fee", (v === "" ? 0 : v) as number)}
            />
            <NumField
              label="月费 (JPY)"
              value={p.monthly_fee}
              onChange={(v) => updateField(i, "monthly_fee", (v === "" ? 0 : v) as number)}
            />
            <NumField
              label="优惠月费"
              value={p.promotional_monthly_fee ?? ""}
              onChange={(v) =>
                updateField(i, "promotional_monthly_fee", v === "" ? null : (v as number))
              }
            />
            <NumField
              label="优惠月数"
              value={p.promotional_months ?? ""}
              onChange={(v) =>
                updateField(i, "promotional_months", v === "" ? null : (v as number))
              }
            />
            <button
              onClick={() => save(p)}
              disabled={savingId === p.id}
              className="inline-flex items-center gap-1.5 rounded-md btn-primary px-3 py-2 text-xs disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" /> {savingId === p.id ? "保存中…" : "保存"}
            </button>
            <div className="col-span-full text-[11px] text-muted-foreground">
              预览:月费 {formatJPY(p.monthly_fee)}
              {p.promotional_monthly_fee
                ? ` · 首 ${p.promotional_months ?? 0} 个月 ${formatJPY(p.promotional_monthly_fee)}`
                : ""}
              {p.setup_fee ? ` · 首次开通 ${formatJPY(p.setup_fee)}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | string;
  onChange: (v: number | "") => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="mt-1 w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
