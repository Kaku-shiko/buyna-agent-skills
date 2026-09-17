export type GmvEventType = "PAYMENT_CAPTURED" | "REFUND_COMPLETED";

export const MINIMUM_REAL_GMV_JPY = 1;
export type GmvCurrency = "JPY" | "CNY";

export type GmvEvent = {
  id: string;
  projectId: string;
  sellerId: string;
  merchantName: string;
  eventType: GmvEventType;
  amount: number;
  currency: string;
  occurredAt: string;
  orderId: string;
  providerEventId: string;
  sourceSystem: string;
};

export type GmvSummary = {
  currency?: GmvCurrency;
  grossPaid: number;
  refunds: number;
  netGmv: number;
  paidOrders: number;
  merchants: Array<{ sellerId: string; merchantName: string; netGmv: number; paidOrders: number }>;
  trend: Array<{ month: string; netGmv: number }>;
};

export type GmvSourceState = "live" | "historical" | "not_connected";

export type GmvSourceStatus = {
  sellerId: string;
  state: GmvSourceState;
  mode: "dynamodb_stream" | "server_outbox" | "source_snapshot" | "historical_import" | "none";
  lastSyncedAt: string | null;
};

export type GmvDashboardSnapshot = {
  summary: GmvSummary;
  sources: GmvSourceStatus[];
  refreshedAt: string;
};

export type GmvSourceSnapshot = {
  currency?: GmvCurrency;
  sellerId: string;
  merchantName: string;
  netGmv: number;
  monthGmv: number;
  todayGmv: number;
  paidOrders: number;
  paidOrdersMonth: number;
  pendingOrders: number;
  averageOrderValue: number;
  month: string;
  fetchedAt: string;
};

export type GmvMerchantIdentity = {
  sellerId: string;
  merchantName: string;
};

export type BlueSequoiaOrderProjection = {
  id?: unknown;
  status?: unknown;
  total?: unknown;
  totalMinor?: unknown;
  currency?: unknown;
  updatedAt?: unknown;
  paidAt?: unknown;
  createdAt?: unknown;
};

function nonNegativeInteger(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`invalid_${field}`);
  return number;
}

export function parseMerchantGmvSnapshot(
  payload: Record<string, unknown>,
  identity: { sellerId: string; merchantName: string; fetchedAt: string },
): GmvSourceSnapshot {
  if (!Number.isFinite(Date.parse(identity.fetchedAt))) throw new Error("invalid_fetched_at");
  if(payload.currency !== undefined && !["JPY","CNY"].includes(String(payload.currency))) throw new Error("GMV_CURRENCY_UNSUPPORTED");
  return {
    ...identity,
    currency: (payload.currency ?? "JPY") as GmvCurrency,
    netGmv: nonNegativeInteger(payload.gmv_total, "gmv_total"),
    monthGmv: nonNegativeInteger(payload.gmv_month, "gmv_month"),
    todayGmv: nonNegativeInteger(payload.gmv_today, "gmv_today"),
    paidOrders: nonNegativeInteger(payload.paid_orders, "paid_orders"),
    paidOrdersMonth: nonNegativeInteger(payload.paid_orders_month, "paid_orders_month"),
    pendingOrders: nonNegativeInteger(payload.pending_orders, "pending_orders"),
    averageOrderValue: nonNegativeInteger(payload.avg_order_value, "avg_order_value"),
    month: identity.fetchedAt.slice(0, 7),
  };
}

export function mergeGmvSourceSnapshots(
  summary: GmvSummary,
  snapshots: GmvSourceSnapshot[],
): GmvSummary {
  if (!snapshots.length) return summary;
  snapshots = snapshots.filter(snapshot => (snapshot.currency ?? "JPY") === (summary.currency ?? "JPY"));
  const merchants = new Map(summary.merchants.map((merchant) => [merchant.sellerId, merchant]));
  let netGmv = summary.netGmv;
  let grossPaid = summary.grossPaid;
  let paidOrders = summary.paidOrders;
  for (const snapshot of snapshots) {
    const previous = merchants.get(snapshot.sellerId);
    netGmv += snapshot.netGmv - (previous?.netGmv ?? 0);
    grossPaid += snapshot.netGmv - (previous?.netGmv ?? 0);
    paidOrders += snapshot.paidOrders - (previous?.paidOrders ?? 0);
    merchants.set(snapshot.sellerId, {
      sellerId: snapshot.sellerId,
      merchantName: snapshot.merchantName,
      netGmv: snapshot.netGmv,
      paidOrders: snapshot.paidOrders,
    });
  }
  return {
    ...summary,
    grossPaid,
    netGmv,
    paidOrders,
    merchants: [...merchants.values()].sort((left, right) => right.netGmv - left.netGmv),
  };
}

