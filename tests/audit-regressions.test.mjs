import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettlementModule} from '../packages/buyna-commerce-settlement-core/src/index.mjs';
import {evaluateProviderStatus} from '../skills/buyai-globepay-payment/scripts/globepay-core.mjs';
import * as ordersCore from '../packages/buyna-order-core/src/order-core.mjs';
import {createCheckoutFlow} from '../packages/buyna-checkout-flow-core/src/index.mjs';
import {createMerchantDataCore} from '../packages/buyna-postgres-merchant-core/src/merchant-core.mjs';
import {createNodePostgresAdapter} from '../packages/buyna-postgres-merchant-core/adapters/node-postgres.mjs';
import {createMerchantCatalogService} from '../packages/buyna-merchant-catalog-core/src/catalog-core.mjs';
import {createMerchantFileService} from '../packages/buyna-merchant-file-core/src/file-core.mjs';
import {createCommerceReadModel} from '../packages/buyna-commerce-read-model-core/src/index.mjs';
import {createIntegrationReceipt,requireIntegrationReceipt} from '../packages/buyna-integration-receipt-core/src/index.mjs';
import {createCouponModule} from '../packages/buyna-coupon-core/src/index.mjs';
const scope={projectId:'audit_project',sellerId:'audit_seller'};
const checkout={items:[{productId:'p1',name:'Product',quantity:1,unitPrice:100,lineTotal:100}],subtotal:100,shipping:0,discount:0,tax:0,total:100,currency:'JPY'};
const submission=[{key:'name',label:'Name',value:'Buyer',type:'text'}];

test('late verified payment records money and fulfillment review without recommitting released reservations',async()=>{
 for(const status of ['expired','failed']){
  const order={...scope,id:'o1',status,amount:100,currency:'JPY'};const calls=[];let claimed=false;
  const tx={claimEvent:async()=>{if(claimed)return false;claimed=true;return true},getOrderForSettlement:async()=>({...order}),upsertPayment:async()=>calls.push('payment'),setOrderStatus:async({status})=>{order.status=status},applyInventoryOnce:async()=>assert.fail('released reservation cannot be committed'),applyCouponOnce:async()=>assert.fail('released coupon cannot be redeemed'),reconcileLatePayment:async()=>({status:'review_required',reason:'STOCK_UNAVAILABLE'}),recordFulfillmentReview:async input=>calls.push(input.reason),upsertPaidCustomer:async()=>{},appendGmvOutbox:async()=>calls.push('gmv')};
  const core=createSettlementModule({capabilities:{coupon:true},provider:{verify:async()=>({...scope,trusted:true,source:'provider_query',eventId:'e1',provider:'gp',orderId:'o1',amount:100,currency:'JPY',status:'paid'})},store:{transaction:work=>work(tx)}});
  const result=await core.settle(scope);assert.equal(order.status,'paid');assert.equal(result.fulfillmentStatus,'review_required');assert.deepEqual(calls,['payment','STOCK_UNAVAILABLE','gmv']);assert.equal((await core.settle(scope)).status,'duplicate');
 }
});

test('partial refunds preserve cumulative amount and reject impossible or missing amounts',()=>{
 const input={currentStatus:'paid',resultCode:'PARTIAL_REFUND',eventType:'query',paidAmount:100,refundedAmount:0,refundAmount:40};
 assert.equal(evaluateProviderStatus(input).nextStatus,'partially_refunded');
 assert.equal(evaluateProviderStatus({...input,currentStatus:'partially_refunded',resultCode:'FULL_REFUND',refundedAmount:40,refundAmount:100}).nextStatus,'refunded');
 assert.equal(evaluateProviderStatus({...input,refundAmount:101}).status,'blocked');
 assert.equal(evaluateProviderStatus({...input,refundAmount:undefined}).status,'blocked');
 assert.equal(evaluateProviderStatus({...input,currentStatus:'partially_refunded',refundedAmount:40,refundAmount:40}).effects.length,0);
 assert.equal(evaluateProviderStatus({...input,currentStatus:'partially_refunded',resultCode:'PAY_SUCCESS'}).nextStatus,'partially_refunded');
});

