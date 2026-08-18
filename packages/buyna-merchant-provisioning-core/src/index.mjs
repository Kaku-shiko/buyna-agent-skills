const idPattern=/^[a-z0-9][a-z0-9_-]{0,79}$/;
const placeholderPattern=/^(unknown|unverified|pending|placeholder|tbd|todo|n\/a)$/i;
const lifecycleOrder=Object.freeze(['candidate','approved','provisioned','verified','active']);

function fail(code){const error=new Error(code);error.code=code;throw error}
function text(value,code){const result=String(value??'').trim();if(!result||placeholderPattern.test(result))fail(code);return result}
function id(value,code){const result=text(value,code);if(!idPattern.test(result))fail(code);return result}
function zero(value,code){if(value!==0)fail(code);return 0}
function copy(value){return structuredClone(value)}
function requireState(state,expected){if(state?.lifecycle!==expected)fail(`LIFECYCLE_EXPECTED_${expected.toUpperCase()}`)}
function sharedFoundation(input={}){
  return Object.freeze({
    architectureType:text(input.architectureType,'ARCHITECTURE_TYPE_REQUIRED'),
    instanceId:text(input.instanceId,'INSTANCE_ID_REQUIRED'),
    databaseInstanceIdentifier:text(input.databaseInstanceIdentifier,'RDS_IDENTIFIER_REQUIRED'),
    databaseName:text(input.databaseName,'DATABASE_NAME_REQUIRED'),
    databaseConnectionSource:text(input.databaseConnectionSource,'DATABASE_CONNECTION_SOURCE_REQUIRED'),
    storageProvider:text(input.storageProvider,'STORAGE_PROVIDER_REQUIRED'),
    storageIdentifier:text(input.storageIdentifier,'STORAGE_IDENTIFIER_REQUIRED'),
    region:text(input.region,'REGION_REQUIRED'),
  });
}
function event(state,name,at,detail={}){return{state,event:{event:name,lifecycle:state.lifecycle,at,...detail}}}

export const MERCHANT_LIFECYCLE=lifecycleOrder;

export function createCandidate({projectId,sellerId,primaryHost,schemaCandidate,runtimeCandidate,storagePrefix,foundation,now=new Date().toISOString()}={}){
  const project=id(projectId,'PROJECT_ID_INVALID'),seller=id(sellerId,'SELLER_ID_INVALID'),schema=id(schemaCandidate,'SCHEMA_CANDIDATE_INVALID');
  const state={schemaVersion:1,projectId:project,sellerId:seller,primaryHost:text(primaryHost,'PRIMARY_HOST_REQUIRED'),lifecycle:'candidate',createdAt:now,updatedAt:now,sharedFoundation:sharedFoundation(foundation),projectOwned:{schema,runtimeIdentity:text(runtimeCandidate,'RUNTIME_CANDIDATE_REQUIRED'),storagePrefix:text(storagePrefix,'STORAGE_PREFIX_REQUIRED')},releaseLimits:{newEc2Instances:0,newDatabases:0,newBuckets:0,newPorts:0}};
  return event(state,'merchant_candidate_created',now);
}

export function approveCandidate({state,approvedBy,backupPlan,reversibleMigration,schemaChangeMode,now=new Date().toISOString()}={}){
  requireState(state,'candidate');
  const next=copy(state);
  next.approval={approvedBy:text(approvedBy,'APPROVER_REQUIRED'),backupPlan:text(backupPlan,'BACKUP_PLAN_REQUIRED'),reversibleMigration:text(reversibleMigration,'REVERSIBLE_MIGRATION_REQUIRED'),schemaChangeMode:text(schemaChangeMode,'SCHEMA_CHANGE_MODE_REQUIRED'),approvedAt:now};
  if(next.approval.schemaChangeMode!=='approved_reversible_migration')fail('SCHEMA_CHANGE_MODE_NOT_APPROVED');
  next.lifecycle='approved';next.updatedAt=now;
  return event(next,'merchant_candidate_approved',now,{approvedBy:next.approval.approvedBy});
}

export function recordProvisioned({state,evidence,now=new Date().toISOString()}={}){
  requireState(state,'approved');
  if(!evidence||typeof evidence!=='object')fail('PROVISIONING_EVIDENCE_REQUIRED');
  const next=copy(state);
  next.provisioning={schema:text(evidence.schema,'PROVISIONED_SCHEMA_REQUIRED'),runtimeIdentity:text(evidence.runtimeIdentity,'PROVISIONED_RUNTIME_REQUIRED'),environmentSource:text(evidence.environmentSource,'ENVIRONMENT_SOURCE_REQUIRED'),storagePrefix:text(evidence.storagePrefix,'PROVISIONED_STORAGE_PREFIX_REQUIRED'),publicTraffic:evidence.publicTraffic===true,provisionedAt:now};
  if(next.provisioning.schema!==next.projectOwned.schema)fail('PROVISIONED_SCHEMA_MISMATCH');
  if(next.provisioning.runtimeIdentity!==next.projectOwned.runtimeIdentity)fail('PROVISIONED_RUNTIME_MISMATCH');
  if(next.provisioning.storagePrefix!==next.projectOwned.storagePrefix)fail('PROVISIONED_STORAGE_PREFIX_MISMATCH');
  if(next.provisioning.publicTraffic)fail('PUBLIC_TRAFFIC_BEFORE_VERIFICATION');
  zero(evidence.newEc2Instances,'NEW_EC2_INSTANCES_NOT_ZERO');zero(evidence.newDatabases,'NEW_DATABASES_NOT_ZERO');zero(evidence.newBuckets,'NEW_BUCKETS_NOT_ZERO');zero(evidence.newPorts,'NEW_PORTS_NOT_ZERO');
  next.lifecycle='provisioned';next.updatedAt=now;
  return event(next,'merchant_provisioned',now);
}

export function recordVerified({state,checks,requiredChecks=['existingMerchantRegression','tenantIsolation','adminLogin','storage','orders','rollback'],now=new Date().toISOString()}={}){
  requireState(state,'provisioned');
  if(!checks||typeof checks!=='object'||Array.isArray(checks))fail('VERIFICATION_CHECKS_REQUIRED');
  for(const key of requiredChecks){if(checks[key]!=='PASS')fail(`CHECK_FAILED_${key.toUpperCase()}`)}
  for(const [key,value] of Object.entries(checks)){if(!['PASS','N/A','DISABLED'].includes(value))fail(`CHECK_INVALID_${key.toUpperCase()}`)}
  const next=copy(state);next.verification={checks:copy(checks),requiredChecks:[...requiredChecks],verifiedAt:now};next.lifecycle='verified';next.updatedAt=now;
  return event(next,'merchant_verified',now);
}

export function activateMerchant({state,release,rollback,verifiedHost,now=new Date().toISOString()}={}){
  requireState(state,'verified');
  const host=text(verifiedHost,'VERIFIED_HOST_REQUIRED');if(host!==state.primaryHost)fail('VERIFIED_HOST_MISMATCH');
  const next=copy(state);next.activation={release:text(release,'RELEASE_REQUIRED'),rollback:text(rollback,'ROLLBACK_REQUIRED'),host,activatedAt:now};next.lifecycle='active';next.updatedAt=now;
  return event(next,'merchant_activated',now,{host});
}
