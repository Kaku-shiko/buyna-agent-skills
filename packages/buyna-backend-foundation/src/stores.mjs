import {createInventoryModule} from '../../buyna-inventory-core/src/index.mjs';

const key = (...parts) => JSON.stringify(parts);

export function createCommerceStore(records) {
  const scope = records.scope;
  const withScope = body => ({...body,...scope});
  function check(value) {
    if (value.projectId!==scope.projectId || value.sellerId!==scope.sellerId) throw Error('MERCHANT_SCOPE_MISMATCH');
  }
  async function patchOrder(id, patch) {
    const order = await records.get('order',id);
    if (!order) throw Error('ORDER_NOT_FOUND');
    return records.put('order',id,{...order,...patch});
  }
  async function source(id, order, status, extra={}) {
    if (await records.get('outbox',id)) return;
    await records.put('outbox',id,withScope({id,orderId:order.id,status,total:order.total,currency:order.currency,...extra}));
  }
  const inventoryStore = {
    transaction: work => records.transaction(tx=>work(inventoryAdapter(tx)))
  };
  function inventoryAdapter(tx) {
    const put = (kind,id,value)=>tx.put(kind,id,withScope(value));
    const complete = (eventId,result,fingerprint)=>put('inventory_event',eventId,{eventId,
      scope,operation:fingerprint.operation,reservationId:fingerprint.reservationId,fingerprint,result});
    async function change({eventId,fingerprint,reservation}, operation) {
      const stockId=key(reservation.productId,reservation.skuId);
      const stock=await tx.get('stock',stockId);
      if (!stock) throw Error('INVENTORY_STOCK_NOT_FOUND');
      const q=reservation.quantity;
      const next={...stock,
        reservedQuantity:stock.reservedQuantity+(operation==='reserve'?q:-q),
        onHandQuantity:stock.onHandQuantity-(operation==='commit'?q:0)};
      if (!Number.isSafeInteger(next.onHandQuantity)||!Number.isSafeInteger(next.reservedQuantity)
        ||next.reservedQuantity<0||next.onHandQuantity<next.reservedQuantity) throw Error('INVENTORY_STOCK_INVALID');
      await put('stock',stockId,next);
      await put('reservation',reservation.reservationId,reservation);
      await complete(eventId,reservation,fingerprint);
    }
    return {
      async claimReservationEvent(input) {
        check(input.scope);
        const event=await tx.get('inventory_event',input.eventId);
        if (event) return {claimed:false,event};
        return {claimed:true,reservation:await tx.get('reservation',input.reservationId),
          complete:(result,fingerprint)=>complete(input.eventId,result,fingerprint)};
      },
      getStockForUpdate:({scope:s,productId,skuId})=>{check(s);return tx.get('stock',key(productId,skuId));},
      createReservation:input=>change(input,'reserve'),
      commitReservation:input=>change(input,'commit'),
      releaseReservation:input=>change(input,'release')
    };
  }
  const inventory=createInventoryModule({...scope,store:inventoryStore});
  const reservationId=(order,index)=>key(order.id,index);
  async function release(order,eventId) {
    for(let index=0;index<order.items.length;index++) {
      const id=reservationId(order,index), r=await records.get('reservation',id);
      if(r?.state==='reserved') await inventory.release({reservationId:id,eventId:key(eventId,index,'release')});
    }
  }
  return {
    transaction:work=>records.transaction(tx=>work(createCommerceStore(tx))),
    async claimIdempotency({scope:s,key:id,operation}) {
      check(s); const saved=await records.get('idempotency',key(operation,id));
      return saved?{claimed:false,result:saved.result}:{claimed:true};
    },
    completeIdempotency:({scope:s,key:id,operation,result})=>{
      check(s);return records.put('idempotency',key(operation,id),withScope({result}));
    },
    async createPendingOrder({scope:s,order}) {
      check(s); check(order);
      if(await records.get('order',order.id)) throw Error('ORDER_ID_CONFLICT');
      if(!Number.isFinite(Date.parse(order.expiresAt))) throw Error('ORDER_EXPIRY_REQUIRED');
      for(let index=0;index<order.items.length;index++) {
        const item=order.items[index];
        await inventory.reserve({eventId:key(order.id,index,'reserve'),reservationId:reservationId(order,index),
          productId:item.productId,skuId:item.variantId??item.productId,quantity:item.quantity});
      }
      const saved=await records.put('order',order.id,{...order,amount:order.total,paidAmount:0,refundedAmount:0});
      await source(key(order.id,'created'),saved,'pending_payment');
      return saved;
    },
    getOrderById:({scope:s,orderId})=>{check(s);return records.get('order',orderId);},
    getOrderForSettlement:({projectId,sellerId,orderId})=>{check({projectId,sellerId});return records.get('order',orderId);},
    async listOrders({scope:s,filters={},limit,offset,page,pageSize}) {
      check(s);
      if(Object.keys(filters).some(field=>field!=='status')) throw Error('ORDER_FILTER_NOT_SUPPORTED');
      return {items:await records.list('order',{limit,offset,status:filters.status??null}),page,pageSize};
    },
    async archiveOrder({scope:s,orderId,status,archivedAt,allowedStatuses}) {
      check(s); const order=await records.get('order',orderId);
      if(!order||!allowedStatuses.includes(order.status)) throw Error('ORDER_STATE_CONFLICT');
      await release(order,key(orderId,'cancel'));
      const saved=await patchOrder(orderId,{status,archivedAt});
      await source(key(orderId,'cancelled'),saved,'cancelled');return saved;
    },
    async claimEvent({eventId,provider}) {
      const id=key(provider,eventId);
      if(await records.get('payment_event',id)) return false;
      await records.put('payment_event',id,withScope({eventId,provider}));return true;
    },
    upsertPayment:({order,verified})=>records.put('payment',key(verified.provider,verified.eventId),
      withScope({orderId:order.id,eventId:verified.eventId,status:verified.status,amount:verified.amount,currency:verified.currency})),
    setOrderStatus:({order,status})=>patchOrder(order.id,{status,...(status==='paid'?{paidAmount:order.amount}:{})}),
    async applyInventoryOnce({order,eventId}) {
      for(let index=0;index<order.items.length;index++)
        await inventory.commit({reservationId:reservationId(order,index),eventId:key(eventId,index,'commit')});
    },
    releaseInventoryOnce:({order,eventId})=>release(order,eventId),
    // Paid money must be recorded even when a released reservation cannot be fulfilled.
    reconcileLatePayment:async()=>({status:'review_required',reason:'inventory_reservation_released'}),
    recordFulfillmentReview:({order,reason})=>patchOrder(order.id,{fulfillmentStatus:'review_required',fulfillmentReason:reason}),
    upsertPaidCustomer:({order})=>records.put('paid_order',order.id,withScope({orderId:order.id})),
    recordRefund:({order,cumulativeRefundAmount})=>patchOrder(order.id,{refundedAmount:cumulativeRefundAmount}),
    appendGmvOutbox:({order,verified,refundDelta})=>source(key(verified.provider,verified.eventId),order,verified.status,
      {provider:verified.provider,eventId:verified.eventId,...(refundDelta===undefined?{}:{refundDelta})})
  };
}

// Server-admin operation: public routes must never expose stock writes.
export async function setStock(records,{productId,skuId,onHandQuantity}) {
  if(!productId||!skuId||!Number.isSafeInteger(onHandQuantity)||onHandQuantity<0) throw Error('INVENTORY_STOCK_INVALID');
  return records.transaction(async tx=>{
    const id=key(productId,skuId), previous=await tx.get('stock',id);
    const reservedQuantity=previous?.reservedQuantity??0;
    if(onHandQuantity<reservedQuantity) throw Error('INVENTORY_BELOW_RESERVED');
    return tx.put('stock',id,{...tx.scope,productId,skuId,onHandQuantity,reservedQuantity});
  });
}
