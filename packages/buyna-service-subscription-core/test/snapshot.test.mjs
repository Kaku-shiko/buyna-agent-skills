import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSubscriptionSnapshot,subscriptionRecordVersion} from '../src/snapshot.server.mjs';
const identity={projectId:'p',sellerId:'s',shopId:'default'};
const row={...identity,subscriptionId:'sub',planCode:'basic',planName:'Basic',status:'active',checkoutFlow:'paid_cit_v1',currentPeriodStart:'2026-09-30T00:00:00Z',currentPeriodEnd:'2026-10-31T00:00:00Z',nextBillingAt:'2026-10-31T00:00:00Z',monthlyAmount:4378,billingMonths:1,billingEnabled:true,platformAgreementId:'provider-secret',customer:{email:'private@example.com'}};
const charge={subscriptionId:'sub',chargeId:'c',cycleKey:'activation',status:'paid',amount:4378,currency:'JPY',paidAt:'2026-09-30T00:00:00Z'};
const load=(extra={})=>createSubscriptionSnapshot({identity,rows:[row],charges:[charge],now:new Date('2026-10-17T00:00:00Z'),...extra});

test('renewal-only access uses confirmed expiry and restores from a verified extended term',()=>{
 const service={...identity,reviewStatus:'CONFIRMED',enforcementEnabled:true};
 assert.equal(load({service,now:new Date(row.currentPeriodEnd)}).service.accessMode,'RENEWAL_ONLY');
 assert.equal(load({service}).service.accessMode,'FULL');
 assert.equal(load({service,charges:[],now:new Date(row.currentPeriodEnd)}).service.accessMode,'REVIEW');
 assert.equal(load({service:{...service,enforcementEnabled:false},now:new Date(row.currentPeriodEnd)}).service.accessMode,'FULL');
 const renewed={...row,currentPeriodEnd:'2026-11-30T00:00:00Z'};
 assert.equal(load({service,rows:[renewed],now:new Date('2026-11-01T00:00:00Z')}).service.accessMode,'FULL');
});

test('expiry without enforcement preserves merchant access without extending service or enabling billing',()=>{
 for(const status of ['active','past_due','cancel_at_period_end','expired']){
  const view=load({rows:[{...row,status,billingEnabled:false}],service:{...identity,endAt:row.currentPeriodEnd,reviewStatus:'CONFIRMED',enforcementEnabled:false},now:new Date('2027-01-01T00:00:00Z')});
  assert.equal(view.service.readOnly,false);
  assert.equal(view.service.enforcementEnabled,false);
  assert.equal(view.service.currentPeriodEnd,'2026-10-31T00:00:00.000Z');
  assert.equal(view.renewal.enabled,false);
 }
});

