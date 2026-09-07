import crypto from 'node:crypto';

export const GLOBEPAY_JAPAN_API_BASE='https://pay.globepay.co.jp/api/v1.0';
const paymentMethods=new Set(['wechat','alipay','card']);
const trustedStatusEvents=new Set(['notify','query','reconcile']);
const refundCodes=new Set(['FULL_REFUND','FULL_REFUNDED','PARTIAL_REFUND']);

function trim(value){return String(value??'').trim()}
function httpsUrl(value){try{return new URL(trim(value)).protocol==='https:'}catch{return false}}
function issue(code,field){return{code,field}}
function codedError(code){const error=new Error(code);error.code=code;throw error}

export function validateConfig(input={}){
  const baseUrl=trim(input.baseUrl).replace(/\/+$/,'');
  const currency=trim(input.currency).toUpperCase();
  const errors=[];
  if(baseUrl!==GLOBEPAY_JAPAN_API_BASE)errors.push(issue('INVALID_BASE_URL','baseUrl'));
  if(!['JPY','CNY'].includes(currency))errors.push(issue('INVALID_CURRENCY','currency'));
  if(!httpsUrl(input.notifyUrl))errors.push(issue('INVALID_NOTIFY_URL','notifyUrl'));
  if(!httpsUrl(input.returnUrl))errors.push(issue('INVALID_RETURN_URL','returnUrl'));
  if(!trim(input.partnerCode))errors.push(issue('MISSING_PARTNER_CODE','partnerCode'));
  if(!trim(input.credentialCode))errors.push(issue('MISSING_CREDENTIAL_CODE','credentialCode'));
  return{
    status:errors.length?'blocked':'pass',
    code:errors.length?'CONFIG_INVALID':'CONFIG_VALID',
    baseUrl:baseUrl===GLOBEPAY_JAPAN_API_BASE?GLOBEPAY_JAPAN_API_BASE:null,
    currency:currency||null,
    partnerCodeConfigured:Boolean(trim(input.partnerCode)),
    credentialCodeConfigured:Boolean(trim(input.credentialCode)),
    notifyUrlConfigured:Boolean(trim(input.notifyUrl)),
    returnUrlConfigured:Boolean(trim(input.returnUrl)),
    errors,
  };
}

export function buildAuthParams({partnerCode,credentialCode,time=Date.now(),nonce=crypto.randomBytes(18).toString('base64url')}={}){
  const partner=trim(partnerCode),credential=trim(credentialCode),timestamp=trim(time),nonceValue=trim(nonce);
  if(!partner)codedError('MISSING_PARTNER_CODE');
  if(!credential)codedError('MISSING_CREDENTIAL_CODE');
  if(!/^\d{13}$/.test(timestamp))codedError('INVALID_SIGNING_TIME');
  if(!/^[A-Za-z0-9_-]{6,128}$/.test(nonceValue))codedError('INVALID_NONCE');
  const sign=crypto.createHash('sha256').update(`${partner}&${timestamp}&${nonceValue}&${credential}`,'utf8').digest('hex');
  return{partner_code:partner,time:timestamp,nonce_str:nonceValue,sign};
}

export function planCheckout({paymentMethod,context='desktop',enabledMethods}={}){
  const method=trim(paymentMethod).toLowerCase();
  if(!paymentMethods.has(method))codedError('INVALID_PAYMENT_METHOD');
  if(enabledMethods&&enabledMethods[method]!==true)codedError('PAYMENT_METHOD_NOT_ENABLED');
  if(method==='wechat'&&context==='alipay_browser')codedError('PAYMENT_CONTEXT_MISMATCH');
  if(method==='alipay'&&context==='wechat_browser')codedError('PAYMENT_CONTEXT_MISMATCH');
  if(method==='card')return{status:'pass',paymentMethod:method,context,channel:'Card',endpointFamily:'pre_card_orders',nextAction:'redirect'};
  const channel=method==='wechat'?'Wechat':'Alipay';
  if(context===`${method}_browser`)return{status:'pass',paymentMethod:method,context,channel,endpointFamily:'jsapi_gateway',nextAction:'invoke_jsapi'};
  if(context==='mobile')return{status:'pass',paymentMethod:method,context,channel,endpointFamily:'h5_payment',nextAction:'redirect'};
  return{status:'pass',paymentMethod:method,context,channel,endpointFamily:'gateway',nextAction:'show_qr'};
}

