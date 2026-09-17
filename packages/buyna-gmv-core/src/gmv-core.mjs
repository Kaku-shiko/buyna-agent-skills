import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export const GMV_EVENT_TYPES=Object.freeze({PAYMENT_CAPTURED:'PAYMENT_CAPTURED',REFUND_COMPLETED:'REFUND_COMPLETED'});

function required(value,name){const normalized=typeof value==='string'?value.trim():'';if(!normalized)throw new Error(`GMV_${name}_REQUIRED`);return normalized;}
function positiveMinor(value){if(!Number.isSafeInteger(value)||value<=0)throw new Error('GMV_AMOUNT_INVALID');return value;}

export function createGmvEvent({identity,eventType,amount,currency,occurredAt,orderId,providerEventId,sourceSystem='globepay'}){
  if(!Object.values(GMV_EVENT_TYPES).includes(eventType))throw new Error('GMV_EVENT_TYPE_INVALID');
  const timestamp=required(occurredAt,'OCCURRED_AT');if(Number.isNaN(Date.parse(timestamp)))throw new Error('GMV_OCCURRED_AT_INVALID');
  return Object.freeze({projectId:required(identity?.projectId,'PROJECT_ID'),sellerId:required(identity?.sellerId,'SELLER_ID'),merchantName:required(identity?.merchantName,'MERCHANT_NAME'),eventType,amount:positiveMinor(amount),currency:normalizeCurrency(currency),occurredAt:timestamp,orderId:required(orderId,'ORDER_ID'),providerEventId:required(providerEventId,'PROVIDER_EVENT_ID'),sourceSystem:required(sourceSystem,'SOURCE_SYSTEM')});
}
export function paymentCaptured(input){return createGmvEvent({...input,eventType:GMV_EVENT_TYPES.PAYMENT_CAPTURED});}
export function refundCompleted(input){
  const event=createGmvEvent({...input,eventType:GMV_EVENT_TYPES.REFUND_COMPLETED});
  const paid=input.originalPayment;
  if(!paid||paid.eventType!==GMV_EVENT_TYPES.PAYMENT_CAPTURED)throw new Error('GMV_ORIGINAL_PAYMENT_REQUIRED');
  if(['projectId','sellerId','orderId','currency'].some(k=>event[k]!==paid[k]))throw new Error('GMV_REFUND_PAYMENT_MISMATCH');
  const already=input.completedRefundAmount;
  if(!Number.isSafeInteger(already)||already<0||event.amount>positiveMinor(paid.amount)-already)throw new Error('GMV_REFUND_AMOUNT_INVALID');
  return event;
}
export function gmvEventId(event){return `gmv#event#${event.eventType}#${event.sourceSystem}#${event.providerEventId}`;}

