import test from 'node:test';
import assert from 'node:assert/strict';
import {COUPON_TYPES,evaluateCoupon,createCouponService,normalizeCouponCode,resolveCouponPaymentAmount} from '../src/coupon-core.mjs';

const base={id:'coupon-1',projectId:'shop',sellerId:'seller',name:'Campaign',status:'active',startsAt:'2026-01-01T00:00:00.000Z',endsAt:'2027-01-01T00:00:00.000Z',totalLimit:100,perCustomerLimit:1};
const now='2026-08-11T00:00:00.000Z';

test('percentage code is normalized and capped with integer JPY math',()=>{
  const result=evaluateCoupon({...base,type:COUPON_TYPES.PERCENTAGE_CODE,code:'summer10',percentageBps:1000,minimumSubtotal:5000,maximumDiscount:1000},{subtotal:20000,itemCount:2,code:'ＳＵＭＭＥＲ１０',now});
  assert.equal(normalizeCouponCode(' summer10 '),'SUMMER10');
  assert.equal(result.eligible,true);
  assert.equal(result.discountAmount,1000);
  assert.equal(result.totalAmount,19000);
  assert.equal(result.snapshot.code,'SUMMER10');
});
test('percentage code rejects missing code and minimum subtotal failures',()=>{
  const coupon={...base,type:COUPON_TYPES.PERCENTAGE_CODE,code:'SAVE10',percentageBps:1000,minimumSubtotal:5000,maximumDiscount:null};
  assert.equal(evaluateCoupon(coupon,{subtotal:6000,itemCount:1,now}).reason,'COUPON_CODE_REQUIRED');
  assert.equal(evaluateCoupon(coupon,{subtotal:4999,itemCount:1,code:'SAVE10',now}).reason,'MINIMUM_SUBTOTAL_NOT_MET');
});

test('fixed threshold AND requires quantity and amount',()=>{
  const coupon={...base,type:COUPON_TYPES.FIXED_THRESHOLD,discountAmount:500,thresholdQuantity:3,thresholdAmount:5000,thresholdOperator:'AND'};
  assert.equal(evaluateCoupon(coupon,{subtotal:6000,itemCount:2,now}).reason,'THRESHOLD_NOT_MET');
  assert.equal(evaluateCoupon(coupon,{subtotal:4000,itemCount:3,now}).reason,'THRESHOLD_NOT_MET');
  const accepted=evaluateCoupon(coupon,{subtotal:5000,itemCount:3,now});
  assert.equal(accepted.discountAmount,500);
  assert.equal(accepted.totalAmount,4500);
});

test('fixed threshold OR accepts either quantity or amount',()=>{
  const coupon={...base,type:COUPON_TYPES.FIXED_THRESHOLD,discountAmount:300,thresholdQuantity:3,thresholdAmount:5000,thresholdOperator:'OR'};
  assert.equal(evaluateCoupon(coupon,{subtotal:2000,itemCount:3,now}).eligible,true);
  assert.equal(evaluateCoupon(coupon,{subtotal:5000,itemCount:1,now}).eligible,true);
  assert.equal(evaluateCoupon(coupon,{subtotal:2000,itemCount:1,now}).reason,'THRESHOLD_NOT_MET');
});

test('discount cannot produce a zero or negative GlobePay total',()=>{
  const coupon={...base,type:COUPON_TYPES.FIXED_THRESHOLD,discountAmount:5000,thresholdAmount:5000,thresholdOperator:'AND'};
  assert.equal(evaluateCoupon(coupon,{subtotal:5000,itemCount:1,now}).reason,'FINAL_TOTAL_MUST_BE_POSITIVE');
});

test('GlobePay request amount uses discounted order total including shipping and tax',()=>{
  const coupon={...base,type:COUPON_TYPES.FIXED_THRESHOLD,discountAmount:500,thresholdAmount:5000,thresholdOperator:'AND'};
  const quote=evaluateCoupon(coupon,{subtotal:5000,itemCount:1,shipping:400,tax:100,now});
  assert.equal(quote.discountAmount,500);
  assert.equal(quote.totalAmount,5000);
  assert.equal(resolveCouponPaymentAmount({quote,orderTotal:5000}),5000);
  assert.throws(()=>resolveCouponPaymentAmount({quote,orderTotal:5500}),/ORDER_COUPON_TOTAL_MISMATCH/);
});

function serviceFixture({usage}={}){
  let reservation=null;
  const coupon={...base,type:COUPON_TYPES.FIXED_THRESHOLD,discountAmount:500,thresholdQuantity:3,thresholdAmount:5000,thresholdOperator:'AND'};
  const tx={
    async getCouponForUpdate({scope}){assert.deepEqual(scope,{projectId:'shop',sellerId:'seller'});return coupon},
    async getReservationByOrderId(){return reservation},
    async countCouponUsage(){return usage??{redeemed:0,reserved:0,customerRedeemed:0,customerReserved:0}},
    async createReservation(input){reservation={id:'reservation-1',...input};return reservation},
    async getReservationForUpdate(){return reservation},
    async markReservationRedeemed(input){reservation={...reservation,status:'redeemed',...input};return reservation},
    async markReservationReleased(input){reservation={...reservation,status:'released',...input};return reservation},
  };
  const store={async transaction(work){return work(tx)},async getCoupon(){return coupon}};
  const service=createCouponService({store,projectId:'shop',sellerId:'seller',clock:()=>new Date(now)});
  return{service,getReservation:()=>reservation};
}

test('reservation is order-idempotent and payment redemption happens once',async()=>{
  const {service}=serviceFixture();
  const input={couponId:'coupon-1',orderId:'order-1',customerKey:'email-hash',subtotal:5000,itemCount:3,expiresAt:'2026-08-11T00:30:00.000Z'};
  const first=await service.reserve(input),second=await service.reserve(input);
  assert.equal(first.id,second.id);
  const redeemed=await service.redeem({reservationId:first.id,paidAmount:4500,orderTotal:4500,providerEventKey:'event-1'});
  const duplicate=await service.redeem({reservationId:first.id,paidAmount:4500,orderTotal:4500,providerEventKey:'event-1'});
  assert.equal(redeemed.status,'redeemed');
  assert.equal(duplicate.status,'redeemed');
});

test('failed payment releases reservation and paid amount mismatch is rejected',async()=>{
  const one=serviceFixture();
  const reserved=await one.service.reserve({couponId:'coupon-1',orderId:'order-1',customerKey:'guest-hash',subtotal:5000,itemCount:3,expiresAt:'2026-08-11T00:30:00.000Z'});
  await assert.rejects(()=>one.service.redeem({reservationId:reserved.id,paidAmount:5000,orderTotal:4500,providerEventKey:'event-1'}),/PAYMENT_AMOUNT_MISMATCH/);
  const released=await one.service.release({reservationId:reserved.id,reason:'payment_failed'});
  assert.equal(released.status,'released');
});

test('total and per-customer limits count active reservations',async()=>{
  const total=serviceFixture({usage:{redeemed:99,reserved:1,customerRedeemed:0,customerReserved:0}});
  await assert.rejects(()=>total.service.reserve({couponId:'coupon-1',orderId:'order-1',customerKey:'a',subtotal:5000,itemCount:3}),/COUPON_TOTAL_LIMIT_REACHED/);
  const customer=serviceFixture({usage:{redeemed:0,reserved:0,customerRedeemed:0,customerReserved:1}});
  await assert.rejects(()=>customer.service.reserve({couponId:'coupon-1',orderId:'order-2',customerKey:'a',subtotal:5000,itemCount:3}),/COUPON_CUSTOMER_LIMIT_REACHED/);
});