function orderFixture(){
 const ledger=new Map();const writes=[];let next=0;let queue=Promise.resolve();
 const store={transaction(work){const run=queue.then(async()=>{const saved=new Map(ledger);const before=writes.length;try{return await work({claimIdempotency:async({key})=>ledger.has(key)?{claimed:false,result:ledger.get(key)}:(ledger.set(key,null),{claimed:true}),completeIdempotency:async({key,result})=>ledger.set(key,result),createPendingOrder:async({order})=>{writes.push(order);return order}})}catch(e){ledger.clear();for(const [k,v] of saved)ledger.set(k,v);writes.length=before;throw e}});queue=run.catch(()=>{});return run}};
 return{service:ordersCore.createOrderService({...scope,store,idGenerator:()=>`order-${++next}`}),writes};
}
test('concurrent order retries share a durable key and reject changed request contents',async()=>{
 const {service,writes}=orderFixture();const input={idempotencyKey:'same',checkout,submission,paymentMethod:'card'};
 const [a,b]=await Promise.all([service.createPendingOrder(input),service.createPendingOrder(input)]);
 assert.equal(a.id,b.id);assert.equal(writes.length,1);
 await assert.rejects(service.createPendingOrder({...input,paymentMethod:'wechat'}),/ORDER_IDEMPOTENCY_CONFLICT/);
 await assert.rejects(service.createPendingOrder({...input,idempotencyKey:undefined}),/MISSING_IDEMPOTENCY_KEY/);
});
test('real checkout and order modules compose through the shared mapping adapter',async()=>{
 let review;const {service,writes}=orderFixture();
 const orders=ordersCore.createCheckoutOrderAdapter({orders:service,mapSubmission:fields=>[{key:'name',label:'Name',value:fields.name,type:'text'}]});
 const flow=createCheckoutFlow({...scope,orders,cart:{createCheckoutSnapshot:async()=>checkout},reviewState:{create:async input=>{review=input.review},get:async()=>review,update:async({patch})=>Object.assign(review,patch)},submissions:{acquire:async()=>({status:'acquired',attemptToken:'attempt1'}),complete:async()=>{},release:async()=>{}},policy:{paymentMethods:['card'],minimumFields:['name']}});
 const created=await flow.createReview({paymentMethod:'card',fields:{name:'Buyer'}});const result=await flow.submit({reviewToken:created.reviewToken});
 assert.equal(result.order.id,writes[0].id);assert.equal(writes[0].total,result.providerRequest.amount);assert.equal(writes[0].submission[0].value,'Buyer');
});

