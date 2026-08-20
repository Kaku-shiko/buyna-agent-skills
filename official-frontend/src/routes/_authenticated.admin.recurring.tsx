import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  RefreshCw,
  PlayCircle,
  Pause,
  XCircle,
  Loader2,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  adminListRecurringSubscriptions,
  adminRefreshAgreement,
  adminChargeOneNow,
  adminRunMonthlyBilling,
  adminPauseSubscription,
  adminCancelSubscription,
  adminGetSubscriptionCharges,
} from "@/lib/buyna-recurring.functions";
import { formatJPY } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/admin/recurring")({
  head: () => ({ meta: [{ title: "月度订阅 — Buyna.ai 管理" }] }),
  component: RecurringAdmin,
});

type Row = {
  id: string;
  plan_code: string;
  locked_monthly_amount: number;
  currency: string;
  status: string;
  merchant_agreement_id: string | null;
  platform_agreement_id: string | null;
  current_period_end: string | null;
  next_billing_date: string | null;
  created_at: string;
  customer: { company_name: string; contact_name: string; email: string } | null;
};

function RecurringAdmin() {
  const list = useServerFn(adminListRecurringSubscriptions);
  const refresh = useServerFn(adminRefreshAgreement);
  const charge = useServerFn(adminChargeOneNow);
  const runAll = useServerFn(adminRunMonthlyBilling);
  const pause = useServerFn(adminPauseSubscription);
  const cancel = useServerFn(adminCancelSubscription);
  const getCharges = useServerFn(adminGetSubscriptionCharges);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [charges, setCharges] = useState<Record<string, unknown[]>>({});

  const load = useCallback(async () => {
    setErr(null);
    try {
      const data = (await list()) as unknown as Row[];
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    }
  }, [list]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, fn: () => Promise<unknown>, msg: string) {
    setBusy(id);
    try {
      await fn();
      toast.success(msg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  async function toggleCharges(id: string) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (!charges[id]) {
      try {
        const c = await getCharges({ data: { subscriptionId: id } });
        setCharges((s) => ({ ...s, [id]: c as unknown[] }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加载扣款记录失败");
      }
    }
  }

  if (err)
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4" />
        <span>{err}</span>
      </div>
    );
  if (!rows) return <div className="text-sm text-muted-foreground">加载中…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">月度订阅 (WorldPay Recurring)</h1>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 刷新列表
          </button>
          <button
            onClick={() =>
              act(
                "run-all",
                async () => {
                  const r = await runAll();
                  toast.info(`已处理 ${r.processed} 条`);
                },
                "月度扣款执行完成",
              )
            }
            disabled={busy === "run-all"}
            className="inline-flex items-center gap-1.5 rounded-md btn-primary px-3 py-1.5 text-xs disabled:opacity-60"
          >
            <Calendar className="h-3.5 w-3.5" /> 立即执行到期扣款
          </button>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="rounded-lg border border-border bg-secondary/30 p-8 text-center text-sm text-muted-foreground">
          暂无订阅
        </div>
      )}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="glass rounded-xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{r.customer?.company_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {r.customer?.contact_name} · {r.customer?.email}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                  <span className="rounded bg-secondary/60 px-1.5 py-0.5 uppercase">
                    {r.plan_code}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 ${r.status === "active" ? "bg-primary/20 text-primary" : r.status === "pending_authorization" ? "bg-amber-500/20 text-amber-500" : r.status === "past_due" || r.status === "failed" ? "bg-destructive/20 text-destructive" : "bg-secondary/60"}`}
                  >
                    {r.status}
                  </span>
                  <span className="rounded bg-secondary/60 px-1.5 py-0.5">
                    月费 {formatJPY(r.locked_monthly_amount)}
                  </span>
                  {r.next_billing_date && (
                    <span className="rounded bg-secondary/60 px-1.5 py-0.5">
                      下次扣款{" "}
                      {new Date(r.next_billing_date).toLocaleDateString("ja-JP", {
                        timeZone: "Asia/Tokyo",
                      })}
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground break-all">
                  agr: {r.merchant_agreement_id ?? "—"}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() =>
                    act(
                      r.id,
                      async () => {
                        const q = await refresh({ data: { subscriptionId: r.id } });
                        toast.info(`agreement: ${q.status}`);
                      },
                      "已刷新",
                    )
                  }
                  disabled={busy === r.id}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px]"
                >
                  <RefreshCw className="h-3 w-3" /> 查询协议
                </button>
                <button
                  onClick={() =>
                    act(
                      r.id,
                      async () => {
                        const q = await charge({ data: { subscriptionId: r.id } });
                        toast.info(`charge: ${q.status}`);
                      },
                      "已发起扣款",
                    )
                  }
                  disabled={busy === r.id || r.status === "cancelled"}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px]"
                >
                  <PlayCircle className="h-3 w-3" /> 立即扣款
                </button>
                <button
                  onClick={() =>
                    act(r.id, () => pause({ data: { subscriptionId: r.id } }), "已暂停")
                  }
                  disabled={busy === r.id || r.status !== "active"}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px]"
                >
                  <Pause className="h-3 w-3" /> 暂停
                </button>
                <button
                  onClick={() => {
                    if (confirm("确定取消该订阅?"))
                      act(r.id, () => cancel({ data: { subscriptionId: r.id } }), "已取消");
                  }}
                  disabled={busy === r.id || r.status === "cancelled"}
                  className="inline-flex items-center gap-1 rounded-md border border-destructive/40 text-destructive px-2 py-1 text-[11px]"
                >
                  <XCircle className="h-3 w-3" /> 取消
                </button>
                <button
                  onClick={() => toggleCharges(r.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px]"
                >
                  {openId === r.id ? "收起" : "扣款记录"}
                </button>
              </div>
            </div>
            {openId === r.id && (
              <div className="mt-3 rounded-md border border-border bg-background/40 p-3 text-xs">
                {!charges[r.id] ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> 加载中…
                  </div>
                ) : (
                    charges[r.id] as Array<{
                      charge_id: string;
                      amount: number;
                      status: string;
                      created_at: string;
                      paid_at?: string | null;
                      provider_order_id?: string | null;
                    }>
                  ).length === 0 ? (
                  <div className="text-muted-foreground">暂无扣款</div>
                ) : (
                  <table className="w-full">
                    <thead className="text-[10px] text-muted-foreground">
                      <tr>
                        <th className="text-left">charge_id</th>
                        <th className="text-left">金额</th>
                        <th className="text-left">状态</th>
                        <th className="text-left">创建</th>
                        <th className="text-left">支付时间</th>
                        <th className="text-left">provider_order_id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        charges[r.id] as Array<{
                          charge_id: string;
                          amount: number;
                          status: string;
                          created_at: string;
                          paid_at?: string | null;
                          provider_order_id?: string | null;
                        }>
                      ).map((c) => (
                        <tr key={c.charge_id} className="border-t border-border/60">
                          <td className="py-1 font-mono text-[10px]">{c.charge_id}</td>
                          <td>{formatJPY(c.amount)}</td>
                          <td>{c.status}</td>
                          <td>
                            {new Date(c.created_at).toLocaleString("ja-JP", {
                              timeZone: "Asia/Tokyo",
                            })}
                          </td>
                          <td>
                            {c.paid_at
                              ? new Date(c.paid_at).toLocaleString("ja-JP", {
                                  timeZone: "Asia/Tokyo",
                                })
                              : "—"}
                          </td>
                          <td className="font-mono text-[10px]">{c.provider_order_id ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