// Server-only: use the provider's pay_url, never reconstruct it from system order_id.
export function buildProviderPayUrl({httpStatus,response,partnerCode,credentialCode,merchantOrderId,endpointFamily,redirectUrl,amount,currency,existingOrder,time,nonce}={}){
  if(!Number.isInteger(httpStatus)||httpStatus<200||httpStatus>=300||response?.return_code!=='SUCCESS')codedError('PROVIDER_CREATE_REJECTED');
  if(!['SUCCESS','EXISTS'].includes(response?.result_code))codedError('PROVIDER_CREATE_REJECTED');
  const partner=trim(partnerCode),merchantOrder=trim(merchantOrderId);
  if(!partner)codedError('MISSING_PARTNER_CODE');
  if(!merchantOrder)codedError('MISSING_MERCHANT_ORDER_ID');
  if(response.partner_code!==partner||response.partner_order_id!==merchantOrder)codedError('PROVIDER_ORDER_IDENTITY_MISMATCH');
  const providerOrderId=trim(response.order_id);
  if(!providerOrderId)codedError('MISSING_PROVIDER_ORDER_ID');
  if(response.result_code==='EXISTS'){
    if(!existingOrder)codedError('PROVIDER_EXISTING_ORDER_QUERY_REQUIRED');
    if(!Number.isSafeInteger(amount)||amount<1||!trim(currency)||
      existingOrder.partnerCode!==partner||existingOrder.merchantOrderId!==merchantOrder||
      existingOrder.amount!==amount||existingOrder.currency!==currency||
      existingOrder.status!=='pending_payment')codedError('PROVIDER_EXISTING_ORDER_MISMATCH');
  }
  if(!httpsUrl(redirectUrl))codedError('INVALID_REDIRECT_URL');
  const paths={
    gateway:`/api/v1.0/gateway/partners/${encodeURIComponent(partner)}/orders/${encodeURIComponent(merchantOrder)}/pay`,
    h5_payment:`/api/v1.0/h5_payment/partners/${encodeURIComponent(partner)}/orders/${encodeURIComponent(merchantOrder)}/pay`,
    pre_card_orders:`/api/v1.0/channels/card/partners/${encodeURIComponent(partner)}/gateway_orders/${encodeURIComponent(merchantOrder)}/view`,
  };
  if(!paths[endpointFamily])codedError('PROVIDER_PAY_URL_FAMILY_UNSUPPORTED');
  let payUrl;
  try{payUrl=new URL(response.pay_url)}catch{codedError('PROVIDER_PAY_URL_REQUIRED')}
  if(payUrl.origin!=='https://pay.globepay.co.jp'||payUrl.username||payUrl.password||payUrl.hash||payUrl.pathname!==paths[endpointFamily])codedError('PROVIDER_PAY_URL_MISMATCH');
  const auth=buildAuthParams({partnerCode:partner,credentialCode,time,nonce});
  for(const key of ['time','nonce_str','sign'])payUrl.searchParams.set(key,auth[key]);
  payUrl.searchParams.set('redirect',trim(redirectUrl));
  return{merchantOrderId:merchantOrder,providerOrderId,payUrl:payUrl.href};
}

export function evaluateProviderStatus({currentStatus,resultCode,eventType,paidAmount,refundedAmount,refundAmount}={}){
  const current=trim(currentStatus)||'pending_payment',result=trim(resultCode).toUpperCase(),event=trim(eventType).toLowerCase();
  if(!trustedStatusEvents.has(event))return{status:'blocked',code:'UNTRUSTED_PAYMENT_EVENT',currentStatus:current,nextStatus:current,effects:[]};
  let next=current,effects=[];
  if(current==='refunded')next='refunded';
  else if(refundCodes.has(result)&&['paid','partially_refunded'].includes(current)){
    const valid=Number.isSafeInteger(paidAmount)&&paidAmount>0&&Number.isSafeInteger(refundedAmount)&&refundedAmount>=0&&Number.isSafeInteger(refundAmount)&&refundAmount>0&&refundAmount>=refundedAmount&&refundAmount<=paidAmount;
    if(!valid)return{status:'blocked',code:'REFUND_AMOUNT_INVALID',currentStatus:current,nextStatus:current,effects:[]};
    if((result==='PARTIAL_REFUND'&&refundAmount>=paidAmount)||(result!=='PARTIAL_REFUND'&&refundAmount!==paidAmount))return{status:'blocked',code:'REFUND_STATUS_MISMATCH',currentStatus:current,nextStatus:current,effects:[]};
    if(refundAmount>refundedAmount){next=refundAmount===paidAmount?'refunded':'partially_refunded';effects=['upsert_payment','record_refund'];}
  }
  else if(result==='PAY_SUCCESS'&&current!=='partially_refunded'){next='paid';effects=['upsert_payment','upsert_paid_record','apply_inventory_once'];}
  else if(result==='CLOSED'&&!['paid','partially_refunded','refunded'].includes(current)){next='cancelled';effects=['upsert_payment'];}
  else if(['PAY_FAIL','CREATE_FAIL'].includes(result)&&!['paid','partially_refunded','refunded'].includes(current)){next='failed';effects=['upsert_payment'];}
  return{status:'pass',code:next===current?'NO_STATUS_CHANGE':'STATUS_TRANSITION',currentStatus:current,nextStatus:next,effects,...(effects.includes('record_refund')?{refundDelta:refundAmount-refundedAmount,cumulativeRefundAmount:refundAmount}:{})};
}

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}

export function buildIdempotencyKey({providerOrderId,eventType,resultCode,payload}={}){
  if(!trim(providerOrderId))codedError('MISSING_PROVIDER_ORDER_ID');
  return crypto.createHash('sha256').update(JSON.stringify(stable({providerOrderId:trim(providerOrderId),eventType:trim(eventType).toLowerCase(),resultCode:trim(resultCode).toUpperCase(),payload:payload??null})),'utf8').digest('hex');
}

export function validateRecurring(input={}){
  const errors=[];
  if(!Number.isInteger(Number(input.price))||Number(input.price)<=0)errors.push(issue('INVALID_PRICE','price'));
  if(!/^\d+[mhd]$/.test(trim(input.expire)))errors.push(issue('INVALID_EXPIRE','expire'));
  if(!httpsUrl(input.notifyUrl)||trim(input.notifyUrl).startsWith('='))errors.push(issue('INVALID_NOTIFY_URL','notifyUrl'));
  if(!httpsUrl(input.redirectUrl))errors.push(issue('INVALID_REDIRECT_URL','redirectUrl'));
  if(!trim(input.merchantAgreementId))errors.push(issue('MISSING_MERCHANT_AGREEMENT_ID','merchantAgreementId'));
  if(input.consumerConsent!==true)errors.push(issue('CONSUMER_CONSENT_REQUIRED','consumerConsent'));
  return{status:errors.length?'blocked':'pass',code:errors.length?'RECURRING_INPUT_INVALID':'RECURRING_INPUT_VALID',errors};
}
