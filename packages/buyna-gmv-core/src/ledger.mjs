import {createGmvEvent,gmvEventId} from './gmv-core.mjs';

const identityKeys=['projectId','sellerId','orderId','currency'];
export function sameGmvEvent(a,b){return ['projectId','sellerId','merchantName','orderId','eventType','currency','amount','providerEventId','sourceSystem','occurredAt'].every(k=>a[k]===b[k]);}

// The adapter commits the ledger revision and immutable event together with CAS.
// Legacy events must be read consistently before creating revision 1.
export function createGmvLedger({store}){
 return {async append(input){
  const event=createGmvEvent({...input,identity:input});
  const id=gmvEventId(event);
  for(let attempt=0;attempt<8;attempt++){
   const existing=await store.getEvent(id);
   if(existing){if(!sameGmvEvent(existing,event))throw new Error('GMV_EVENT_CONFLICT');return {accepted:true,duplicate:true,id};}
   const previous=await store.getOrderLedger(event);
   const history=previous?[]:await store.listLegacyOrderEvents(event);
   const captures=history.filter(x=>x.eventType==='PAYMENT_CAPTURED');
   if(captures.length>1)throw new Error('GMV_LEGACY_RECONCILIATION_REQUIRED');
   if(history.some(x=>identityKeys.some(k=>x[k]!==event[k])))throw new Error('GMV_REFUND_PAYMENT_MISMATCH');
   const paid=previous?.paidAmount??captures[0]?.amount??0;
   const refunded=previous?.refundedAmount??history.filter(x=>x.eventType==='REFUND_COMPLETED').reduce((sum,x)=>sum+x.amount,0);
   if(!Number.isSafeInteger(paid)||!Number.isSafeInteger(refunded)||paid<0||refunded<0||refunded>paid)throw new Error('GMV_LEGACY_RECONCILIATION_REQUIRED');
   if(previous&&identityKeys.some(k=>previous[k]!==event[k]))throw new Error('GMV_REFUND_PAYMENT_MISMATCH');
   if(event.eventType==='PAYMENT_CAPTURED'&&paid!==0)throw new Error('GMV_ORDER_ALREADY_CAPTURED');
   if(event.eventType==='REFUND_COMPLETED'&&(!paid||event.amount>paid-refunded))throw new Error('GMV_REFUND_AMOUNT_INVALID');
   const next={projectId:event.projectId,sellerId:event.sellerId,orderId:event.orderId,currency:event.currency,paidAmount:event.eventType==='PAYMENT_CAPTURED'?event.amount:paid,refundedAmount:event.eventType==='REFUND_COMPLETED'?refunded+event.amount:refunded,revision:(previous?.revision??0)+1};
   if(await store.commit({id,event,previous,next}))return {accepted:true,duplicate:false,id};
  }
  throw new Error('GMV_LEDGER_CONCURRENT_RETRY');
 }};
}
