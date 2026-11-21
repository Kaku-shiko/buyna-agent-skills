// Display estimates are not payment authorizations. Official checkout owns final quotes.
export const catalog = Object.freeze({
  version:'2026-09-21', currency:'JPY', payee:'Buyna', paymentExecution:'official_service_only',
  plans:Object.freeze({basic:3980,pro:5980}),
  terms:Object.freeze({1:100,6:95,12:90}), taxPercent:10,
});

export function quoteDisplay(plan,months) {
  if(!Object.hasOwn(catalog.plans,plan)||!Object.hasOwn(catalog.terms,months)) throw new Error('invalid_plan_or_term');
  const base=catalog.plans[plan]*Number(months);
  const subtotal=Math.floor(base*catalog.terms[months]/100);
  const tax=Math.floor(subtotal*catalog.taxPercent/100);
  return {plan,months:Number(months),base,discount:base-subtotal,subtotal,tax,gross:subtotal+tax,payee:catalog.payee,currency:'JPY',estimate:true};
}

export function subscriptionState(record) {
  const unknown={key:'unknown',autoRenew:null,tone:'neutral',showOffers:false};
  if(!record) return unknown;
  if(record.found===false) return {key:'not_started',autoRenew:false,tone:'neutral',showOffers:true};
  const status=String(record.status||'').toLowerCase();
  if(['pending_binding','agreement_active','processing'].includes(status)) return {key:'pending',autoRenew:null,tone:'notice',showOffers:false};
  if(['past_due','failed','payment_failed'].includes(status)) return {key:'payment_failed',autoRenew:null,tone:'danger',showOffers:false};
  if(['cancelled','canceled','expired'].includes(status)) return {key:'ended',autoRenew:false,tone:'neutral',showOffers:true};
  if(['active','生效中','有効'].includes(status)||status==='cancel_at_period_end') {
    if(record.cancelAtPeriodEnd===true||status==='cancel_at_period_end') return {key:'cancel_scheduled',autoRenew:false,tone:'notice',showOffers:false};
    const enabled=record.billingEnabled===true&&record.agreementStatus==='ACTIVE';
    return {key:enabled?'subscribed':'service_active',autoRenew:enabled?true:record.billingEnabled===false?false:null,tone:'success',showOffers:false};
  }
  if(['inactive','not_started','未开通'].includes(status)) return {key:'not_started',autoRenew:false,tone:'neutral',showOffers:true};
  return unknown;
}
