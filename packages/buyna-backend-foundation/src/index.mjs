import {randomUUID,createHash} from 'node:crypto';
import {createOrderService} from '../../buyna-order-core/src/order-core.mjs';
import {createSettlementModule} from '../../buyna-commerce-settlement-core/src/index.mjs';
import {createCommerceStore} from './stores.mjs';
export {createPostgresRecords,migrateBackend,migrationSql} from './postgres.mjs';
export {setStock} from './stores.mjs';
export {backendErrorResponse} from './feedback.mjs';

// Input comes from the tenant's server configuration reader, never the browser.
export function paymentAvailability(config) {
  if(!config || config.readStatus!=='ok') return {state:'unknown',canPay:false,reason:'payment_status_unavailable'};
  if(config.disabled===true) return {state:'disabled',canPay:false,reason:'payment_explicitly_disabled'};
  if(config.configured===false) return {state:'unconfigured',canPay:false,reason:'payment_configuration_missing'};
  if(config.configured!==true) return {state:'unknown',canPay:false,reason:'payment_status_unavailable'};
  if(config.validationStatus!=='passed'||!config.credentialVersion||config.validatedVersion!==config.credentialVersion)
    return {state:'needs_validation',canPay:false,reason:'payment_connection_check_required'};
  return {state:'ready',canPay:true,reason:null};
}

