function fail(code){throw Object.assign(new Error(code),{code})}
function required(value,code){if(typeof value!=='string'||!value.trim())fail(code);return value.trim()}
function instant(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))fail('INTEGRATION_RECEIPT_TIME_INVALID');
  const day=new Date(`${value.slice(0,10)}T00:00:00Z`);
  if(!Number.isFinite(day.valueOf())||day.toISOString().slice(0,10)!==value.slice(0,10))fail('INTEGRATION_RECEIPT_TIME_INVALID');
  return Date.parse(value);
}
function foundation(checks){for(const key of ['identity','database','storage','authorization'])if(checks?.[key]!=='PASS')fail(`FOUNDATION_${key.toUpperCase()}_FAILED`)}
function validate(receipt,now){
  if(receipt?.schemaVersion!==1||!Array.isArray(receipt.completedSlices))fail('INTEGRATION_RECEIPT_INVALID');
  required(receipt.projectId,'PROJECT_ID_REQUIRED');required(receipt.sellerId,'SELLER_ID_REQUIRED');required(receipt.resourceEvidenceId,'RESOURCE_EVIDENCE_REQUIRED');foundation(receipt.foundationChecks);
  const created=instant(receipt.createdAt),updated=instant(receipt.updatedAt),expires=instant(receipt.expiresAt),current=instant(now);
  if(created>updated||updated>current||created>=expires)fail('INTEGRATION_RECEIPT_TIME_INVALID');
  if(current>=expires)fail('INTEGRATION_RECEIPT_EXPIRED');
  for(const slice of receipt.completedSlices){required(slice?.slice,'SLICE_REQUIRED');if(!Array.isArray(slice.verification)||!slice.verification.length||slice.verification.some(item=>item?.status!=='PASS'))fail('SLICE_VERIFICATION_FAILED');const at=instant(slice.completedAt);if(at<created||at>updated)fail('INTEGRATION_RECEIPT_TIME_INVALID')}
}
export function createIntegrationReceipt({projectId,sellerId,resourceEvidenceId,foundationChecks,expiresAt,now=new Date().toISOString()}={}){
  const receipt={schemaVersion:1,projectId:required(projectId,'PROJECT_ID_REQUIRED'),sellerId:required(sellerId,'SELLER_ID_REQUIRED'),resourceEvidenceId:required(resourceEvidenceId,'RESOURCE_EVIDENCE_REQUIRED'),foundationChecks:structuredClone(foundationChecks),completedSlices:[],createdAt:now,updatedAt:now,expiresAt};
  validate(receipt,now);return receipt;
}
export function addIntegrationSlice({receipt,slice,verification,files=[],now=new Date().toISOString()}={}){
  validate(receipt,now);
  if(!Array.isArray(verification)||!verification.length||verification.some(item=>item?.status!=='PASS'))fail('SLICE_VERIFICATION_FAILED');
  const next=structuredClone(receipt),key=required(slice,'SLICE_REQUIRED');next.completedSlices=next.completedSlices.filter(item=>item.slice!==key);next.completedSlices.push({slice:key,verification:structuredClone(verification),files:[...files],completedAt:now});next.updatedAt=now;return next;
}
export function requireIntegrationReceipt({receipt,resourceEvidenceId,now=new Date().toISOString()}={}){
  try{validate(receipt,now);required(resourceEvidenceId,'RESOURCE_EVIDENCE_REQUIRED')}catch(error){return{status:'blocked',code:error.code??'INTEGRATION_RECEIPT_INVALID'}}
  if(receipt.resourceEvidenceId!==resourceEvidenceId)return{status:'blocked',code:'RESOURCE_EVIDENCE_CHANGED'};
  return{status:'pass',code:'FOUNDATION_RECEIPT_REUSABLE',completedSlices:receipt.completedSlices.map(item=>item.slice)};
}