export function createHmacHeaders({clientId,clientSecret,method='POST',path,body,timestamp=Math.floor(Date.now()/1000)}){
  const bodyHash=createHash('sha256').update(body).digest('hex');
  const canonical=`${timestamp}\n${method.toUpperCase()}\n${path}\n${bodyHash}`;
  const signature=createHmac('sha256',required(clientSecret,'CLIENT_SECRET')).update(canonical).digest('hex');
  return {'x-buyna-client-id':required(clientId,'CLIENT_ID'),'x-buyna-timestamp':String(timestamp),'x-buyna-signature':signature};
}
export function verifyHmacRequest({clientSecret,method,path,body,timestamp,signature,now=Math.floor(Date.now()/1000),maxSkewSeconds=300}){
  const numeric=Number(timestamp);if(!Number.isSafeInteger(numeric)||Math.abs(now-numeric)>maxSkewSeconds)return false;
  const expected=createHmacHeaders({clientId:'verification',clientSecret,method,path,body,timestamp:numeric})['x-buyna-signature'];
  const left=Buffer.from(expected,'hex');const right=Buffer.from(String(signature??''),'hex');return left.length===right.length&&timingSafeEqual(left,right);
}
export function createGmvClient({apiUrl,auth,fetchImpl=globalThis.fetch,timeoutMs=10000,acceptedCurrencies=['JPY']}){
  if(typeof fetchImpl!=='function')throw new Error('GMV_FETCH_REQUIRED');const endpoint=new URL(required(apiUrl,'API_URL'));
  return Object.freeze({async send(event){
    const normalized=createGmvEvent({identity:event,eventType:event.eventType,amount:event.amount,currency:event.currency,occurredAt:event.occurredAt,orderId:event.orderId,providerEventId:event.providerEventId,sourceSystem:event.sourceSystem});
    if(!acceptedCurrencies.includes(normalized.currency))throw new Error('GMV_ENDPOINT_CURRENCY_UNSUPPORTED');
    const body=JSON.stringify(normalized);const headers={'content-type':'application/json'};
    if(auth?.mode==='bearer')headers.authorization=`Bearer ${required(auth.secret,'INGESTION_SECRET')}`;
    else Object.assign(headers,createHmacHeaders({clientId:auth?.clientId,clientSecret:auth?.clientSecret,path:endpoint.pathname,body}));
    const response=await fetchImpl(endpoint,{method:'POST',headers,body,signal:AbortSignal.timeout(timeoutMs)});if(!response.ok)throw new Error(`GMV_API_FAILED:${response.status}`);
    const result=await response.json();if(result?.accepted!==true)throw new Error('GMV_API_NOT_ACCEPTED');return result;
  }});
}
export async function sendPendingGmvEvents({adapter,client,limit=50,now=()=>new Date()}){
  const results=[];for(const record of await adapter.listPending({limit})){
    try{const result=await client.send(record.event);await adapter.markSent({id:record.id,sentAt:now().toISOString(),remoteId:result.id,duplicate:result.duplicate===true});results.push({id:record.id,status:'sent',duplicate:result.duplicate===true});}
    catch(error){await adapter.markFailed({id:record.id,errorCode:String(error?.message??'GMV_SYNC_FAILED'),nextRetryAt:nextRetryAt(record.retryCount??0,now()).toISOString()});results.push({id:record.id,status:'failed'});}
  }return results;
}
export function nextRetryAt(retryCount,from=new Date()){const schedule=[1,5,15,60,360];const minutes=schedule[Math.min(Math.max(retryCount,0),schedule.length-1)];return new Date(from.getTime()+minutes*60000);}
export const GMV_CURRENCY_SCALE=Object.freeze({JPY:0,CNY:2});
export function normalizeCurrency(currency){if(!Object.hasOwn(GMV_CURRENCY_SCALE,currency))throw new Error('GMV_CURRENCY_REQUIRED_OR_UNSUPPORTED');return currency;}
export function decimalToMinor(value,currency){
  const scale=GMV_CURRENCY_SCALE[normalizeCurrency(currency)];
  if(typeof value!=='string'||!new RegExp('^[0-9]+(?:\\.[0-9]{1,'+Math.max(scale,1)+'})?$').test(value))throw new Error('GMV_DECIMAL_INVALID');
  const [whole,fraction='']=value.split('.');if(fraction.length>scale)throw new Error('GMV_DECIMAL_INVALID');
  const amount=BigInt(whole)*10n**BigInt(scale)+BigInt(fraction.padEnd(scale,'0')||'0');
  if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('GMV_AMOUNT_INVALID');return positiveMinor(Number(amount));
}
export function summarizeGmvByCurrency(events){
  const groups=new Map();
  for(const event of events){
    const currency=normalizeCurrency(event.currency);positiveMinor(event.amount);
    if(!Object.values(GMV_EVENT_TYPES).includes(event.eventType))throw new Error('GMV_EVENT_TYPE_INVALID');
    const summary=groups.get(currency)||{grossPaid:0,refunds:0,netGmv:0,paidOrders:0,currency};
    if(event.eventType===GMV_EVENT_TYPES.PAYMENT_CAPTURED){summary.grossPaid+=event.amount;summary.paidOrders++;}else summary.refunds+=event.amount;
    if(!Number.isSafeInteger(summary.grossPaid)||!Number.isSafeInteger(summary.refunds))throw new Error('GMV_TOTAL_OVERFLOW');
    summary.netGmv=summary.grossPaid-summary.refunds;groups.set(currency,summary);
  }
  return [...groups.values()].sort((a,b)=>a.currency.localeCompare(b.currency));
}
export function summarizeGmv(events){
  const groups=summarizeGmvByCurrency(events);if(groups.length>1)throw new Error('GMV_MIXED_CURRENCY');
  return groups[0]??{grossPaid:0,refunds:0,netGmv:0,paidOrders:0,currency:null};
}
