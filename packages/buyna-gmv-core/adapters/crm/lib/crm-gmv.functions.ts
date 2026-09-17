import { createServerFn } from "@tanstack/react-start";
import { buildGmvSourceStatuses, summarizeGmvCurrencies } from "./crm-gmv";

async function buildSnapshot() {
  const { readAdminSession } = await import("./admin-auth.server");
  if (!readAdminSession()) throw new Error("管理员登录已失效，请重新登录");
  const [{ listGmvEvents, listGmvSourceSnapshots }, { listCustomers }] = await Promise.all([
    import("./crm-gmv.server"),
    import("./crm-customers.server"),
  ]);
  const [events, sourceSnapshots, customers] = await Promise.all([
    listGmvEvents(),
    listGmvSourceSnapshots(),
    listCustomers(),
  ]);
  const subscribedMerchants = customers
    .filter((customer) => customer.planStatus !== "停用")
    .map((customer) => ({
      sellerId: customer.sellerId || customer.id,
      merchantName: customer.company,
    }));
  const summaries = summarizeGmvCurrencies(events, subscribedMerchants, sourceSnapshots);
  return {
    summary: summaries[0],
    summaries,
    sources: buildGmvSourceStatuses(events, subscribedMerchants, sourceSnapshots),
    refreshedAt: new Date().toISOString(),
  };
}

export const getCrmGmvSummary = createServerFn({ method: "GET" }).handler(async () => {
  return buildSnapshot();
});

export const refreshCrmGmvSummary = createServerFn({ method: "POST" }).handler(async () => {
  const { readAdminSession } = await import("./admin-auth.server");
  if (!readAdminSession()) throw new Error("管理员登录已失效，请重新登录");
  const { syncBlueSequoiaGmvEvents, syncExternalGmvSources } = await import("./crm-gmv.server");
  const [blueSequoia, external] = await Promise.allSettled([
    syncBlueSequoiaGmvEvents(),
    syncExternalGmvSources(),
  ]);
  const sync = { blueSequoia, external };
  return { ...(await buildSnapshot()), sync };
});
