import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export const GMV_EVENT_TYPES=Object.freeze({PAYMENT_CAPTURED:'PAYMENT_CAPTURED',REFUND_COMPLETED:'REFUND_COMPLETED'});

function required(value,name){const normalized=typeof value==='string'?value.trim():'';if(!normalized)throw new Error(`GMV_${name}_REQUIRED`);return normalized;}
function positiveYen(value){if(!Number.isSafeInteger(value)||value<=0)throw new Error('GMV_AMOUNT_INVALID');return value;}

export function createGmvEvent({identity,eventType,amount,occurredAt,orderId,providerEventId,sourceSystem='globepay'}){
  if(!Object.values(GMV_EVENT_TYPES).includes(eventType))throw new Error('GMV_EVENT_TYPE_INVALID');
  const timestamp=required(occurredAt,'OCCURRED_AT');if(Number.isNaN(Date.parse(timestamp)))throw new Error('GMV_OCCURRED_AT_INVALID');
  return Object.freeze({projectId:required(identity?.projectId,'PROJECT_ID'),sellerId:required(identity?.sellerId,'SELLER_ID'),merchantName:required(identity?.merchantName,'MERCHANT_NAME'),eventType,amount:positiveYen(amount),currency:'JPY',occurredAt:timestamp,orderId:required(orderId,'ORDER_ID'),providerEventId:required(providerEventId,'PROVIDER_EVENT_ID'),sourceSystem:required(sourceSystem,'SOURCE_SYSTEM')});
}
export function paymentCaptured(input){return createGmvEvent({...input,eventType:GMV_EVENT_TYPES.PAYMENT_CAPTURED});}
export function refundCompleted(input){return createGmvEvent({...input,eventType:GMV_EVENT_TYPES.REFUND_COMPLETED});}
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
export function createGmvClient({apiUrl,auth,fetchImpl=globalThis.fetch,timeoutMs=10000}){
  if(typeof fetchImpl!=='function')throw new Error('GMV_FETCH_REQUIRED');const endpoint=new URL(required(apiUrl,'API_URL'));
  return Object.freeze({async send(event){
    const normalized=createGmvEvent({identity:event,eventType:event.eventType,amount:event.amount,occurredAt:event.occurredAt,orderId:event.orderId,providerEventId:event.providerEventId,sourceSystem:event.sourceSystem});
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
export function summarizeGmv(events){return events.reduce((summary,event)=>{if(event.eventType===GMV_EVENT_TYPES.PAYMENT_CAPTURED){summary.grossPaid+=event.amount;summary.paidOrders+=1;}else if(event.eventType===GMV_EVENT_TYPES.REFUND_COMPLETED)summary.refunds+=event.amount;summary.netGmv=summary.grossPaid-summary.refunds;return summary;},{grossPaid:0,refunds:0,netGmv:0,paidOrders:0,currency:'JPY'});}
