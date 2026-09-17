import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Download,
  Globe2,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
  UserRoundCog,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GmvSourceStatus, GmvSummary } from "@/lib/crm-gmv";
import { getCrmGmvSummary, refreshCrmGmvSummary } from "@/lib/crm-gmv.functions";
import { getAdminSession } from "@/lib/admin-auth.functions";

export const Route = createFileRoute("/crm/gmv")({
  beforeLoad: async () => {
    const session = await getAdminSession();
    if (!session?.authenticated) throw redirect({ to: "/crm/login" });
  },
  head: () => ({ meta: [{ title: "收入管理 · GMV | Buyna CRM" }] }),
  component: CrmGmvPage,
});

const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;
const compactYen = (value: number) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const nav = [
  { label: "仪表盘", icon: LayoutDashboard },
  { label: "客户管理", icon: Users, to: "/crm/dashboard" as const },
  { label: "账号管理", icon: UserRoundCog, to: "/crm/accounts" as const },
  { label: "订阅管理", icon: CreditCard, to: "/crm/subscriptions" as const },
  { label: "收入管理", icon: TrendingUp, active: true },
  { label: "域名管理", icon: Globe2 },
  { label: "服务器管理", icon: Server },
  { label: "系统设置", icon: Settings },
];

function MetricCard({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <article className="rounded-2xl border border-[#dfe5ef] bg-white p-5 shadow-[0_1px_2px_rgba(23,32,51,0.03)]">
      <p className="text-sm font-medium text-[#66738a]">{label}</p>
      <strong className="mt-2 block text-2xl font-bold tracking-[-0.03em] text-[#172033]">
        {value}
      </strong>
      <p
        className={`mt-2 flex items-center gap-1 text-xs font-medium ${
          tone === "positive"
            ? "text-[#09865c]"
            : tone === "negative"
              ? "text-[#c63e4d]"
              : "text-[#7a869b]"
        }`}
      >
        {tone === "positive" && <ArrowUpRight className="h-3.5 w-3.5" />}
        {tone === "negative" && <ArrowDownRight className="h-3.5 w-3.5" />}
        {note}
      </p>
    </article>
  );
}

