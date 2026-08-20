const placeholders=/^(unknown|unverified|pending|placeholder|tbd|todo|n\/a)$/i;
const secretPattern=/(postgres(?:ql)?:\/\/|password|secret_access_key|credential_code)/i;
function fail(code){const error=new Error(code);error.code=code;throw error}
function text(value,code){const result=String(value??'').trim();if(!result||placeholders.test(result))fail(code);if(secretPattern.test(result))fail('SECRET_VALUE_FORBIDDEN');return result}
function values(input,keys,prefix){return Object.fromEntries(keys.map(key=>[key,text(input?.[key],`${prefix}_${key.toUpperCase()}_REQUIRED`)]))}
const sharedKeys=Object.freeze(['instanceId','databaseInstanceIdentifier','databaseName','databaseConnectionSource','storageProvider','storageIdentifier','region']);
const ownedKeys=Object.freeze(['schema','runtimeIdentity','environmentSource','storagePrefix']);
export const SHARED_EVIDENCE_FIELDS=sharedKeys;
export const PROJECT_EVIDENCE_FIELDS=ownedKeys;

export function createResourceEvidenceReceipt({projectId,sellerId,architectureType,shared,projectOwned={},lifecycle='candidate',sources,observedAt=new Date().toISOString(),expiresAt}={}){
  const receipt={schemaVersion:1,projectId:text(projectId,'PROJECT_ID_REQUIRED'),sellerId:text(sellerId,'SELLER_ID_REQUIRED'),architectureType:text(architectureType,'ARCHITECTURE_TYPE_REQUIRED'),lifecycle,shared:values(shared,sharedKeys,'SHARED'),projectOwned:{},sources:values(sources,['aws','runtime','dns'],'SOURCE'),observedAt:text(observedAt,'OBSERVED_AT_REQUIRED'),expiresAt:text(expiresAt,'EXPIRES_AT_REQUIRED')};
  if(!['candidate','provisioned','verified','active'].includes(lifecycle))fail('LIFECYCLE_INVALID');
  for(const key of ownedKeys){const item=projectOwned[key];if(lifecycle==='candidate'){receipt.projectOwned[key]={status:'candidate',value:text(item?.value??item,`PROJECT_${key.toUpperCase()}_CANDIDATE_REQUIRED`)}}else{if(item?.status!=='verified')fail(`PROJECT_${key.toUpperCase()}_NOT_VERIFIED`);receipt.projectOwned[key]={status:'verified',value:text(item.value,`PROJECT_${key.toUpperCase()}_REQUIRED`)}}}
  return Object.freeze(receipt);
}

export function assessResourceEvidence({receipt,now=new Date().toISOString()}={}){
  if(!receipt)fail('RESOURCE_EVIDENCE_REQUIRED');
  const expires=Date.parse(receipt.expiresAt),current=Date.parse(now);if(!Number.isFinite(expires)||!Number.isFinite(current))fail('EVIDENCE_TIME_INVALID');
  if(current>expires)return{status:'blocked',code:'RESOURCE_EVIDENCE_EXPIRED'};
  return{status:'pass',code:receipt.lifecycle==='candidate'?'SHARED_FOUNDATION_CONFIRMED':'PROJECT_RESOURCES_CONFIRMED',lifecycle:receipt.lifecycle};
}

export function decideHumanEscalation({attempts=[]}={}){
  const required=['aws','runtime','dns'],byKind=new Map(attempts.map(item=>[item?.kind,item]));
  const notAttempted=required.filter(kind=>!byKind.has(kind));
  if(notAttempted.length)return{escalate:false,code:'AUTOMATIC_INSPECTION_REQUIRED',notAttempted};
  const missing=required.filter(kind=>!['pass'].includes(byKind.get(kind)?.status));
  return missing.length?{escalate:true,code:'AUTOMATIC_INSPECTION_EXHAUSTED',missing}:{escalate:false,code:'AUTOMATIC_INSPECTION_COMPLETE',missing:[]};
}
