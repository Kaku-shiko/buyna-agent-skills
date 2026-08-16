const identifier=/^[a-z_][a-z0-9_]{0,62}$/;
const owner=/^[a-z0-9][a-z0-9-]{0,79}$/;
const placeholder=/^(unknown|unverified|pending|placeholder|tbd|todo|n\/a)$/i;

function confirmed(value,code,pattern){const text=String(value??'').trim();if(!text||placeholder.test(text)||!pattern.test(text))throw new Error(code);return text}

export function validateExistingSchemaMigration(input={}){
  const projectId=confirmed(input.projectId,'PROJECT_ID_REQUIRED',owner),sellerId=confirmed(input.sellerId,'SELLER_ID_REQUIRED',owner),database=confirmed(input.database,'DATABASE_NAME_REQUIRED',identifier),sourceSchema=confirmed(input.sourceSchema,'SOURCE_SCHEMA_REQUIRED',identifier),targetSchema=confirmed(input.targetSchema,'TARGET_SCHEMA_REQUIRED',identifier);
  if(input.resourceMode!=='existing_buyna_resources')throw new Error('EXISTING_RESOURCE_MODE_REQUIRED');
  if(sourceSchema===targetSchema)throw new Error('DISTINCT_TARGET_SCHEMA_REQUIRED');
  if(input.targetDatabase&&input.targetDatabase!==database)throw new Error('CROSS_DATABASE_MIGRATION_FORBIDDEN');
  for(const key of ['newEc2Instances','newDatabases','newBuckets','newPorts'])if(input[key]!==0)throw new Error(`${key.toUpperCase()}_MUST_BE_ZERO`);
  if(input.allowCreateRds!==false||input.allowCreateDatabase!==false)throw new Error('INFRASTRUCTURE_CREATION_NOT_DISABLED');
  if(input.approval!=='approved_reversible_migration')throw new Error('REVERSIBLE_MIGRATION_APPROVAL_REQUIRED');
  return Object.freeze({projectId,sellerId,database,sourceSchema,targetSchema,searchPath:`${targetSchema},public`,writeMode:'source_only_until_cutover'});
}

export function assertCutoverEvidence(evidence={}){
  const required=['backupChecksum','sourceDigest','targetDigest','changeLogMaxSeq','replayedSeq','candidateHealth'];
  for(const key of required)if(evidence[key]===undefined||evidence[key]===null||evidence[key]===''||placeholder.test(String(evidence[key])))throw new Error(`CUTOVER_EVIDENCE_MISSING:${key}`);
  if(evidence.sourceDigest!==evidence.targetDigest)throw new Error('SOURCE_TARGET_DIGEST_MISMATCH');
  if(String(evidence.changeLogMaxSeq)!==String(evidence.replayedSeq))throw new Error('CHANGE_LOG_NOT_CAUGHT_UP');
  if(evidence.candidateHealth!=='pass')throw new Error('CANDIDATE_HEALTH_FAILED');
  return Object.freeze({status:'ready',rollbackRequired:true});
}

export function assertOwnedRows(rows,{projectId,sellerId}){
  const failures=[];
  for(const [index,row] of (rows??[]).entries())if(row.project_id!==projectId||(Object.hasOwn(row,'seller_id')&&String(row.seller_id)!==String(sellerId)))failures.push(index);
  if(failures.length)throw new Error(`CROSS_MERCHANT_ROWS:${failures.join(',')}`);
  return true;
}