export function blueSequoiaOrderToGmvInput(order: BlueSequoiaOrderProjection) {
  const orderId = String(order.id ?? "").trim();
  const status = String(order.status ?? "");
  const currency = String(order.currency ?? "");
  const amount = Number(order.total ?? order.totalMinor ?? 0);
  if (!orderId || !["paid", "refunded"].includes(status)) return null;
  if (currency !== "JPY" || !Number.isSafeInteger(amount) || amount <= 0) return null;
  if (status === "paid" && amount < MINIMUM_REAL_GMV_JPY) return null;

  const occurredAt = String(order.paidAt ?? order.updatedAt ?? order.createdAt ?? "");
  if (!Number.isFinite(Date.parse(occurredAt))) return null;
  return {
    projectId: "bluesequia-store",
    sellerId: "bluesequia",
    merchantName: "bluesequia株式会社",
    eventType: status === "paid" ? ("PAYMENT_CAPTURED" as const) : ("REFUND_COMPLETED" as const),
    amount,
    currency: "JPY" as const,
    occurredAt,
    orderId,
    // Keep the same idempotency key used by the DynamoDB Stream listener.
    providerEventId: orderId,
    sourceSystem: "bluesequia-dynamodb",
  };
}

export function summarizeGmv(
  events: GmvEvent[],
  merchantRoster: GmvMerchantIdentity[] = [],
): GmvSummary {
  const currencies = [...new Set(events.map(event => event.currency))];
  if (currencies.length > 1 || currencies.some(currency => !["JPY", "CNY"].includes(currency))) throw new Error("GMV_MIXED_OR_UNSUPPORTED_CURRENCY");
  const currency = (currencies[0] ?? "JPY") as GmvCurrency;
  const merchantMap = new Map<string, GmvSummary["merchants"][number]>();
  const trendMap = new Map<string, number>();
  let grossPaid = 0;
  let refunds = 0;
  let paidOrders = 0;

  for (const merchant of merchantRoster) {
    merchantMap.set(merchant.sellerId, {
      sellerId: merchant.sellerId,
      merchantName: merchant.merchantName,
      netGmv: 0,
      paidOrders: 0,
    });
  }

  for (const event of events) {
    if (
      event.eventType === "PAYMENT_CAPTURED" &&
      event.currency === "JPY" &&
      event.amount < MINIMUM_REAL_GMV_JPY
    ) {
      continue;
    }
    const signedAmount = event.eventType === "PAYMENT_CAPTURED" ? event.amount : -event.amount;
    if (event.eventType === "PAYMENT_CAPTURED") {
      grossPaid += event.amount;
      paidOrders += 1;
    } else {
      refunds += event.amount;
    }

    const merchant = merchantMap.get(event.sellerId) ?? {
      sellerId: event.sellerId,
      merchantName: event.merchantName,
      netGmv: 0,
      paidOrders: 0,
    };
    merchant.netGmv += signedAmount;
    if (event.eventType === "PAYMENT_CAPTURED") merchant.paidOrders += 1;
    merchantMap.set(event.sellerId, merchant);

    const month = event.occurredAt.slice(0, 7);
    trendMap.set(month, (trendMap.get(month) ?? 0) + signedAmount);
  }

  return {
    currency,
    grossPaid,
    refunds,
    netGmv: grossPaid - refunds,
    paidOrders,
    merchants: [...merchantMap.values()].sort((a, b) => b.netGmv - a.netGmv),
    trend: [...trendMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, netGmv]) => ({ month, netGmv })),
  };
}

export function buildGmvSourceStatuses(
  events: GmvEvent[],
  merchantRoster: GmvMerchantIdentity[],
  snapshots: GmvSourceSnapshot[] = [],
): GmvSourceStatus[] {
  const latestBySeller = new Map<string, string>();
  for (const event of events) {
    const current = latestBySeller.get(event.sellerId);
    if (!current || event.occurredAt > current)
      latestBySeller.set(event.sellerId, event.occurredAt);
  }
  const snapshotsBySeller = new Map(snapshots.map((snapshot) => [snapshot.sellerId, snapshot]));

  return merchantRoster.map((merchant) => {
    const sourceSnapshot = snapshotsBySeller.get(merchant.sellerId);
    if (sourceSnapshot) {
      return {
        sellerId: merchant.sellerId,
        state: "live",
        mode: "source_snapshot",
        lastSyncedAt: sourceSnapshot.fetchedAt,
      };
    }
    const lastSyncedAt = latestBySeller.get(merchant.sellerId) ?? null;
    if (merchant.sellerId === "bluesequia") {
      return { sellerId: merchant.sellerId, state: "live", mode: "dynamodb_stream", lastSyncedAt };
    }
    if (merchant.sellerId === "medinance") {
      return { sellerId: merchant.sellerId, state: "live", mode: "server_outbox", lastSyncedAt };
    }
    if (lastSyncedAt) {
      return {
        sellerId: merchant.sellerId,
        state: "historical",
        mode: "historical_import",
        lastSyncedAt,
      };
    }
    return {
      sellerId: merchant.sellerId,
      state: "not_connected",
      mode: "none",
      lastSyncedAt: null,
    };
  });
}


export function summarizeGmvCurrencies(events: GmvEvent[], roster: GmvMerchantIdentity[] = [], snapshots: GmvSourceSnapshot[] = []): GmvSummary[] {
 if(events.some(event=>!["JPY","CNY"].includes(event.currency))) throw new Error("GMV_CURRENCY_UNSUPPORTED");
 return (["JPY","CNY"] as const).map(currency=>mergeGmvSourceSnapshots({...summarizeGmv(events.filter(event=>event.currency===currency),roster),currency},snapshots));
}
