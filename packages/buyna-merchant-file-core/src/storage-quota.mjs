export const MERCHANT_STORAGE_LIMITS=Object.freeze({basic:500*1024*1024,pro:2*1024*1024*1024});
function fail(code){throw Object.assign(new Error(code),{code});}
function count(value){if(!Number.isSafeInteger(value)||value<0)fail('INVALID_STORAGE_USAGE');return value;}
export function merchantStorageQuota({plan,usedBytes=0,reservedBytes=0}={}){
  if(!Object.hasOwn(MERCHANT_STORAGE_LIMITS,plan))fail('STORAGE_PLAN_UNAVAILABLE');
  const limitBytes=MERCHANT_STORAGE_LIMITS[plan],used=count(usedBytes),reserved=count(reservedBytes);
  const allocated=used+reserved;count(allocated);
  return {plan,limitBytes,usedBytes:used,reservedBytes:reserved,remainingBytes:Math.max(0,limitBytes-allocated),overLimit:allocated>limitBytes};
}
export function assertStorageCapacity(input={}){
  const quota=merchantStorageQuota(input),bytes=count(input.additionalBytes);
  if(bytes===0)fail('INVALID_STORAGE_USAGE');
  if(bytes>quota.remainingBytes)fail('STORAGE_QUOTA_EXCEEDED');
  return quota;
}
