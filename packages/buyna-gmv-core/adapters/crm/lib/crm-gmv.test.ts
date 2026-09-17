import assert from "node:assert/strict";
import {
  blueSequoiaOrderToGmvInput,
  buildGmvSourceStatuses,
  mergeGmvSourceSnapshots,
  parseMerchantGmvSnapshot,
  summarizeGmv,
  type GmvEvent,
} from "./crm-gmv.ts";

const base = {
  projectId: "shop-a",
  sellerId: "seller-a",
  merchantName: "商家 A",
  currency: "JPY",
  orderId: "order-1",
  sourceSystem: "globepay",
};
const events: GmvEvent[] = [
  {
    ...base,
    id: "1",
    eventType: "PAYMENT_CAPTURED",
    amount: 1000,
    occurredAt: "2026-08-01T00:00:00.000Z",
    providerEventId: "pay-1",
  },
  {
    ...base,
    id: "2",
    eventType: "REFUND_COMPLETED",
    amount: 200,
    occurredAt: "2026-08-02T00:00:00.000Z",
    providerEventId: "refund-1",
  },
];
const summary = summarizeGmv(events);
assert.equal(summary.grossPaid, 1000);
assert.equal(summary.refunds, 200);
assert.equal(summary.netGmv, 800);
assert.equal(summary.paidOrders, 1);
assert.equal(summary.merchants[0].netGmv, 800);
assert.deepEqual(summary.trend, [{ month: "2026-08", netGmv: 800 }]);

const testOrderSummary = summarizeGmv([
  {
    ...base,
    id: "test-order",
    eventType: "PAYMENT_CAPTURED",
    amount: 99,
    occurredAt: "2026-08-03T00:00:00.000Z",
    providerEventId: "test-pay-99",
  },
]);
assert.equal(testOrderSummary.grossPaid,99);
assert.equal(testOrderSummary.netGmv,99);
assert.equal(testOrderSummary.paidOrders,1);
assert.throws(()=>summarizeGmv([...events,{...events[0],id:'cny',currency:'CNY'}]),/CURRENCY/);
const cnySummary=summarizeGmv(events.map(event=>({...event,currency:'CNY'})));
assert.equal(cnySummary.currency,'CNY');assert.equal(cnySummary.netGmv,800);

const rosterSummary = summarizeGmv(events, [
  { sellerId: "seller-a", merchantName: "商家 A" },
  { sellerId: "seller-b", merchantName: "商家 B" },
]);
assert.equal(rosterSummary.merchants.length, 2);
assert.deepEqual(rosterSummary.merchants[1], {
  sellerId: "seller-b",
  merchantName: "商家 B",
  netGmv: 0,
  paidOrders: 0,
});
const sourceStatuses = buildGmvSourceStatuses(events, [
  { sellerId: "bluesequia", merchantName: "BlueSequoia" },
  { sellerId: "medinance", merchantName: "MEDINANCE" },
  { sellerId: "seller-a", merchantName: "Merchant A" },
  { sellerId: "seller-b", merchantName: "Merchant B" },
]);
assert.equal(sourceStatuses[0].state, "live");
assert.equal(sourceStatuses[0].mode, "dynamodb_stream");
assert.equal(sourceStatuses[1].state, "live");
assert.equal(sourceStatuses[1].mode, "server_outbox");
assert.equal(sourceStatuses[2].state, "historical");
assert.equal(sourceStatuses[3].state, "not_connected");

assert.deepEqual(
  blueSequoiaOrderToGmvInput({
    id: "order-paid-1",
    status: "paid",
    total: 20_000,
    currency: "JPY",
    paidAt: "2026-08-17T00:00:00.000Z",
  }),
  {
    projectId: "bluesequia-store",
    sellerId: "bluesequia",
    merchantName: "bluesequia株式会社",
    eventType: "PAYMENT_CAPTURED",
    amount: 20_000,
    currency: "JPY",
    occurredAt: "2026-08-17T00:00:00.000Z",
    orderId: "order-paid-1",
    providerEventId: "order-paid-1",
    sourceSystem: "bluesequia-dynamodb",
  },
);
assert.equal(
  blueSequoiaOrderToGmvInput({
    id: "test-order",
    status: "paid",
    total: 1,
    currency: "JPY",
    updatedAt: "2026-08-17T00:00:00.000Z",
  })?.amount,
  1,
);

const asukaSnapshot = parseMerchantGmvSnapshot(
  {
    gmv_total: 32_980_140,
    gmv_month: 1_234_500,
    gmv_today: 45_600,
    paid_orders: 849,
    paid_orders_month: 31,
    pending_orders: 4,
    avg_order_value: 38_846,
  },
  {
    sellerId: "asuka",
    merchantName: "アスカ株式会社",
    fetchedAt: "2026-09-01T01:00:00.000Z",
  },
);
assert.equal(asukaSnapshot.netGmv, 32_980_140);
assert.equal(asukaSnapshot.paidOrders, 849);
assert.equal(asukaSnapshot.month, "2026-09");

const snapshotSummary = mergeGmvSourceSnapshots(
  summarizeGmv([
    ...events,
    {
      ...base,
      id: "asuka-old",
      sellerId: "asuka",
      merchantName: "アスカ株式会社",
      eventType: "PAYMENT_CAPTURED",
      amount: 20_025_030,
      occurredAt: "2026-08-12T00:00:00.000Z",
      orderId: "asuka-old",
      providerEventId: "asuka-old",
    },
  ]),
  [asukaSnapshot],
);
assert.equal(snapshotSummary.netGmv, 32_980_940);
assert.equal(snapshotSummary.paidOrders, 850);
assert.equal(snapshotSummary.merchants.find((item) => item.sellerId === "asuka")?.netGmv, 32_980_140);
const snapshotStatuses = buildGmvSourceStatuses(events, [
  { sellerId: "asuka", merchantName: "アスカ株式会社" },
], [asukaSnapshot]);
assert.equal(snapshotStatuses[0].state, "live");
assert.equal(snapshotStatuses[0].mode, "source_snapshot");
assert.equal(snapshotStatuses[0].lastSyncedAt, "2026-09-01T01:00:00.000Z");
console.log("CRM GMV rules verified");