function CrmGmvPage() {
  const [summaries, setSummaries] = useState<GmvSummary[]>([]);
  const [currency, setCurrency] = useState<"JPY" | "CNY">("JPY");
  const summary = summaries.find(item => item.currency === currency);
  const yen = (amount: number) => new Intl.NumberFormat("zh-CN", {style:"currency",currency,currencyDisplay:"code"}).format(amount / (currency === "CNY" ? 100 : 1));
  const [sources, setSources] = useState<GmvSourceStatus[]>([]);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadSummary = async (synchronize = false) => {
    setIsRefreshing(true);
    setError("");
    try {
      const snapshot = synchronize ? await refreshCrmGmvSummary() : await getCrmGmvSummary();
      setSummaries(snapshot.summaries);
      setSources(snapshot.sources);
      setLastUpdatedAt(new Date(snapshot.refreshedAt));
    } catch {
      setError(
        synchronize
          ? "GMV 同步失败，页面已保留同步前的数据，请稍后重试。"
          : "GMV 数据读取失败，请稍后重试。",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadSummary();
  }, []);

  const metrics = summary ?? {
    netGmv: 0,
    grossPaid: 0,
    refunds: 0,
    paidOrders: 0,
    merchants: [],
    trend: [],
  };
  const averageOrder = metrics.paidOrders > 0 ? metrics.grossPaid / metrics.paidOrders : 0;
  const refundRate = metrics.grossPaid > 0 ? (metrics.refunds / metrics.grossPaid) * 100 : 0;
  const maxMerchantGmv = Math.max(...metrics.merchants.map((item) => item.netGmv), 1);
  const merchantsWithGmv = metrics.merchants.filter((merchant) => merchant.netGmv !== 0).length;
  const sourceBySeller = new Map(sources.map((source) => [source.sellerId, source]));
  const connectedSources = sources.filter((source) => source.state === "live").length;
  const chartData = useMemo(
    () =>
      metrics.trend.map((item) => ({
        ...item,
        label: item.month.replace("-", "/"),
      })),
    [metrics.trend],
  );

  return (
    <div className="grid min-h-screen bg-[#f5f7fb] text-[#172033] lg:grid-cols-[208px_minmax(0,1fr)]">
      <aside className="hidden border-r border-[#dfe5ef] bg-white px-3 py-5 lg:flex lg:flex-col">
        <div className="px-3 text-xl font-bold tracking-[-0.03em] text-[#2f55d9]">Buyna</div>
        <nav className="mt-7 flex flex-col gap-1" aria-label="CRM 主导航">
          {nav.map((item) => {
            const content = (
              <>
                <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                {item.label}
              </>
            );
            const className = `flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors ${
              item.active
                ? "bg-[#edf1ff] text-[#3156d8]"
                : "text-[#526077] hover:bg-[#f4f6fa] hover:text-[#172033]"
            }`;
            return item.to ? (
              <Link key={item.label} to={item.to} className={className}>
                {content}
              </Link>
            ) : (
              <button key={item.label} type="button" className={className}>
                {content}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-[#e6eaf1] px-3 pt-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#3156d8] text-xs font-semibold text-white">
              OM
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">运营管理员</div>
              <div className="truncate text-xs text-[#778399]">info@buyna.jp</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-[#3156d8] lg:hidden">
              <CircleDollarSign className="h-4 w-4" /> Buyna CRM
            </div>
            <p className="text-xs font-semibold tracking-[0.12em] text-[#3156d8]">
              REVENUE CONTROL
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-[-0.025em]">收入管理</h1>
            <p className="mt-1 text-sm text-[#69758b]">查看平台交易总额、退款与商户 GMV 贡献</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="crm-control" type="button">
              <CalendarDays className="h-4 w-4" /> 2026年
              <ChevronDown className="h-4 w-4" />
            </button>
            <button className="crm-control" type="button">
              <Download className="h-4 w-4" /> 导出
            </button>
            <div className="flex items-center gap-2" aria-live="polite">
              <span className="hidden text-xs text-[#7a869b] sm:inline">
                {isRefreshing
                  ? "更新中…"
                  : lastUpdatedAt
                    ? `${lastUpdatedAt.toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })} 已更新`
                    : "等待更新"}
              </span>
              <button
                className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6deec] bg-white text-[#526077] shadow-sm transition-colors hover:border-[#3156d8] hover:text-[#3156d8] disabled:cursor-wait disabled:opacity-60"
                type="button"
                onClick={() => void loadSummary(true)}
                disabled={isRefreshing}
                aria-label={isRefreshing ? "正在刷新 GMV 数据" : "刷新 GMV 数据"}
                title={isRefreshing ? "更新中" : "刷新 GMV"}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </header>

        {lastUpdatedAt && (
          <div
            className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#69758b]"
            aria-live="polite"
          >
            <span className="rounded-full bg-[#e8f7f0] px-2.5 py-1 font-semibold text-[#087a55]">
              {connectedSources} 个实时监听
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dfe5ef]">
              {sources.filter((source) => source.state === "historical").length} 个历史接入
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 ring-1 ring-[#dfe5ef]">
              {sources.filter((source) => source.state === "not_connected").length} 个待接入
            </span>
          </div>
        )}

        <label className="mt-5 flex items-center gap-3 text-sm">统计币种<select aria-label="统计币种" value={currency} onChange={event=>setCurrency(event.target.value as "JPY" | "CNY")} className="rounded border p-2"><option value="JPY">JPY 日元</option><option value="CNY">CNY 人民币</option></select><span>不同币种分别统计</span></label>
        {error && (
          <div className="mt-5 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => void loadSummary()}
            >
              重新读取
            </button>
          </div>
        )}

        <section className="mt-5 overflow-hidden rounded-2xl bg-[#18234a] text-white shadow-[0_12px_34px_rgba(24,35,74,0.16)]">
          <div className="grid lg:grid-cols-[1.12fr_1fr]">
            <div className="relative overflow-hidden p-6 sm:p-8">
              <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border-[38px] border-white/[0.035]" />
              <div className="relative">
                <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-[#aebbf4]">
                  <ShieldCheck className="h-4 w-4" /> 已验证交易口径
                </div>
                <p className="mt-5 text-sm text-[#bac4df]">项目净 GMV</p>
                <strong className="mt-1 block text-4xl font-bold tracking-[-0.045em] sm:text-5xl">
                  {yen(metrics.netGmv)}
                </strong>
                <p className="mt-4 max-w-md text-sm leading-6 text-[#aeb9d6]">
                  仅统计服务端确认支付成功的交易，并扣除已完成退款。订阅服务费不计入 GMV。
                </p>
              </div>
            </div>
            <div className="grid border-t border-white/10 bg-white/[0.035] sm:grid-cols-[1fr_auto_1fr_auto_1fr] lg:border-l lg:border-t-0">
              <div className="flex flex-col justify-center p-5">
                <span className="text-xs text-[#aeb9d6]">支付成功总额</span>
                <strong className="mt-2 text-xl">{yen(metrics.grossPaid)}</strong>
              </div>
              <span className="hidden self-center text-xl text-[#7380a3] sm:block">−</span>
              <div className="flex flex-col justify-center border-t border-white/10 p-5 sm:border-t-0">
                <span className="text-xs text-[#aeb9d6]">已完成退款</span>
                <strong className="mt-2 text-xl text-[#ffadb5]">{yen(metrics.refunds)}</strong>
              </div>
              <span className="hidden self-center text-xl text-[#7380a3] sm:block">=</span>
              <div className="flex flex-col justify-center border-t border-white/10 p-5 sm:border-t-0">
                <span className="text-xs text-[#aeb9d6]">净 GMV</span>
                <strong className="mt-2 text-xl text-[#9ce6c9]">{yen(metrics.netGmv)}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="支付成功订单"
            value={metrics.paidOrders.toLocaleString("zh-CN")}
            note="已验证支付结果"
            tone="positive"
          />
          <MetricCard
            label="平均客单价"
            value={yen(Math.round(averageOrder))}
            note="按支付成功订单计算"
          />
          <MetricCard
            label="退款率"
            value={`${refundRate.toFixed(1)}%`}
            note="退款额 ÷ 支付成功总额"
            tone={refundRate > 5 ? "negative" : "neutral"}
          />
          <MetricCard
            label="订阅商户"
            value={metrics.merchants.length.toLocaleString("zh-CN")}
            note={`${merchantsWithGmv} 家本期产生 GMV`}
          />
        </section>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)]">
          <article className="rounded-2xl border border-[#dfe5ef] bg-white p-5 shadow-[0_1px_2px_rgba(23,32,51,0.03)] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">月度 GMV 趋势</h2>
                <p className="mt-1 text-xs text-[#778399]">净 GMV · 单位为日元</p>
              </div>
              <span className="rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-semibold text-[#3156d8]">
                实际交易
              </span>
            </div>
            <div className="mt-5 h-[280px]">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3156d8" stopOpacity={0.24} />
                        <stop offset="100%" stopColor="#3156d8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e8ecf3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#7a869b", fontSize: 12 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#7a869b", fontSize: 12 }}
                      tickFormatter={compactYen}
                      width={58}
                    />
                    <Tooltip
                      formatter={(value) => [yen(Number(value)), "净 GMV"]}
                      labelStyle={{ color: "#172033" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="netGmv"
                      stroke="#3156d8"
                      strokeWidth={2.5}
                      fill="url(#gmvFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center rounded-xl border border-dashed border-[#d9dfeb] bg-[#fafbfe] text-center">
                  <div>
                    <TrendingUp className="mx-auto h-6 w-6 text-[#8c98ad]" />
                    <p className="mt-2 text-sm font-medium">暂无已验证的 GMV 趋势</p>
                    <p className="mt-1 text-xs text-[#7a869b]">
                      收到支付成功事件后将在这里生成曲线
                    </p>
                  </div>
                </div>
              )}
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-[#dfe5ef] bg-white shadow-[0_1px_2px_rgba(23,32,51,0.03)]">
            <div className="flex items-start justify-between border-b border-[#e9edf4] p-5 sm:p-6">
              <div>
                <h2 className="font-bold">商户 GMV 贡献</h2>
                <p className="mt-1 text-xs text-[#778399]">按净 GMV 从高到低</p>
              </div>
              <WalletCards className="h-5 w-5 text-[#3156d8]" />
            </div>
            <div className="max-h-[330px] overflow-y-auto">
              {metrics.merchants.map((merchant, index) => (
                <div
                  key={merchant.sellerId}
                  className="border-b border-[#edf0f5] p-4 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f0f3fa] text-xs font-bold text-[#566279]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-sm font-semibold">{merchant.merchantName}</p>
                        <strong className="shrink-0 text-sm">{yen(merchant.netGmv)}</strong>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf0f6]">
                        <div
                          className="h-full rounded-full bg-[#3156d8]"
                          style={{
                            width: `${Math.max((merchant.netGmv / maxMerchantGmv) * 100, 2)}%`,
                          }}
                        />
                      </div>
                      <div className="mt-1.5 flex min-w-0 items-center gap-2 text-[11px] text-[#8490a4]">
                        <p className="truncate">
                          Seller ID: {merchant.sellerId} · {merchant.paidOrders} 笔支付成功订单
                        </p>
                        {(() => {
                          const source = sourceBySeller.get(merchant.sellerId);
                          const label =
                            source?.state === "live"
                              ? "实时监听"
                              : source?.state === "historical"
                                ? "历史接入"
                                : "待接入";
                          const tone =
                            source?.state === "live"
                              ? "bg-[#e8f7f0] text-[#087a55]"
                              : source?.state === "historical"
                                ? "bg-[#fff4df] text-[#a65a00]"
                                : "bg-[#f0f2f6] text-[#69758b]";
                          const title = source?.lastSyncedAt
                            ? `最近数据：${new Date(source.lastSyncedAt).toLocaleString("zh-CN")}`
                            : "尚未收到真实交易事件";
                          return (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${tone}`}
                              title={title}
                            >
                              {label}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {metrics.merchants.length === 0 && (
                <div className="grid min-h-[250px] place-items-center p-8 text-center">
                  <div>
                    <WalletCards className="mx-auto h-6 w-6 text-[#8c98ad]" />
                    <p className="mt-2 text-sm font-medium">暂无商户贡献数据</p>
                    <p className="mt-1 text-xs text-[#7a869b]">商户产生已验证交易后显示排行</p>
                  </div>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#dfe5ef] bg-white p-5 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#edf8f4] text-[#09865c]">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="font-semibold">GMV 统计口径</p>
              <p className="mt-1 text-xs leading-5 text-[#778399]">
                支付成功金额 − 已完成退款；不包含待支付、失败订单与 Buyna 订阅服务费。
              </p>
            </div>
          </div>
          <Link
            to="/crm/dashboard"
            className="inline-flex min-h-10 items-center gap-2 self-start rounded-lg border border-[#d6dce7] px-3 text-xs font-semibold text-[#526077] hover:bg-[#f7f8fb] sm:self-auto"
          >
            <ArrowLeft className="h-4 w-4" /> 返回客户管理
          </Link>
        </section>

        <button
          type="button"
          className="fixed bottom-5 right-5 z-20 flex min-h-11 items-center gap-2 rounded-lg border border-[#d6dce7] bg-white px-4 text-sm font-semibold text-[#46536a] shadow-lg hover:bg-[#f8f9fc]"
        >
          <LogOut className="h-4 w-4" /> 退出登录
        </button>
      </main>
    </div>
  );
}
