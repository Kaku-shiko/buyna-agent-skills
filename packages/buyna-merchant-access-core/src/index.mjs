// This module contains no provider credentials or inferred payment results.
export const ACTIVATION = Object.freeze({unconfirmed:'开通情况待确认',merchant_confirmed:'商户已确认开通',provider_denied:'渠道反馈未开通'});
export const CONFIGURATION = Object.freeze({pending:'待完成支付配置',saved:'配置已保存',connected:'网站已接入'});
export const VERIFICATION = Object.freeze({pending:'支付接入待验证',passed:'接口验证通过',failed:'接口验证失败'});
export const STORAGE_BYTES = Object.freeze({Basic:524288000,Pro:2147483648});
const fields = ['legalName','businessType','contactName','contactEmail','provider','environment','activation','configuration','verification','verificationReason','subscriptionEnd','renewal','enabled','reason'];
const enums = {businessType:['company','individual'],provider:['globepay'],environment:['production','sandbox'],activation:Object.keys(ACTIVATION),configuration:Object.keys(CONFIGURATION),verification:Object.keys(VERIFICATION),renewal:['manual','automatic','cancel_at_end']};
export function emptyAccess() { return {legalName:'',businessType:'company',contactName:'',contactEmail:'',provider:'globepay',environment:'production',activation:'unconfirmed',configuration:'pending',verification:'pending',verificationReason:'',subscriptionEnd:'',renewal:'manual',enabled:false,reason:''}; }
export function validateAccess(input,{merchant=false}={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_ACCESS');
  const allowed=merchant?['legalName','businessType','contactName','contactEmail']:fields;
  const out={};
  for(const [key,value] of Object.entries(input)) {
    if(!allowed.includes(key))throw Error('FIELD_NOT_WRITABLE');
    if(key==='enabled'){if(typeof value!=='boolean')throw Error('INVALID_ACCESS');out[key]=value;continue;}
    if(typeof value!=='string'||value.length>500)throw Error('INVALID_ACCESS');
    const v=value.trim();
    if(enums[key]&&!enums[key].includes(v))throw Error('INVALID_ACCESS');
    if(key==='contactEmail'&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))throw Error('INVALID_EMAIL');
    if(key==='subscriptionEnd'&&v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v))throw Error('INVALID_DATE');
    out[key]=v;
  }
  return out;
}
export function updateAccess(previous,patch,{actor,expectedRevision,now=new Date().toISOString(),merchant=false}={}) {
  if(!actor||!Number.isSafeInteger(expectedRevision)||expectedRevision!==(previous?.revision??0))throw Error('REVISION_CONFLICT');
  const next={...emptyAccess(),...previous,...validateAccess(patch,{merchant})};
  if(!merchant&&!next.reason)throw Error('CHANGE_REASON_REQUIRED');
  if(next.environment!==previous?.environment&&previous){next.configuration='pending';next.verification='pending';next.verificationReason='';next.activation='unconfirmed';}
  // Verified channel results are written by a provider adapter, never an admin form.
  if(patch.verification!==undefined&&patch.verification!=='pending')throw Error('PROVIDER_EVIDENCE_REQUIRED');
  if(patch.activation==='provider_denied')throw Error('PROVIDER_EVIDENCE_REQUIRED');
  return {...next,revision:expectedRevision+1,updatedAt:now,updatedBy:actor};
}
export function accessView(record,subscription,now=Date.now()) {
  const value={...emptyAccess(),...record};
  const ended=Boolean(value.subscriptionEnd&&Date.parse(value.subscriptionEnd+'T23:59:59+09:00')<now);
  return {...value,revision:record?.revision??0,plan:subscription.plan,planStatus:subscription.planStatus,subscriptionStart:subscription.subscriptionStart,
    storageLimitBytes:STORAGE_BYTES[subscription.plan]??null,subscriptionActive:subscription.planStatus!=='停用'&&!ended,
    activationLabel:ACTIVATION[value.activation],configurationLabel:CONFIGURATION[value.configuration],verificationLabel:VERIFICATION[value.verification]};
}