test('product clearing and no-op edits compose with the PostgreSQL adapter',async()=>{
 const record={id:'p1',status:'draft',name:'Product',description:'Old',short_description:'Old short'};const updates=[];
 const connection={query:async(sql,values)=>{if(sql.startsWith('SELECT'))return{rows:[{...record}]};if(sql.startsWith('UPDATE')){updates.push(sql);const columns=[...sql.matchAll(/"(description|short_description)" = \$(\d+)/g)];for(const [,key,index] of columns)record[key]=values[Number(index)-1];return{rows:[{...record}]}}return{rows:[]}},release(){}};
 const adapter=createNodePostgresAdapter({pool:{query:connection.query,connect:async()=>connection},entities:{products:{table:'products',write:{description:'description',short_description:'short_description'}}}});
 const service=createMerchantCatalogService({dataCore:createMerchantDataCore({...scope,adapter})});
 await service.updateProduct({productId:'p1',description:'',shortDescription:''});assert.equal(record.description,'');assert.equal(record.short_description,'');
 await service.updateProduct({productId:'p1'});assert.equal(updates.length,1);
});
test('self replacement never deletes the active object and aliased object keys are rejected',async()=>{
 const key='projects/audit_project/sellers/audit_seller/products/p1/original/f1.png';let deletes=0,replacements=0;
 const service=createMerchantFileService({...scope,storage:{deleteObject:async()=>deletes++},metadata:{transaction:work=>work({getFileById:async({fileId})=>({id:fileId,objectKey:key,status:'confirmed'}),replaceFile:async()=>{replacements++;assert.fail('must not replace')}}),markObjectDeleted:async()=>{},markDeletionFailed:async()=>{}}});
 await service.replaceObject({oldFileId:'f1',newFileId:'f1'});await assert.rejects(service.replaceObject({oldFileId:'f1',newFileId:'f2'}),/REPLACEMENT_OBJECT_KEY_CONFLICT/);assert.equal(deletes,0);assert.equal(replacements,0);
});
test('failed and expired recent orders remain visible without breaking overview',async()=>{
 const page=items=>({items,nextCursor:null});const recent=['failed','expired'].map((status,i)=>({...scope,orderId:`o${i}`,status,payableAmount:100,capturedAmount:0,refundedAmount:0,currency:'JPY',createdAt:'2026-09-01T01:00:00.000Z'}));
 const source={listCurrentPendingPage:async()=>page([]),listSettlementFactPage:async()=>page([]),listLowStockCandidatePage:async()=>page([]),listRecentOrderCandidatePage:async()=>page(recent)};
 const result=await createCommerceReadModel({...scope,source}).getOverview({from:'2026-09-01T00:00:00.000Z',to:'2026-09-02T00:00:00.000Z',timeZone:'Asia/Tokyo'});assert.equal(result.recentOrders.length,2);assert.equal(result.metrics.grossAmount,0);
});
test('invalid or missing receipt dates cannot bypass expiry checks',()=>{
 const input={...scope,resourceEvidenceId:'r1',foundationChecks:{identity:'PASS',database:'PASS',storage:'PASS',authorization:'PASS'},now:'2026-09-01T00:00:00Z',expiresAt:'2026-09-02T00:00:00Z'};
 assert.throws(()=>createIntegrationReceipt({...input,expiresAt:'not-a-date'}),/INTEGRATION_RECEIPT_TIME_INVALID/);
 const receipt=createIntegrationReceipt(input);
 for(const expiresAt of [undefined,'not-a-date'])assert.equal(requireIntegrationReceipt({receipt:{...receipt,expiresAt},resourceEvidenceId:'r1',now:input.now}).status,'blocked');
 assert.equal(requireIntegrationReceipt({receipt,resourceEvidenceId:'r1',now:input.expiresAt}).status,'blocked');
 assert.equal(requireIntegrationReceipt({receipt,resourceEvidenceId:'r1',now:'invalid'}).status,'blocked');
});
test('paused coupons can resume while expired policy still cannot activate',async()=>{
 let coupon;let now=new Date('2026-09-01T00:00:00Z');const tx={claimCouponEvent:async()=>({claimed:true,complete:async()=>{}}),createCoupon:async record=>(coupon=structuredClone(record)),getCouponForUpdate:async()=>structuredClone(coupon)};
 const core=createCouponModule({...scope,clock:()=>now,store:{transaction:work=>work(tx)}});
 await core.createDraft({eventId:'c',couponId:'c1',code:'SAVE',discount:{type:'fixed',amount:10},validUntil:'2026-09-02T00:00:00Z'});
 await core.activate({eventId:'a',couponId:'c1'});await core.pause({eventId:'p',couponId:'c1'});await core.activate({eventId:'a2',couponId:'c1'});assert.equal(coupon.state,'active');
 await core.pause({eventId:'p2',couponId:'c1'});now=new Date('2026-09-03T00:00:00Z');await assert.rejects(core.activate({eventId:'a3',couponId:'c1'}));
});
