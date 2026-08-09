import {buildIdempotencyKey,evaluateProviderStatus,planCheckout} from './globepay-core.mjs';

function required(value,code){if(String(value??'').trim()===''){const error=new Error(code);error.code=code;throw error}}
function positiveInteger(value,code){if(!Number.isInteger(Number(value))||Number(value)<=0){const error=new Error(code);error.code=code;throw error}}
function callable(owner,name){if(typeof owner?.[name]!=='function'){const error=new Error(`MISSING_ADAPTER_${name.toUpperCase()}`);error.code=error.message;throw error}}

export function createGlobepayService({store,provider}={}){
  return{
    async createCheckout(input={}){
      callable(store,'createPendingOrder');
      callable(store,'attachProviderOrder');
      callable(provider,'createOrder');
      required(input.sellerId,'MISSING_SELLER_ID');
      required(input.merchantOrderId,'MISSING_MERCHANT_ORDER_ID');
      positiveInteger(input.amount,'INVALID_AMOUNT');
      const currency=String(input.currency??'').trim().toUpperCase();
      if(!['JPY','CNY'].includes(currency)){const error=new Error('INVALID_CURRENCY');error.code='INVALID_CURRENCY';throw error}
      const checkout=planCheckout(input);
      const localOrder=await store.createPendingOrder({...input,currency,status:'pending_payment',checkout});
      required(localOrder?.id,'PENDING_ORDER_NOT_PERSISTED');
      const created=await provider.createOrder({localOrder,checkout});
      required(created?.providerOrderId,'MISSING_PROVIDER_ORDER_ID');
      const attached=await store.attachProviderOrder({sellerId:input.sellerId,localOrderId:localOrder.id,providerOrderId:created.providerOrderId,providerResponse:created});
      return{...attached,status:'pending_payment',providerOrderId:created.providerOrderId,nextAction:created.nextAction,checkout};
    },
    async syncPaymentStatus(input={}){
      required(input.sellerId,'MISSING_SELLER_ID');
      const eventType=String(input.eventType??'').trim().toLowerCase();
      let providerResult;
      if(eventType==='notify'){
        callable(provider,'verifyNotification');
        providerResult=await provider.verifyNotification(input.payload);
      }else if(['query','reconcile'].includes(eventType)){
        required(input.providerOrderId,'MISSING_PROVIDER_ORDER_ID');
        callable(provider,'queryOrder');
        providerResult=await provider.queryOrder({sellerId:input.sellerId,providerOrderId:input.providerOrderId});
      }else{
        const error=new Error('UNTRUSTED_PAYMENT_EVENT');error.code=error.message;throw error;
      }
      required(providerResult?.providerOrderId,'MISSING_PROVIDER_ORDER_ID');
      required(providerResult?.resultCode,'MISSING_PROVIDER_RESULT_CODE');
      callable(store,'withTransaction');
      return store.withTransaction(async tx=>{
        callable(tx,'getOrderByProviderId');
        callable(tx,'claimPaymentEvent');
        callable(tx,'applyPaymentTransition');
        callable(tx,'getOrderById');
        const order=await tx.getOrderByProviderId({sellerId:input.sellerId,providerOrderId:providerResult.providerOrderId});
        if(!order){const error=new Error('ORDER_NOT_FOUND');error.code=error.message;throw error}
        const transition=evaluateProviderStatus({currentStatus:order.status,eventType,resultCode:providerResult.resultCode});
        if(transition.status!=='pass'){const error=new Error(transition.code);error.code=transition.code;throw error}
        const idempotencyKey=buildIdempotencyKey({providerOrderId:providerResult.providerOrderId,eventType,resultCode:providerResult.resultCode,payload:providerResult.payload??input.payload});
        const claimed=await tx.claimPaymentEvent({sellerId:input.sellerId,orderId:order.id,idempotencyKey,eventType,providerResult});
        if(claimed)await tx.applyPaymentTransition({sellerId:input.sellerId,orderId:order.id,idempotencyKey,providerResult,...transition});
        const saved=await tx.getOrderById({sellerId:input.sellerId,orderId:order.id});
        if(!saved){const error=new Error('POST_WRITE_ORDER_NOT_FOUND');error.code=error.message;throw error}
        if(claimed&&saved.status!==transition.nextStatus){const error=new Error('PAYMENT_TRANSITION_NOT_PERSISTED');error.code=error.message;throw error}
        return{status:'pass',applied:Boolean(claimed),idempotencyKey,transition,order:saved};
      });
    },
  };
}

export {buildIdempotencyKey,evaluateProviderStatus};
