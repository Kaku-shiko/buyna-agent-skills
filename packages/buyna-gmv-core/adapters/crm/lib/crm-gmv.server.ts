import {createDynamoGmvLedger} from "./gmv-fixed/adapters/dynamodb.mjs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { GmvEventInput } from "./crm-gmv.contract";
import { MINIMUM_REAL_GMV_JPY, type GmvEvent, type GmvSourceSnapshot } from "./crm-gmv";
import { blueSequoiaOrderToGmvInput } from "./crm-gmv";

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || "ap-northeast-1" }),
  { marshallOptions: { removeUndefinedValues: true } },
);

function tableName() {
  return process.env.CRM_CUSTOMERS_TABLE?.trim() || "buyna-admin-crm-customers";
}

const ledger = createDynamoGmvLedger({client,tableName,GetCommand,ScanCommand,TransactWriteCommand});
export async function recordGmvEvent(input: GmvEventInput) {
  return ledger.append(input);
}

export async function listGmvEvents(): Promise<GmvEvent[]> {
  const events: GmvEvent[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName(),
        FilterExpression: "itemType = :itemType",
        ExpressionAttributeValues: { ":itemType": "gmv-event" },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    events.push(...((result.Items ?? []) as GmvEvent[]));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return events.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export async function saveGmvSourceSnapshot(snapshot: GmvSourceSnapshot) {
  await client.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        id: `gmv#source-snapshot#${snapshot.sellerId}`,
        itemType: "gmv-source-snapshot",
        ...snapshot,
      },
    }),
  );
  return snapshot;
}

export async function listGmvSourceSnapshots(): Promise<GmvSourceSnapshot[]> {
  const result = await client.send(
    new ScanCommand({
      TableName: tableName(),
      FilterExpression: "itemType = :itemType",
      ExpressionAttributeValues: { ":itemType": "gmv-source-snapshot" },
    }),
  );
  return (result.Items ?? []) as GmvSourceSnapshot[];
}

export async function syncExternalGmvSources() {
  const { fetchAsukaGmvSnapshot, triggerMedinanceGmvSync } = await import(
    "./crm-gmv-sources.server"
  );
  const [asuka, medinance] = await Promise.allSettled([
    fetchAsukaGmvSnapshot().then(saveGmvSourceSnapshot),
    triggerMedinanceGmvSync(),
  ]);
  const describe = (result: PromiseSettledResult<unknown>) =>
    result.status === "fulfilled"
      ? { ok: true, result: result.value }
      : { ok: false, error: result.reason instanceof Error ? result.reason.message : "sync_failed" };
  return { asuka: describe(asuka), medinance: describe(medinance) };
}

export async function syncBlueSequoiaGmvEvents() {
  const sourceTable =
    process.env.BLUESEQUOIA_ORDERS_TABLE?.trim() ||
    "bluesequia-store-production-CommerceDataTable-xmnktxbs";
  const orders: Array<Record<string, unknown>> = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(
      new ScanCommand({
        TableName: sourceTable,
        FilterExpression:
          "#entity = :order AND (#data.#status = :paid OR #data.#status = :refunded)",
        ExpressionAttributeNames: {
          "#entity": "entity",
          "#data": "data",
          "#status": "status",
          "#id": "id",
          "#total": "total",
          "#totalMinor": "totalMinor",
          "#currency": "currency",
          "#updatedAt": "updatedAt",
          "#paidAt": "paidAt",
          "#createdAt": "createdAt",
        },
        ExpressionAttributeValues: {
          ":order": "order",
          ":paid": "paid",
          ":refunded": "refunded",
        },
        ProjectionExpression:
          "#data.#id,#data.#status,#data.#total,#data.#totalMinor,#data.#currency,#data.#updatedAt,#data.#paidAt,#data.#createdAt",
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    orders.push(...(result.Items ?? []).map((item) => item.data as Record<string, unknown>));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  let synchronized = 0;
  for (const order of orders) {
    const event = blueSequoiaOrderToGmvInput(order);
    if (!event) continue;
    await recordGmvEvent(event);
    synchronized += 1;
  }
  return { scanned: orders.length, synchronized };
}
