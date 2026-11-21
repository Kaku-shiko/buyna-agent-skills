import {createHash} from 'node:crypto';

export const SUBSCRIPTION_API_VERSION='1.1';
const validId=value=>typeof value==='string'&&/^[-a-zA-Z0-9_]{1,120}$/.test(value);
export function assertSubscriptionIdentity(identity){if(!identity||!['projectId','sellerId','shopId'].every(key=>validId(identity[key])))throw Error('SUBSCRIPTION_SCOPE_INVALID');return identity;}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value??null;}
export function subscriptionRecordVersion(row){return 'sv1_'+createHash('sha256').update(JSON.stringify(canonical(row))).digest('hex');}
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const amount=value=>Number.isSafeInteger(value)&&value>=0?value:null;
function quotes(price){return Number.isSafeInteger(price)&&price>0?[1,6,12].map(months=>{const base=price*months,subtotal=Math.floor(base*(months===6?95:months===12?90:100)/100),tax=Math.floor(subtotal/10);return {months,base,discount:base-subtotal,subtotal,tax,gross:subtotal+tax,currency:'JPY'};}):[];}
const owned=(row,identity)=>row.projectId===identity.projectId&&row.sellerId===identity.sellerId&&(row.shopId??'default')===identity.shopId;

export function createSubscriptionSnapshot({identity,rows=[],charges=[],service=null,plans=[],now=new Date()}){
 assertSubscriptionIdentity(identity);if(!Number.isFinite(+now))throw Error('INVALID_CLOCK');
 if(rows.some(row=>!owned(row,identity))||service&&!owned(service,identity))throw Error('SUBSCRIPTION_SCOPE_MISMATCH');
 const ids=new Set(rows.map(row=>row.subscriptionId));
 if(charges.some(charge=>!ids.has(charge.subscriptionId)))throw Error('SUBSCRIPTION_BILLING_SCOPE_MISMATCH');
 const root=rows.filter(row=>!row.parentSubscriptionId&&row.checkoutFlow!=='paid_extension_v1');
 const live=root.filter(row=>['active','past_due','cancel_at_period_end'].includes(row.status)&&date(row.currentPeriodEnd));
 const ambiguous=live.length>1;
 const current=ambiguous?null:live[0]??root.slice().sort((a,b)=>String(b.createdAt??'').localeCompare(String(a.createdAt??'')))[0]??null;
 const billingHistory=charges.map(charge=>({
  id:String(charge.chargeId),subscriptionId:charge.subscriptionId,cycleKey:charge.cycleKey??null,
  status:charge.status,amountGross:amount(charge.amount),subtotal:amount(charge.subtotal),taxAmount:amount(charge.taxAmount),currency:charge.currency??null,
  ...(identity.projectId==='ectecshop'&&identity.sellerId==='ectecshop'&&['FULL_REFUND','PARTIAL_REFUND'].includes(charge.providerPaymentStatus)?{refundStatus:charge.providerPaymentStatus,refundedAmount:amount(charge.refundedAmount)}:{}),
  paidAt:date(charge.paidAt),createdAt:date(charge.createdAt),servicePeriodStart:date(charge.servicePeriodStart),servicePeriodEnd:date(charge.servicePeriodEnd),
  invoiceAvailable:charge.status==='paid'&&charge.receiptVersion==='pdf_v1'&&Boolean(date(charge.servicePeriodStart)&&date(charge.servicePeriodEnd)),
 })).sort((a,b)=>String(b.paidAt??b.createdAt??'').localeCompare(String(a.paidAt??a.createdAt??''))||a.id.localeCompare(b.id));
 const confirmed=Boolean(current?.currentPeriodStart&&date(current.currentPeriodEnd)&&['active','past_due','cancel_at_period_end','cancelled'].includes(current.status));
 const legacy=current?.checkoutFlow==='legacy_service_v1';
 const paidRecord=billingHistory.filter(charge=>charge.subscriptionId===current?.subscriptionId&&charge.status==='paid');
 const missingPaymentEvidence=confirmed&&!legacy&&paidRecord.length===0;
 const contractEnd=date(service?.endAt);
 const dateConflict=Boolean(current&&confirmed&&contractEnd&&contractEnd!==date(current.currentPeriodEnd));
 const knownNew=service?.lifecycle==='new'&&rows.length===0;
 const needsReview=ambiguous||missingPaymentEvidence||dateConflict||(!confirmed&&service?.reviewStatus==='MIGRATION_REVIEW')||(!current&&!contractEnd&&!knownNew);
 const endAt=confirmed?date(current.currentPeriodEnd):contractEnd;
 const stopping=current?.cancelAtPeriodEnd===true||['cancelled','cancel_at_period_end'].includes(current?.status);
 const agreementPresent=Boolean(current?.platformAgreementId);
 const authorized=!needsReview&&!stopping&&current?.billingEnabled===true&&agreementPresent;
 const failure=date(current?.firstRenewalFailureAt);
 const graceUntil=failure?new Date(Date.parse(failure)+72*3600000).toISOString():null;
 const expired=Boolean(endAt&&+now>=Date.parse(endAt));
 const grace=Boolean(expired&&authorized&&graceUntil&&+now<Date.parse(graceUntil));
 const serviceStatus=needsReview?'MIGRATION_REVIEW':grace?'GRACE':expired?'EXPIRED':endAt?'ACTIVE':'FREE';
 const inFlight=current?.renewalInFlight?{status:'PROCESSING'}:null;
 const queued=identity.projectId==='ectecshop'&&identity.sellerId==='ectecshop'&&identity.shopId==='default'&&current?.scheduledChange?.status==='scheduled'?current.scheduledChange:null;
 const scheduledChange=queued?{status:'scheduled',targetPlan:queued.targetPlan,targetPlanName:queued.targetPlanName,months:queued.months,effectiveAt:date(queued.effectiveAt),chargeNow:0,subtotal:amount(queued.subtotal),tax:amount(queued.tax),gross:amount(queued.gross),nextAmountGross:amount(queued.gross),currency:queued.currency,mode:'next_cycle',autoRenew:authorized,paymentMode:authorized?'automatic':'manual',requestId:queued.requestId}:null;
 const paymentStatus=inFlight?'PROCESSING':current?.status==='pending_binding'?'PENDING':current?.status==='past_due'?'FAILED':paidRecord.length?'PAID':legacy?'LEGACY_PREPAID':'UNCONFIRMED';
 const reviewReason=ambiguous?'MULTIPLE_ACTIVE_SUBSCRIPTIONS':dateConflict?'SERVICE_BILLING_DATE_CONFLICT':missingPaymentEvidence?'PAYMENT_EVIDENCE_REVIEW':needsReview?'SERVICE_DATE_REVIEW':null;
 const subscriptionRows=root.map(row=>({
  subscriptionId:row.subscriptionId,stateVersion:subscriptionRecordVersion(row),planCode:row.planCode??null,planName:row.planName??null,
  monthlyAmount:amount(row.monthlyAmount),currency:row.currency??null,status:row.status,billingMonths:[1,6,12].includes(row.billingMonths)?row.billingMonths:null,
  currentPeriodStart:date(row.currentPeriodStart),currentPeriodEnd:date(row.currentPeriodEnd),
  nextBillingAt:row.cancelAtPeriodEnd||row.billingEnabled!==true?null:date(row.nextBillingAt),billingEnabled:row.billingEnabled===true,
  cancelAtPeriodEnd:row.cancelAtPeriodEnd===true,renewalProcessing:Boolean(row.renewalInFlight),
  canExtend:!ambiguous&&!needsReview&&!row.renewalInFlight&&(!row.scheduledChange||Date.parse(row.scheduledChange.effectiveAt)<=+now)&&['active','past_due','cancel_at_period_end','cancelled'].includes(row.status)&&Boolean(date(row.currentPeriodEnd)),
 }));
 const validThrough=/^\d{4}-\d{2}-\d{2}$/.test(service?.validThrough??'')&&Date.parse(service.validThrough+'T00:00:00+09:00')+86400000===Date.parse(endAt)?service.validThrough:null;
 const result={
  apiVersion:SUBSCRIPTION_API_VERSION,identity:{projectId:identity.projectId,sellerId:identity.sellerId,shopId:identity.shopId},
  review:{required:needsReview,reason:reviewReason},
  subscription:current?{id:current.subscriptionId,recordVersion:subscriptionRecordVersion(current),status:current.status,planCode:current.planCode??null,planName:current.planName??null,billingMonths:[1,6,12].includes(current.billingMonths)?current.billingMonths:null}:null,
  fees:{currency:current?.currency??null,contractAmountGross:amount(current?.monthlyAmount),subtotal:amount(current?.monthlySubtotal),taxAmount:amount(current?.taxAmount),lastPaid:paidRecord[0]??null},
  service:{status:serviceStatus,currentPeriodStart:date(current?.currentPeriodStart),currentPeriodEnd:endAt,graceUntil,readOnly:!needsReview&&service?.enforcementEnabled===true&&expired&&!grace,paidFeaturesEnabled:needsReview||Boolean((confirmed||service?.reviewStatus==='CONFIRMED'&&endAt)&&(service?.enforcementEnabled!==true||!expired||grace)),enforcementEnabled:service?.enforcementEnabled===true},
  ...(validThrough?{serviceValidThrough:validThrough}:{}),
  payment:{status:paymentStatus,method:current?.cardBrand&&/^\d{4}$/.test(current.cardLast4??'')?{brand:String(current.cardBrand),last4:current.cardLast4}:null},
  scheduledChange,
  renewal:{enabled:authorized,authorizationStatus:authorized?'RECORDED':stopping?'CANCELLED':agreementPresent?'REVIEW_REQUIRED':'NOT_BOUND',nextBillingAt:authorized?date(current?.nextBillingAt):null,nextAmountGross:authorized?amount(queued?.gross??current?.monthlyAmount):null,inFlight},
  billingHistory,rows:subscriptionRows,
  plans:plans.map(plan=>({code:plan.code,name:plan.name,monthlyPrice:amount(plan.monthly_price),currency:plan.currency,active:plan.is_active===true,quotes:quotes(plan.monthly_price)})).sort((a,b)=>a.code.localeCompare(b.code)),
 };
 // Explicit access mode lets merchant adapters enforce the same policy on reads and writes.
 result.service.accessMode=needsReview?'REVIEW':result.service.readOnly?'RENEWAL_ONLY':'FULL';
 // Revision covers the persisted source, including changes not yet projected in the UI.
 const stateVersion=subscriptionRecordVersion({identity:result.identity,rows:rows.slice().sort((a,b)=>a.subscriptionId.localeCompare(b.subscriptionId)),charges:charges.slice().sort((a,b)=>String(a.chargeId).localeCompare(String(b.chargeId))),service,plans:result.plans});
 return {...result,stateVersion,fetchedAt:now.toISOString()};
}
