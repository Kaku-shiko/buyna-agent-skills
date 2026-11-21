import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createBackend,paymentAvailability,setStock,backendErrorResponse,createBackendHandlers,runExpiryBatch} from '../src/index.mjs';
import {createPostgresRecords,migrateBackend,rollbackEmptyBackend} from '../src/postgres.mjs';

const {PGlite}=await import(process.env.BUYNA_TEST_PGLITE ? pathToFileURL(process.env.BUYNA_TEST_PGLITE).href : '@electric-sql/pglite');
const scope={projectId:'test',sellerId:'seller'};
const ready={readStatus:'ok',configured:true,credentialVersion:'v1',validatedVersion:'v1',validationStatus:'passed'};
const input={customerRef:'guest1',idempotencyKey:'request1',items:[{productId:'p',quantity:1}],paymentMethod:'card',submission:[{key:'name',label:'Name',value:'Customer'}]};

async function fixture(t) {
  const db=new PGlite(); t.after(()=>db.close());
  // PGlite is a single session. Pool acquisition is queued for transaction tests.
  let pending=Promise.resolve();
  const query=(sql,params)=>params?db.query(sql,params):db.exec(sql).then(results=>results.at(-1)??{rows:[]});
  const pool={query,async connect(){let release;const next=new Promise(resolve=>release=resolve);const previous=pending;pending=next;await previous;return {query,release};}};
  await db.exec('CREATE SCHEMA merchant');
  await migrateBackend({pool,schema:'merchant'});
  const records=createPostgresRecords({pool,schema:'merchant',...scope});
  await setStock(records,{productId:'p',skuId:'p',onHandQuantity:1});
  let now=new Date('2026-10-19T00:00:00Z'), sequence=0;
  const provider={verify:async input=>input.event};
  const options={records,clock:()=>now,idGenerator:()=>`order${++sequence}`,
    readPaymentConfig:async()=>ready,
    quote:async({items})=>({items:items.map(item=>({...item,name:'Product',unitPrice:100,lineTotal:item.quantity*100})),subtotal:items.reduce((n,i)=>n+i.quantity*100,0),total:items.reduce((n,i)=>n+i.quantity*100,0),currency:'JPY'}),
    provider};
  const backend=createBackend(options);
  const event=(order,status='paid',extra={})=>({...scope,trusted:true,source:'provider_query',eventId:`event-${status}`,provider:'fixture',orderId:order.id,amount:100,currency:'JPY',status,...extra});
  return {db,pool,records,backend,provider,event,factory:records=>createBackend({...options,records}),setNow:value=>now=new Date(value)};
}

test('payment state distinguishes unknown, unconfigured, disabled and a previously verified connection',()=>{
  assert.equal(paymentAvailability().state,'unknown');
  assert.equal(paymentAvailability({readStatus:'ok',configured:false}).state,'unconfigured');
  assert.equal(paymentAvailability({...ready,disabled:true}).state,'disabled');
  assert.equal(paymentAvailability({...ready,credentialVersion:'v2'}).state,'needs_validation');
  assert.equal(paymentAvailability(ready).canPay,true);
});

test('migration is repeatable, rejects drift and missing schemas without creating a database',async t=>{
  const f=await fixture(t);
  assert.equal((await migrateBackend({pool:f.pool,schema:'merchant'})).applied,false);
  await assert.rejects(migrateBackend({pool:f.pool,schema:'missing'}),/REGISTERED_SCHEMA_REQUIRED/);
  await f.db.exec("UPDATE merchant.buyna_backend_migrations SET digest='changed'");
  await assert.rejects(migrateBackend({pool:f.pool,schema:'merchant'}),/MIGRATION_DIGEST_MISMATCH/);
});