test('refund observation is EC-only and preserves historical payment and service dates',()=>{
 const ec={projectId:'ectecshop',sellerId:'ectecshop',shopId:'default'};
 const refunded={...charge,providerPaymentStatus:'FULL_REFUND',refundedAmount:4378};
 const view=load({identity:ec,rows:[{...row,...ec}],charges:[refunded]});
 assert.equal(view.billingHistory[0].refundStatus,'FULL_REFUND');
 assert.equal(view.billingHistory[0].refundedAmount,4378);
 assert.equal(view.billingHistory[0].status,'paid');
 assert.equal(view.service.currentPeriodEnd,'2026-10-31T00:00:00.000Z');
 assert.equal(view.fees.lastPaid.amountGross,4378);
 const other=load({charges:[refunded]});
 assert.equal(Object.hasOwn(other.billingHistory[0],'refundStatus'),false);
 assert.equal(Object.hasOwn(other.billingHistory[0],'refundedAmount'),false);
});
test('full view uses stored term, money and payment evidence without exposing credentials',()=>{const view=load();assert.equal(view.subscription.planName,'Basic');assert.equal(view.fees.lastPaid.amountGross,4378);assert.equal(view.renewal.nextBillingAt,'2026-10-31T00:00:00.000Z');assert.equal(view.renewal.authorizationStatus,'RECORDED');assert.equal(view.payment.method,null);assert.ok(!JSON.stringify(view).includes('provider-secret'));assert.ok(!JSON.stringify(view).includes('private@example.com'));});
test('source revision is deterministic and independent of refresh time',()=>{const a=load(),b=load({now:new Date('2026-10-18T00:00:00Z')});assert.equal(a.stateVersion,b.stateVersion);assert.equal(subscriptionRecordVersion({a:1,b:2}),subscriptionRecordVersion({b:2,a:1}));});
test('all consequential persisted changes invalidate stale client versions',()=>{const initial=load().stateVersion;for(const patch of [{planCode:'pro'},{currentPeriodEnd:'2026-11-30T00:00:00Z'},{nextBillingAt:'2026-11-30T00:00:00Z'},{billingEnabled:false},{platformAgreementId:'new'},{updatedAt:'2026-10-17T01:00:00Z'}])assert.notEqual(load({rows:[{...row,...patch}]}).stateVersion,initial);assert.notEqual(load({charges:[{...charge,status:'refunded'}]}).stateVersion,initial);});
test('cross-tenant rows, billing and service contracts are rejected',()=>{assert.throws(()=>load({rows:[{...row,sellerId:'other'}]}),/SCOPE_MISMATCH/);assert.throws(()=>load({charges:[{...charge,subscriptionId:'other'}]}),/BILLING_SCOPE/);assert.throws(()=>load({service:{...identity,projectId:'other'}}),/SCOPE_MISMATCH/);});
test('unknown legacy dates preserve rights and cannot authorize recurring billing',()=>{const view=load({rows:[],charges:[],service:{...identity,reviewStatus:'MIGRATION_REVIEW',enforcementEnabled:true}});assert.equal(view.service.readOnly,false);assert.equal(view.service.paidFeaturesEnabled,true);assert.equal(view.renewal.enabled,false);assert.equal(view.review.required,true);});
test('payment not completed never becomes subscription payment success',()=>{const view=load({rows:[{...row,status:'pending_binding',currentPeriodStart:undefined,currentPeriodEnd:undefined}],charges:[{...charge,status:'pending'}]});assert.equal(view.payment.status,'PENDING');assert.equal(view.review.required,false);assert.equal(view.service.status,'FREE');assert.equal(view.service.paidFeaturesEnabled,false);});
test('missing verified ledger and conflicting dates fail safely for review',()=>{assert.equal(load({charges:[]}).review.reason,'PAYMENT_EVIDENCE_REVIEW');const view=load({service:{...identity,endAt:'2026-12-31T00:00:00Z',enforcementEnabled:true}});assert.equal(view.review.reason,'SERVICE_BILLING_DATE_CONFLICT');assert.equal(view.renewal.nextBillingAt,null);assert.equal(view.service.readOnly,false);});
test('cancelled auto renewal has no next debit and keeps paid service until end',()=>{const view=load({rows:[{...row,cancelAtPeriodEnd:true,billingEnabled:false,status:'cancel_at_period_end'}]});assert.equal(view.renewal.enabled,false);assert.equal(view.renewal.nextBillingAt,null);assert.equal(view.service.currentPeriodEnd,'2026-10-31T00:00:00.000Z');});
test('72-hour grace is exact; storefront operation is outside read-only entitlement',()=>{const failed={...row,status:'past_due',firstRenewalFailureAt:'2026-10-31T00:00:00Z'};const extra={rows:[failed],service:{...identity,enforcementEnabled:true}};assert.equal(load({...extra,now:new Date('2026-11-02T23:59:59Z')}).service.status,'GRACE');const ended=load({...extra,now:new Date('2026-11-03T00:00:00Z')});assert.equal(ended.service.readOnly,true);assert.equal(ended.service.paidFeaturesEnabled,false);});
test('multiple active contracts are reviewed instead of selecting an arbitrary one',()=>{const view=load({rows:[row,{...row,subscriptionId:'second'}]});assert.equal(view.subscription,null);assert.equal(view.review.reason,'MULTIPLE_ACTIVE_SUBSCRIPTIONS');assert.equal(view.renewal.enabled,false);});
test('legacy prepaid never creates a fictional successful card payment',()=>{const view=load({rows:[{...row,checkoutFlow:'legacy_service_v1',billingEnabled:false,platformAgreementId:undefined}],charges:[]});assert.equal(view.payment.status,'LEGACY_PREPAID');assert.equal(view.fees.lastPaid,null);assert.equal(view.billingHistory.length,0);});
test('EC queue advertises next-cycle Pro while current plan, money and rights remain Basic',()=>{
 const ec={projectId:'ectecshop',sellerId:'ectecshop',shopId:'default'};
 const queued={...row,...ec,scheduledChange:{status:'scheduled',targetPlan:'pro',targetPlanName:'Pro',months:1,effectiveAt:row.currentPeriodEnd,gross:6578,subtotal:5980,tax:598,currency:'JPY',requestId:'schedule_fixture'}};
 const view=load({identity:ec,rows:[queued]});assert.equal(view.subscription.planCode,'basic');assert.equal(view.fees.contractAmountGross,4378);assert.equal(view.renewal.nextAmountGross,6578);assert.equal(view.scheduledChange.chargeNow,0);assert.equal(view.scheduledChange.targetPlanName,'Pro');assert.equal(view.scheduledChange.paymentMode,'automatic');
 const off=load({identity:ec,rows:[{...queued,billingEnabled:false,cancelAtPeriodEnd:true}]});assert.equal(off.renewal.nextAmountGross,null);assert.equal(off.scheduledChange.gross,6578);assert.equal(off.scheduledChange.paymentMode,'manual');assert.notEqual(view.stateVersion,off.stateVersion);
 assert.equal(load({rows:[{...row,scheduledChange:queued.scheduledChange}]}).scheduledChange,null);
});
