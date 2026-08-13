function fail(code){const error=new Error(code);error.code=code;throw error}
function required(value,code){const text=String(value??'').trim();if(!text)fail(code);return text}
function integer(value,code,{min=0,max=Number.MAX_SAFE_INTEGER}={}){const number=Number(value);if(!Number.isSafeInteger(number)||number<min||number>max)fail(code);return number}
function optionalInteger(value,code,limits){return value===null||value===undefined||value===''?null:integer(value,code,limits)}
function method(owner,name){if(typeof owner?.[name]!=='function')fail(`MISSING_ADAPTER_${name.toUpperCase()}`)}
function iso(value,code){if(value===null||value===undefined||value==='')return null;const date=new Date(value);if(Number.isNaN(date.getTime()))fail(code);return date.toISOString()}
function scope(projectId,sellerId){return Object.freeze({projectId:required(projectId,'MISSING_PROJECT_ID'),sellerId:required(sellerId,'MISSING_SELLER_ID')})}

export const COUPON_TYPES=Object.freeze({PERCENTAGE_CODE:'percentage_code',FIXED_THRESHOLD:'fixed_threshold'});
export const THRESHOLD_OPERATORS=Object.freeze({AND:'AND',OR:'OR'});
export const COUPON_STATUSES=Object.freeze({DRAFT:'draft',ACTIVE:'active',PAUSED:'paused',EXPIRED:'expired',ARCHIVED:'archived'});
export const RESERVATION_STATUSES=Object.freeze({RESERVED:'reserved',REDEEMED:'redeemed',RELEASED:'released'});

export function normalizeCouponCode(value){return required(value,'MISSING_COUPON_CODE').normalize('NFKC').trim().toUpperCase()}

function normalizeCoupon(coupon={}){
  const type=required(coupon.type??coupon.couponType,'MISSING_COUPON_TYPE');
  if(!Object.values(COUPON_TYPES).includes(type))fail('INVALID_COUPON_TYPE');
  const normalized={
    id:required(coupon.id,'MISSING_COUPON_ID'),
    projectId:required(coupon.projectId,'MISSING_COUPON_PROJECT_ID'),
    sellerId:required(coupon.sellerId,'MISSING_COUPON_SELLER_ID'),
    name:required(coupon.name,'MISSING_COUPON_NAME'),
    type,
    status:required(coupon.status,'MISSING_COUPON_STATUS'),
    startsAt:iso(coupon.startsAt,'INVALID_COUPON_START'),
    endsAt:iso(coupon.endsAt,'INVALID_COUPON_END'),
    totalLimit:optionalInteger(coupon.totalLimit,'INVALID_TOTAL_LIMIT',{min:1}),
    perCustomerLimit:optionalInteger(coupon.perCustomerLimit,'INVALID_CUSTOMER_LIMIT',{min:1}),
  };
  if(normalized.startsAt&&normalized.endsAt&&normalized.startsAt>=normalized.endsAt)fail('INVALID_COUPON_PERIOD');
  if(type===COUPON_TYPES.PERCENTAGE_CODE){
    normalized.code=normalizeCouponCode(coupon.code);
    normalized.percentageBps=integer(coupon.percentageBps,'INVALID_PERCENTAGE_BPS',{min:1,max:10000});
    normalized.minimumSubtotal=optionalInteger(coupon.minimumSubtotal,'INVALID_MINIMUM_SUBTOTAL',{min:0})??0;
    normalized.maximumDiscount=optionalInteger(coupon.maximumDiscount,'INVALID_MAXIMUM_DISCOUNT',{min:1});
  }else{
    normalized.discountAmount=integer(coupon.discountAmount,'INVALID_DISCOUNT_AMOUNT',{min:1});
    normalized.thresholdQuantity=optionalInteger(coupon.thresholdQuantity,'INVALID_THRESHOLD_QUANTITY',{min:1});
    normalized.thresholdAmount=optionalInteger(coupon.thresholdAmount,'INVALID_THRESHOLD_AMOUNT',{min:1});
    if(normalized.thresholdQuantity===null&&normalized.thresholdAmount===null)fail('MISSING_THRESHOLD');
    normalized.thresholdOperator=required(coupon.thresholdOperator??THRESHOLD_OPERATORS.AND,'MISSING_THRESHOLD_OPERATOR').toUpperCase();
    if(!Object.values(THRESHOLD_OPERATORS).includes(normalized.thresholdOperator))fail('INVALID_THRESHOLD_OPERATOR');
    normalized.applicationMode=required(coupon.applicationMode??'manual','MISSING_APPLICATION_MODE');
    if(!['manual','automatic'].includes(normalized.applicationMode))fail('INVALID_APPLICATION_MODE');
  }
  return normalized;
}
function inActivePeriod(coupon,now){
  const instant=new Date(now).getTime();
  if(Number.isNaN(instant))fail('INVALID_CURRENT_TIME');
  if(coupon.startsAt&&instant<new Date(coupon.startsAt).getTime())return'COUPON_NOT_STARTED';
  if(coupon.endsAt&&instant>=new Date(coupon.endsAt).getTime())return'COUPON_EXPIRED';
  return null;
}