test('last unit is reserved atomically, retries reuse the order and changed retries are rejected',async t=>{
  const f=await fixture(t);
  const outcomes=await Promise.allSettled([f.backend.createOrder(input),f.backend.createOrder({...input,customerRef:'guest2'})]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.match(outcomes.find(r=>r.status==='rejected').reason.message,/INVENTORY_INSUFFICIENT/);
  const order=outcomes[0].value;
  assert.equal((await f.backend.createOrder(input)).id,order.id);
  assert.equal((await f.backend.createOrder({...input,idempotencyKey:'another-click'})).id,order.id);
  await assert.rejects(f.backend.createOrder({...input,paymentMethod:'wechat'}),/IDEMPOTENCY_CONFLICT/);
  await assert.rejects(f.backend.orderStatus({customerRef:'guest2',orderId:order.id}),/ORDER_NOT_FOUND/);
  const other=createPostgresRecords({pool:f.pool,schema:'merchant',projectId:'other',sellerId:'seller'});
  assert.equal(await other.get('order',order.id),null);
});

test('ambiguous payment creation queries the same order rather than submitting twice',async t=>{
  const f=await fixture(t),order=await f.backend.createOrder(input);
  let creates=0,queries=0;
  f.provider.create=async()=>{creates++;throw Error('timeout');};
  f.provider.query=async({order})=>{queries++;return {orderId:order.id,amount:order.total,currency:order.currency};};
  await assert.rejects(f.backend.startPayment({customerRef:'guest1',orderId:order.id}),/timeout/);
  const retry=await f.backend.startPayment({customerRef:'guest1',orderId:order.id});
  assert.equal(creates,1);assert.equal(queries,1);assert.equal(retry.state,'processing');
  assert.equal((await f.records.get('order',order.id)).status,'pending_payment');
});

test('rollback refuses populated tables and removes only an empty foundation installation',async t=>{
  const f=await fixture(t);
  await assert.rejects(rollbackEmptyBackend({pool:f.pool,schema:'merchant'}),/DATA_PRESERVING/);
  await f.db.exec('CREATE SCHEMA empty_merchant');
  await migrateBackend({pool:f.pool,schema:'empty_merchant'});
  await rollbackEmptyBackend({pool:f.pool,schema:'empty_merchant'});
  assert.equal((await f.db.query("SELECT 1 FROM pg_namespace WHERE nspname='empty_merchant'")).rows.length,1);
});

test('route handlers ignore caller identity and pricing; public errors do not leak details',async()=>{
  let received;
  const handlers=createBackendHandlers({resolveRequest:async()=>({customerRef:'server-guest',backend:{
    createOrder:async input=>{received=input;return {id:'o'};},orderStatus:async()=>({orderId:'o',status:'pending_payment'})}})});
  await handlers.createOrder({body:{...input,customerRef:'attacker',projectId:'other',total:1}});
  assert.equal(received.customerRef,'server-guest');assert.equal(received.total,undefined);assert.equal(received.projectId,undefined);
  assert.equal(backendErrorResponse(Error('SQL secret=private')).body.error.code,'operation_failed');
  assert.equal(backendErrorResponse(Error('INVENTORY_INSUFFICIENT')).status,409);
});

test('payment verification errors roll back; duplicate notify and partial/full refunds are reconciled',async t=>{
  const f=await fixture(t),order=await f.backend.createOrder(input);
  await assert.rejects(f.backend.settle({event:f.event(order,'paid',{amount:101})}),/AMOUNT_MISMATCH/);
  assert.equal((await f.records.get('order',order.id)).status,'pending_payment');
  await f.backend.settle({event:f.event(order)});
  assert.equal((await f.backend.settle({event:f.event(order)})).status,'duplicate');
  assert.equal((await f.backend.createOrder(input)).status,'paid');
  await f.backend.settle({event:f.event(order,'partially_refunded',{refundAmount:30})});
  assert.equal((await f.records.get('order',order.id)).status,'partially_refunded');
  await f.backend.settle({event:f.event(order,'refunded',{refundAmount:100})});
  const saved=await f.records.get('order',order.id);
  assert.equal(saved.refundedAmount,100);
  assert.equal((await f.records.list('outbox')).length,4);
  assert.equal((await f.records.get('stock',JSON.stringify(['p','p']))).onHandQuantity,0);
});

test('expiry releases inventory; late verified payment records money and requests fulfillment review',async t=>{
  const f=await fixture(t),order=await f.backend.createOrder(input);
  assert.equal((await f.backend.expireOrder(order.id)).changed,false);
  f.setNow('2026-10-19T00:20:00Z');
  assert.equal((await f.backend.expireOrder(order.id)).changed,true);
  await f.backend.createOrder({...input,customerRef:'guest2'});
  const result=await f.backend.settle({event:f.event(order)});
  assert.equal(result.fulfillmentStatus,'review_required');
  const saved=await f.records.get('order',order.id);
  assert.equal(saved.status,'paid');assert.equal(saved.paidAmount,100);
  const stock=await f.records.get('stock',JSON.stringify(['p','p']));
  assert.equal(stock.reservedQuantity,1);assert.equal(stock.onHandQuantity,1);
});

test('failing a later item rolls back earlier inventory reservations and order writes',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.backend.createOrder({...input,items:[...input.items,{productId:'missing',quantity:1}]}),/INVENTORY_INSUFFICIENT/);
  assert.equal((await f.records.list('order')).length,0);
  assert.equal((await f.records.get('stock',JSON.stringify(['p','p']))).reservedQuantity,0);
});


test('expiry worker persists its cursor and releases holds through the fixed transaction',async t=>{
  const f=await fixture(t),order=await f.backend.createOrder(input);
  f.setNow('2026-10-19T00:30:00Z');
  const result=await runExpiryBatch({records:f.records,backend:f.factory,limit:1});
  assert.equal(result.changed,1);
  assert.equal((await f.records.get('order',order.id)).status,'expired');
  const next=await runExpiryBatch({records:f.records,backend:f.factory,limit:1});
  assert.equal(next.changed,0);assert.equal(next.next,null);
});
