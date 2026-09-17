import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentCaptured,refundCompleted,summarizeGmv,summarizeGmvByCurrency,decimalToMinor,createGmvClient,sendPendingGmvEvents} from '../src/gmv-core.mjs';
const input={identity:{projectId:'p',sellerId:'s',merchantName:'Shop'},orderId:'o',providerEventId:'e',occurredAt:'2026-09-17T00:00:00Z',amount:9990,currency:'CNY'};
test('explicit payment currency, never display currency or silent JPY',()=>{assert.equal(paymentCaptured(input).currency,'CNY');assert.throws(()=>paymentCaptured({...input,currency:undefined}));assert.throws(()=>paymentCaptured({...input,currency:'USD'}));assert.throws(()=>paymentCaptured({...input,amount:99.9}));});
test('exact decimal conversion with scale and overflow rejection',()=>{assert.equal(decimalToMinor('99.90','CNY'),9990);assert.equal(decimalToMinor('0.01','CNY'),1);assert.equal(decimalToMinor('100','JPY'),100);for(const [v,c] of [['1.001','CNY'],['1.1','JPY'],['9007199254740992','JPY'],['-1','CNY']])assert.throws(()=>decimalToMinor(v,c));});
test('no mixed currency total',()=>{const c=paymentCaptured(input),j=paymentCaptured({...input,currency:'JPY',amount:100});assert.throws(()=>summarizeGmv([c,j]),/MIXED_CURRENCY/);assert.deepEqual(summarizeGmvByCurrency([c,j]).map(x=>[x.currency,x.netGmv]),[['CNY',9990],['JPY',100]]);assert.equal(summarizeGmv([j]).netGmv,100);});
test('refund matches original paid currency, identity and remaining amount',()=>{const originalPayment=paymentCaptured(input);const refund={...input,providerEventId:'refund',amount:1990,originalPayment,completedRefundAmount:0};assert.equal(refundCompleted(refund).currency,'CNY');for(const patch of [{currency:'JPY'},{orderId:'other'},{completedRefundAmount:9000},{originalPayment:undefined}])assert.throws(()=>refundCompleted({...refund,...patch}));assert.equal(summarizeGmv([originalPayment,refundCompleted(refund)]).netGmv,8000);});
test('client preserves actual currency and minor amount on wire',async()=>{const client=createGmvClient({acceptedCurrencies:['JPY','CNY'],apiUrl:'https://crm.example/api/internal/gmv-events',auth:{clientId:'s',clientSecret:'fixture'},fetchImpl:async(_,request)=>{const data=JSON.parse(request.body);assert.equal(data.currency,'CNY');assert.equal(data.amount,9990);return Response.json({accepted:true,id:'x'});}});await client.send(paymentCaptured(input));});


test('legacy receiver rejects CNY before network and worker preserves pending event',async()=>{
 let calls=0;
 const client=createGmvClient({apiUrl:'https://crm.example/gmv',auth:{mode:'bearer',secret:'test'},fetchImpl:async()=>{calls++;}});
 await assert.rejects(()=>client.send(paymentCaptured(input)),/GMV_ENDPOINT_CURRENCY_UNSUPPORTED/);
  const failed=[];
 const results=await sendPendingGmvEvents({adapter:{listPending:async()=>[{id:'pending',event:paymentCaptured(input),retryCount:0}],markSent:async()=>assert.fail('must stay pending'),markFailed:async record=>failed.push(record)},client});
 assert.equal(results[0].status,'failed');
 assert.equal(failed[0].errorCode,'GMV_ENDPOINT_CURRENCY_UNSUPPORTED');
 assert.equal(calls,0);
});