function thresholdEligible(coupon,subtotal,itemCount){
  const quantityPass=coupon.thresholdQuantity===null?null:itemCount>=coupon.thresholdQuantity;
  const amountPass=coupon.thresholdAmount===null?null:subtotal>=coupon.thresholdAmount;
  const checks=[quantityPass,amountPass].filter(value=>value!==null);
  return coupon.thresholdOperator===THRESHOLD_OPERATORS.OR?checks.some(Boolean):checks.every(Boolean);
}

export function evaluateCoupon(couponInput,context={}){
  const coupon=normalizeCoupon(couponInput);
  const subtotal=integer(context.subtotal,'INVALID_SUBTOTAL',{min:0});
  const itemCount=integer(context.itemCount,'INVALID_ITEM_COUNT',{min:0});
  const shipping=integer(context.shipping??0,'INVALID_SHIPPING',{min:0});
  const tax=integer(context.tax??0,'INVALID_TAX',{min:0});
  const now=context.now??new Date().toISOString();
  const reject=reason=>({eligible:false,reason,discountAmount:0,totalAmount:subtotal+shipping+tax,couponId:coupon.id});
  if(coupon.status!==COUPON_STATUSES.ACTIVE)return reject('COUPON_NOT_ACTIVE');
  const periodError=inActivePeriod(coupon,now);if(periodError)return reject(periodError);

  let discountAmount=0;
  if(coupon.type===COUPON_TYPES.PERCENTAGE_CODE){
    if(!String(context.code??'').trim())return reject('COUPON_CODE_REQUIRED');
    if(normalizeCouponCode(context.code)!==coupon.code)return reject('COUPON_CODE_MISMATCH');
    if(subtotal<coupon.minimumSubtotal)return reject('MINIMUM_SUBTOTAL_NOT_MET');
    discountAmount=Math.floor(subtotal*coupon.percentageBps/10000);
    if(coupon.maximumDiscount!==null)discountAmount=Math.min(discountAmount,coupon.maximumDiscount);
  }else{
    if(!thresholdEligible(coupon,subtotal,itemCount))return reject('THRESHOLD_NOT_MET');
    discountAmount=coupon.discountAmount;
  }
  if(discountAmount<1)return reject('NO_DISCOUNT');
  if(discountAmount>=subtotal)return reject('FINAL_TOTAL_MUST_BE_POSITIVE');
  const snapshot=Object.freeze({
    couponId:coupon.id,name:coupon.name,type:coupon.type,code:coupon.code??null,
    percentageBps:coupon.percentageBps??null,discountAmount,
    thresholdQuantity:coupon.thresholdQuantity??null,thresholdAmount:coupon.thresholdAmount??null,
    thresholdOperator:coupon.thresholdOperator??null,subtotal,shipping,tax,totalAmount:subtotal+shipping+tax-discountAmount,
  });
  return{eligible:true,reason:null,discountAmount,totalAmount:subtotal+shipping+tax-discountAmount,couponId:coupon.id,snapshot};
}

export function resolveCouponPaymentAmount({quote,orderTotal}={}){
  if(!quote?.eligible)fail('ELIGIBLE_COUPON_QUOTE_REQUIRED');
  const quotedTotal=integer(quote.totalAmount,'INVALID_COUPON_QUOTE_TOTAL',{min:1});
  const persistedOrderTotal=integer(orderTotal,'INVALID_ORDER_TOTAL',{min:1});
  if(quotedTotal!==persistedOrderTotal)fail('ORDER_COUPON_TOTAL_MISMATCH');
  return persistedOrderTotal;
}