function required(value,code) {
  if(typeof value!=='string'||!value.trim()||value.length>200) throw Error(code);
  return value;
}
function canonical(value) {
  if(Array.isArray(value)) return value.map(canonical);
  if(value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}

export function createBackend({records,provider,quote,readPaymentConfig,idGenerator=randomUUID,clock=()=>new Date(),holdMinutes=15}) {
  if(typeof quote!=='function'||typeof readPaymentConfig!=='function'||typeof provider?.verify!=='function') throw Error('SERVER_ADAPTERS_REQUIRED');
  if(!Number.isSafeInteger(holdMinutes)||holdMinutes<1||holdMinutes>1440) throw Error('INVALID_HOLD_DURATION');
  const store=createCommerceStore(records);
  const orders=createOrderService({...records.scope,store,idGenerator,clock});
  const settlement=createSettlementModule({store,provider});
  return Object.freeze({
    paymentStatus:async()=>paymentAvailability(await readPaymentConfig(records.scope)),
    // Guest session middleware supplies customerRef (opaque server-side identity).
    async createOrder({customerRef,idempotencyKey,items,paymentMethod,submission}) {
      required(customerRef,'CUSTOMER_SESSION_REQUIRED');required(idempotencyKey,'IDEMPOTENCY_KEY_REQUIRED');
      const availability=paymentAvailability(await readPaymentConfig(records.scope));
      if(!availability.canPay) throw Error(availability.reason);
      return records.transaction(async tx=>{
        const identity=JSON.stringify([customerRef,idempotencyKey]);
        const request=JSON.stringify(canonical({items,paymentMethod,submission}));
        const previous=await tx.get('checkout_request',identity);
        if(previous) {
          if(previous.request!==request) throw Error('ORDER_IDEMPOTENCY_CONFLICT');
          // Return current state, not the original pending-payment snapshot.
          return tx.get('order',previous.orderId);
        }
        const activeId=createHash('sha256').update(JSON.stringify([customerRef,request])).digest('hex');
        const active=await tx.get('active_checkout',activeId);
        if(active) {
          const saved=await tx.get('order',active.orderId);
          if(saved?.status==='pending_payment' && Date.parse(saved.expiresAt)>clock().getTime()) {
            await tx.put('checkout_request',identity,{...records.scope,request,orderId:saved.id});
            return saved;
          }
          if(saved?.status==='pending_payment') {
            await createCommerceStore(tx).releaseInventoryOnce({order:saved,eventId:JSON.stringify([saved.id,'expiry'])});
            await tx.put('order',saved.id,{...saved,status:'expired'});
            const id=JSON.stringify([saved.id,'expiry']);
            await tx.put('outbox',id,{...records.scope,id,orderId:saved.id,status:'expired'});
          }
        }
        const checkout=await quote({scope:records.scope,items,records:tx});
        const service=createOrderService({...records.scope,store:createCommerceStore(tx),idGenerator,clock});
        const order=await service.createPendingOrder({idempotencyKey:identity,checkout,paymentMethod,submission,
          expiresAt:new Date(clock().getTime()+holdMinutes*60000).toISOString()});
        const saved=await tx.put('order',order.id,{...order,customerRef});
        await tx.put('checkout_request',identity,{...records.scope,request,orderId:order.id});
        await tx.put('active_checkout',activeId,{...records.scope,orderId:order.id});
        return saved;
      });
    },
    async orderStatus({customerRef,orderId}) {
      required(customerRef,'CUSTOMER_SESSION_REQUIRED');
      const order=await orders.getOrderDetail({orderId});
      if(order.customerRef!==customerRef) throw Error('ORDER_NOT_FOUND');
      return {orderId:order.id,status:order.status,total:order.total,currency:order.currency,
        refundedAmount:order.refundedAmount,expiresAt:order.expiresAt,fulfillmentStatus:order.fulfillmentStatus??null};
    },
    // Provider verification includes signature/query authentication and exact merchant scope.
    settle:input=>settlement.settle({...input,...records.scope}),
    async startPayment({customerRef,orderId}) {
      required(customerRef,'CUSTOMER_SESSION_REQUIRED');
      if(typeof provider.create!=='function'||typeof provider.query!=='function') throw Error('PAYMENT_TRANSPORT_REQUIRED');
      const config=await readPaymentConfig(records.scope);
      if(!paymentAvailability(config).canPay) throw Error(paymentAvailability(config).reason);
      const claim=await records.transaction(async tx=>{
        const order=await tx.get('order',orderId);
        if(!order||order.customerRef!==customerRef) throw Error('ORDER_NOT_FOUND');
        if(order.status!=='pending_payment'||Date.parse(order.expiresAt)<=clock().getTime()) throw Error('ORDER_NOT_PAYABLE');
        const previous=await tx.get('payment_attempt',orderId);
        if(!previous) await tx.put('payment_attempt',orderId,{...records.scope,orderId,state:'submitting'});
        return {order,created:!previous};
      });
      // An ambiguous request is reconciled with the same provider order ID, never resubmitted blindly.
      const result=claim.created?await provider.create({order:claim.order,scope:records.scope}):await provider.query({order:claim.order,scope:records.scope});
      if(result?.orderId!==orderId||result.amount!==claim.order.total||result.currency!==claim.order.currency) throw Error('PAYMENT_RESPONSE_MISMATCH');
      const url=result.checkoutUrl?new URL(result.checkoutUrl):null;
      if(url && (url.protocol!=='https:'||url.username||url.password||!config.checkoutHosts?.includes(url.hostname))) throw Error('PAYMENT_URL_NOT_ALLOWED');
      const response={orderId,state:'processing',checkoutUrl:url?.href??null};
      await records.transaction(tx=>tx.put('payment_attempt',orderId,{...records.scope,...response}));
      return response;
    },
    async expireOrder(orderId) {
      return records.transaction(async tx=>{
        const order=await tx.get('order',orderId);
        if(!order||order.status!=='pending_payment'||Date.parse(order.expiresAt)>clock().getTime()) return {changed:false};
        if(!Number.isFinite(Date.parse(order.expiresAt))) throw Error('ORDER_EXPIRY_INVALID');
        await createCommerceStore(tx).releaseInventoryOnce({order,eventId:JSON.stringify([orderId,'expiry'])});
        await tx.put('order',orderId,{...order,status:'expired'});
        const id=JSON.stringify([orderId,'expiry']);
        await tx.put('outbox',id,{...records.scope,id,orderId,status:'expired'});
        return {changed:true};
      });
    }
  });
}

// Framework-neutral handlers; middleware authenticates scope, checks CSRF/rate limits,
// and resolves a guest session before these handlers are called.
export function createBackendHandlers({resolveRequest}) {
  if(typeof resolveRequest!=='function') throw Error('REQUEST_RESOLVER_REQUIRED');
  return {
    async createOrder(request) {
      const {backend,customerRef}=await resolveRequest(request,'customer');
      const {items,paymentMethod,submission,idempotencyKey}=request.body??{};
      const order=await backend.createOrder({customerRef,items,paymentMethod,submission,idempotencyKey});
      return {status:201,body:await backend.orderStatus({customerRef,orderId:order.id})};
    },
    async orderStatus(request) {
      const {backend,customerRef}=await resolveRequest(request,'customer');
      return {status:200,body:await backend.orderStatus({customerRef,orderId:request.params?.orderId})};
    },
    async paymentStatus(request) {
      const {backend}=await resolveRequest(request,'merchant');
      return {status:200,body:await backend.paymentStatus()};
    },
    async startPayment(request) {
      const {backend,customerRef}=await resolveRequest(request,'customer');
      return {status:200,body:await backend.startPayment({customerRef,orderId:request.params?.orderId})};
    },
    async paymentNotify(request) {
      const {backend}=await resolveRequest(request,'provider');
      return {status:200,body:await backend.settle({rawBody:request.rawBody,headers:request.headers})};
    }
  };
}

// Invoke from the existing scheduler. Cursor and changes commit together, so
// process interruption repeats at most an idempotent batch rather than skipping it.
export async function runExpiryBatch({records,backend,limit=100}) {
  return records.transaction(async tx=>{
    const cursor=await tx.get('worker','expiry');
    const page=await tx.scan('order',{after:cursor?.after??'',limit,status:'pending_payment'});
    let changed=0;
    // Use an already transaction-bound backend to avoid acquiring a second pool connection.
    const scopedBackend=backend(tx);
    for(const order of page.items) if((await scopedBackend.expireOrder(order.id)).changed) changed++;
    await tx.put('worker','expiry',{...tx.scope,after:page.next??''});
    return {scanned:page.items.length,changed,next:page.next};
  });
}