export function createCouponService({store,projectId,sellerId,clock=()=>new Date()}={}){
  const merchantScope=scope(projectId,sellerId);method(store,'transaction');
  const now=()=>clock().toISOString();

  async function couponForUpdate(tx,input){
    method(tx,'getCouponForUpdate');
    const coupon=await tx.getCouponForUpdate({scope:{...merchantScope},couponId:input.couponId??null,code:input.code?normalizeCouponCode(input.code):null});
    if(!coupon)fail('COUPON_NOT_FOUND');
    if(coupon.projectId!==merchantScope.projectId||coupon.sellerId!==merchantScope.sellerId)fail('COUPON_SCOPE_MISMATCH');
    return coupon;
  }

  return{
    scope:merchantScope,
    async quote(input={}){
      method(store,'getCoupon');
      const coupon=await store.getCoupon({scope:{...merchantScope},couponId:input.couponId??null,code:input.code?normalizeCouponCode(input.code):null});
      if(!coupon)fail('COUPON_NOT_FOUND');
      return evaluateCoupon(coupon,{subtotal:input.subtotal,itemCount:input.itemCount,code:input.code,now:now()});
    },
    async reserve(input={}){
      const orderId=required(input.orderId,'MISSING_ORDER_ID'),customerKey=required(input.customerKey,'MISSING_CUSTOMER_KEY');
      return store.transaction(async tx=>{
        method(tx,'getReservationByOrderId');
        const existing=await tx.getReservationByOrderId({scope:{...merchantScope},orderId});
        if(existing)return existing;
        const coupon=await couponForUpdate(tx,input);
        const quote=evaluateCoupon(coupon,{subtotal:input.subtotal,itemCount:input.itemCount,shipping:input.shipping,tax:input.tax,code:input.code,now:now()});
        if(!quote.eligible)fail(quote.reason);
        method(tx,'countCouponUsage');
        const usage=await tx.countCouponUsage({scope:{...merchantScope},couponId:coupon.id,customerKey});
        const totalUsed=integer(usage?.redeemed??0,'INVALID_USAGE_COUNT')+integer(usage?.reserved??0,'INVALID_USAGE_COUNT');
        const customerUsed=integer(usage?.customerRedeemed??0,'INVALID_USAGE_COUNT')+integer(usage?.customerReserved??0,'INVALID_USAGE_COUNT');
        if(coupon.totalLimit&&totalUsed>=coupon.totalLimit)fail('COUPON_TOTAL_LIMIT_REACHED');
        if(coupon.perCustomerLimit&&customerUsed>=coupon.perCustomerLimit)fail('COUPON_CUSTOMER_LIMIT_REACHED');
        method(tx,'createReservation');
        return tx.createReservation({scope:{...merchantScope},couponId:coupon.id,orderId,customerKey,status:RESERVATION_STATUSES.RESERVED,expiresAt:iso(input.expiresAt,'INVALID_RESERVATION_EXPIRY'),snapshot:quote.snapshot,discountAmount:quote.discountAmount,totalAmount:quote.totalAmount,createdAt:now()});
      });
    },
    async redeem(input={}){
      const reservationId=required(input.reservationId,'MISSING_RESERVATION_ID');
      return store.transaction(async tx=>{
        method(tx,'getReservationForUpdate');
        const reservation=await tx.getReservationForUpdate({scope:{...merchantScope},reservationId});
        if(!reservation)fail('RESERVATION_NOT_FOUND');
        if(reservation.status===RESERVATION_STATUSES.REDEEMED)return reservation;
        if(reservation.status!==RESERVATION_STATUSES.RESERVED)fail('RESERVATION_NOT_REDEEMABLE');
        const paidAmount=integer(input.paidAmount,'INVALID_PAID_AMOUNT',{min:1});
        const orderTotal=integer(input.orderTotal,'INVALID_ORDER_TOTAL',{min:1});
        if(paidAmount!==orderTotal||paidAmount!==reservation.totalAmount)fail('PAYMENT_AMOUNT_MISMATCH');
        method(tx,'markReservationRedeemed');
        return tx.markReservationRedeemed({scope:{...merchantScope},reservationId,orderId:reservation.orderId,redeemedAt:now(),providerEventKey:required(input.providerEventKey,'MISSING_PROVIDER_EVENT_KEY')});
      });
    },
    async release(input={}){
      const reservationId=required(input.reservationId,'MISSING_RESERVATION_ID');
      return store.transaction(async tx=>{
        method(tx,'getReservationForUpdate');
        const reservation=await tx.getReservationForUpdate({scope:{...merchantScope},reservationId});
        if(!reservation)fail('RESERVATION_NOT_FOUND');
        if(reservation.status===RESERVATION_STATUSES.RELEASED)return reservation;
        if(reservation.status===RESERVATION_STATUSES.REDEEMED)fail('REDEEMED_RESERVATION_CANNOT_BE_RELEASED');
        method(tx,'markReservationReleased');
        return tx.markReservationReleased({scope:{...merchantScope},reservationId,releasedAt:now(),reason:required(input.reason,'MISSING_RELEASE_REASON')});
      });
    },
  };
}
