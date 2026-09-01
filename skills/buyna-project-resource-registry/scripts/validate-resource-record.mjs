#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createHash,createPublicKey,verify as verifySignature} from 'node:crypto';
import {pathToFileURL} from 'node:url';

function scalar(raw){const value=raw.trim();if(value==='true')return true;if(value==='false')return false;if(value==='null')return null;if(/^-?\d+(?:\.\d+)?$/.test(value))return Number(value);if(/^['"].*['"]$/.test(value))return value.slice(1,-1);if(/^\{.*\}$/.test(value))return Object.fromEntries(value.slice(1,-1).split(',').filter(Boolean).map(part=>{const [key,...rest]=part.split(':');return[key.trim(),scalar(rest.join(':'))]}));return value}
export function parseSimpleYaml(text){const root={},stack=[{indent:-1,value:root}];for(const raw of String(text).split(/\r?\n/)){if(!raw.trim()||raw.trimStart().startsWith('#'))continue;const indent=raw.match(/^\s*/)[0].length,line=raw.trim(),separator=line.indexOf(':');if(separator<1)throw new Error('UNSUPPORTED_RESOURCE_YAML');while(stack.at(-1).indent>=indent)stack.pop();const key=line.slice(0,separator).trim(),rawValue=line.slice(separator+1).trim(),parent=stack.at(-1).value;if(!rawValue){parent[key]={};stack.push({indent,value:parent[key]})}else parent[key]=scalar(rawValue)}return root}
const required=(errors,value,code)=>{const normalized=String(value??'').trim().toLowerCase();if(!normalized||['unknown','unverified','pending','placeholder','tbd','todo','n/a'].includes(normalized))errors.push(code)};
const disabled=(errors,section,key,code)=>{if(section?.[key]!==false)errors.push(code)};
const placeholders=new Set(['','unknown','unverified','pending','placeholder','tbd','todo','n/a']);
const normalizedText=value=>String(value??'').trim();
const validEvidence=value=>!placeholders.has(normalizedText(value).toLowerCase());
const canonical=value=>{
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const digest=value=>createHash('sha256').update(canonical(value),'utf8').digest('hex');
const inspectionAuthorities=new WeakMap();
export function createDeploymentInspectionAuthority({publicKeyPem}={}){
  let publicKey;try{publicKey=createPublicKey(publicKeyPem)}catch{throw Object.assign(new Error('DEPLOYMENT_INSPECTION_AUTHORITY_INVALID'),{code:'DEPLOYMENT_INSPECTION_AUTHORITY_INVALID'})}
  if(publicKey.asymmetricKeyType!=='ed25519')throw Object.assign(new Error('DEPLOYMENT_INSPECTION_AUTHORITY_INVALID'),{code:'DEPLOYMENT_INSPECTION_AUTHORITY_INVALID'});
  const der=publicKey.export({type:'spki',format:'der'}),authorityId=`ed25519:${createHash('sha256').update(der).digest('hex')}`;
  const authority=Object.freeze({authorityId});inspectionAuthorities.set(authority,publicKey);return authority;
}
const regionFor=record=>normalizedText(record.deployment?.region||record.database?.region||record.storage?.region);
const targetFor=record=>{
  const type=record.architecture?.type,deployment=record.deployment??{},routing=record.routing??{};
  if(type==='shared_ec2_postgresql')return normalizedText(deployment.instance_id);
  if(type==='aws_serverless')return normalizedText(deployment.function_names);
  if(type==='aws_static')return normalizedText(routing.distribution_id);
  if(type==='external_legacy')return normalizedText(deployment.origin);
  return '';
};
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const strongDigest=value=>/^[a-f0-9]{64}$/.test(normalizedText(value))&&!/^0{64}$/.test(normalizedText(value));
function validateInspectionReceipt(receipt,record,inspectionAuthority){
  const failReceipt=code=>{throw Object.assign(new Error(code),{code})};
  if(!receipt)failReceipt('DEPLOYMENT_INSPECTION_RECEIPT_REQUIRED');
  const publicKey=inspectionAuthorities.get(inspectionAuthority);if(!publicKey)failReceipt('DEPLOYMENT_INSPECTION_AUTHORITY_REQUIRED');
  if(!exactKeys(receipt,['schemaVersion','status','account_id','region','architecture_type','target_id','ownership','runtime','sources','observed_at','authority_id','signature_algorithm','signature']))failReceipt('DEPLOYMENT_INSPECTION_RECEIPT_INVALID');
  if(receipt.schemaVersion!==1||receipt.status!=='confirmed'||!/^[0-9]{12}$/.test(normalizedText(receipt.account_id)))failReceipt('DEPLOYMENT_INSPECTION_RECEIPT_INVALID');
  if(receipt.authority_id!==inspectionAuthority.authorityId||receipt.signature_algorithm!=='Ed25519'||!/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedText(receipt.signature)))failReceipt('DEPLOYMENT_INSPECTION_SIGNATURE_INVALID');
  const signedPayload={...receipt};delete signedPayload.signature;
  let signatureValid=false;try{signatureValid=verifySignature(null,Buffer.from(canonical(signedPayload),'utf8'),publicKey,Buffer.from(receipt.signature,'base64'))}catch{}
  if(!signatureValid)failReceipt('DEPLOYMENT_INSPECTION_SIGNATURE_INVALID');
  if(receipt.region!==regionFor(record))failReceipt('DEPLOYMENT_INSPECTION_REGION_MISMATCH');
  if(receipt.architecture_type!==record.architecture?.type)failReceipt('DEPLOYMENT_INSPECTION_ARCHITECTURE_MISMATCH');
  if(receipt.target_id!==targetFor(record))failReceipt('DEPLOYMENT_INSPECTION_TARGET_MISMATCH');
  if(!exactKeys(receipt.ownership,['status','evidence_digest'])||receipt.ownership.status!=='confirmed'||!strongDigest(receipt.ownership.evidence_digest))failReceipt('DEPLOYMENT_INSPECTION_EVIDENCE_INVALID');
  if(!exactKeys(receipt.runtime,['status','evidence_digest'])||receipt.runtime.status!=='confirmed'||!strongDigest(receipt.runtime.evidence_digest))failReceipt('DEPLOYMENT_INSPECTION_EVIDENCE_INVALID');
  if(!exactKeys(receipt.sources,['sts','target','runtime'])||!Object.values(receipt.sources).every(validEvidence))failReceipt('DEPLOYMENT_INSPECTION_SOURCE_INVALID');
  if(!validEvidence(receipt.observed_at)||!Number.isFinite(Date.parse(receipt.observed_at)))failReceipt('DEPLOYMENT_INSPECTION_TIME_INVALID');
  return receipt;
}
const stableResourceIdentity=(record,accountId)=>({
  account_id:normalizedText(accountId),
  project:{id:normalizedText(record.project?.id),seller_id:normalizedText(record.project?.seller_id)},
  architecture_type:normalizedText(record.architecture?.type),
  region:regionFor(record),
  target_id:targetFor(record),
  domain:normalizedText(record.domains?.primary),
  database:{mode:normalizedText(record.database?.mode),engine:normalizedText(record.database?.engine),instance_identifier:normalizedText(record.database?.instance_identifier),name:normalizedText(record.database?.name),schema:normalizedText(record.database?.schema),table_names:normalizedText(record.database?.table_names)},
  storage:{mode:normalizedText(record.storage?.mode),provider:normalizedText(record.storage?.provider),bucket:normalizedText(record.storage?.bucket),bucket_names:normalizedText(record.storage?.bucket_names),prefix:normalizedText(record.storage?.prefix),root_source:normalizedText(record.storage?.root_source)},
  deployment:{mode:normalizedText(record.deployment?.mode),provider:normalizedText(record.deployment?.provider),instance_id:normalizedText(record.deployment?.instance_id),function_names:normalizedText(record.deployment?.function_names),origin:normalizedText(record.deployment?.origin)},
  routing:{provider:normalizedText(record.routing?.provider),distribution_id:normalizedText(record.routing?.distribution_id),ingress:normalizedText(record.routing?.ingress),runtime_source:normalizedText(record.routing?.runtime_source)},
});
const zeroCreatePolicy=record=>({
  release_limits:{new_ec2_instances:record.release_limits?.new_ec2_instances,new_databases:record.release_limits?.new_databases,new_buckets:record.release_limits?.new_buckets,new_ports:record.release_limits?.new_ports},
  allow_create:{rds:record.database?.allow_create_rds,database:record.database?.allow_create_database,schema:record.database?.allow_create_schema,bucket:record.storage?.allow_create_bucket,instance:record.deployment?.allow_create_instance,port:record.deployment?.allow_create_port,distribution:record.routing?.allow_create_distribution},
});
export const computeResourceRecordDigest=(record,{accountId}={})=>digest(stableResourceIdentity(record,accountId));
export const computeZeroCreatePolicyDigest=record=>digest(zeroCreatePolicy(record));
export function createProjectDeploymentBaseline(record,{inspectionReceipt,inspectionAuthority,inspectionReceiptPath='resources.deployment-inspection.json'}={}){
  const {projectDeploymentBaseline:_previousBaseline,...resourceWithoutBaseline}=record;
  const base=validateResourceRecord(resourceWithoutBaseline);
  if(base.status!=='pass')throw Object.assign(new Error('DEPLOYMENT_BASELINE_RESOURCE_INVALID'),{code:'DEPLOYMENT_BASELINE_RESOURCE_INVALID',errors:base.errors});
  const receipt=validateInspectionReceipt(inspectionReceipt,record,inspectionAuthority),accountId=receipt.account_id,timestamp=receipt.observed_at;
  if(!/^[A-Za-z0-9._-]+$/.test(normalizedText(inspectionReceiptPath)))throw Object.assign(new Error('DEPLOYMENT_INSPECTION_PATH_INVALID'),{code:'DEPLOYMENT_INSPECTION_PATH_INVALID'});
  const region=regionFor(record),targetId=targetFor(record);
  if(!validEvidence(region))throw Object.assign(new Error('DEPLOYMENT_BASELINE_REGION_MISSING'),{code:'DEPLOYMENT_BASELINE_REGION_MISSING'});
  if(!validEvidence(targetId))throw Object.assign(new Error('DEPLOYMENT_BASELINE_TARGET_MISSING'),{code:'DEPLOYMENT_BASELINE_TARGET_MISSING'});
  return Object.freeze({version:1,status:'confirmed',resourceRecordDigest:computeResourceRecordDigest(record,{accountId}),account_id:normalizedText(accountId),region,architecture_type:record.architecture.type,target_id:targetId,zero_create_policy_digest:computeZeroCreatePolicyDigest(record),inspection_authority_id:inspectionAuthority.authorityId,inspection_receipt_path:inspectionReceiptPath,inspection_receipt_digest:digest(receipt),verified_at:new Date(timestamp).toISOString()});
}
const validateDeploymentBaseline=(errors,record,{required:mustExist=false,inspectionReceipt,inspectionAuthority}={})=>{
  const baseline=record.projectDeploymentBaseline;
  if(!baseline){if(mustExist)errors.push('DEPLOYMENT_BASELINE_MISSING');return 'missing'}
  if(baseline.version!==1)errors.push('DEPLOYMENT_BASELINE_VERSION_INVALID');
  if(baseline.status!=='confirmed')errors.push('DEPLOYMENT_BASELINE_STATUS_INVALID');
  if(!validEvidence(baseline.account_id))errors.push('DEPLOYMENT_BASELINE_ACCOUNT_MISSING');
  if(!validEvidence(baseline.region))errors.push('DEPLOYMENT_BASELINE_REGION_MISSING');
  if(!validEvidence(baseline.target_id))errors.push('DEPLOYMENT_BASELINE_TARGET_MISSING');
  if(!validEvidence(baseline.verified_at)||!Number.isFinite(Date.parse(baseline.verified_at)))errors.push('DEPLOYMENT_BASELINE_VERIFIED_AT_INVALID');
  if(!validEvidence(baseline.inspection_receipt_path))errors.push('DEPLOYMENT_BASELINE_INSPECTION_PATH_MISSING');
  if(!validEvidence(baseline.inspection_authority_id))errors.push('DEPLOYMENT_BASELINE_INSPECTION_AUTHORITY_MISSING');
  if(!strongDigest(baseline.inspection_receipt_digest))errors.push('DEPLOYMENT_BASELINE_INSPECTION_DIGEST_INVALID');
  if(baseline.architecture_type!==record.architecture?.type)errors.push('DEPLOYMENT_BASELINE_ARCHITECTURE_MISMATCH');
  if(baseline.region!==regionFor(record))errors.push('DEPLOYMENT_BASELINE_REGION_MISMATCH');
  if(baseline.target_id!==targetFor(record))errors.push('DEPLOYMENT_BASELINE_TARGET_MISMATCH');
  if(baseline.resourceRecordDigest!==computeResourceRecordDigest(record,{accountId:baseline.account_id}))errors.push('DEPLOYMENT_BASELINE_RESOURCE_DIGEST_MISMATCH');
  if(baseline.zero_create_policy_digest!==computeZeroCreatePolicyDigest(record))errors.push('DEPLOYMENT_BASELINE_ZERO_POLICY_DIGEST_MISMATCH');
  try{
    const receipt=validateInspectionReceipt(inspectionReceipt,record,inspectionAuthority);
    if(digest(receipt)!==baseline.inspection_receipt_digest)errors.push('DEPLOYMENT_BASELINE_INSPECTION_DIGEST_MISMATCH');
    if(receipt.account_id!==baseline.account_id||receipt.region!==baseline.region||receipt.target_id!==baseline.target_id||receipt.architecture_type!==baseline.architecture_type||receipt.authority_id!==baseline.inspection_authority_id)errors.push('DEPLOYMENT_BASELINE_INSPECTION_IDENTITY_MISMATCH');
  }catch(error){errors.push(error.code||'DEPLOYMENT_INSPECTION_RECEIPT_INVALID')}
  return errors.some(code=>code.startsWith('DEPLOYMENT_BASELINE_'))?'invalid':'confirmed';
};
export function validateResourceRecord(record={},options={}){
  const errors=[],project=record.project??{},type=record.architecture?.type,database=record.database??{},storage=record.storage??{},deployment=record.deployment??{},routing=record.routing??{},limits=record.release_limits??{};
  required(errors,record.record?.version,'RECORD_VERSION_MISSING');required(errors,record.record?.checked_at,'CHECKED_AT_MISSING');required(errors,record.record?.evidence_source,'EVIDENCE_SOURCE_MISSING');required(errors,project.id,'PROJECT_ID_MISSING');required(errors,project.seller_id,'SELLER_ID_MISSING');required(errors,record.domains?.primary,'PRIMARY_DOMAIN_MISSING');
  if(!['shared_ec2_postgresql','aws_serverless','aws_static','external_legacy'].includes(type))errors.push('ARCHITECTURE_TYPE_INVALID');
  if(type==='shared_ec2_postgresql'){
    if(database.mode!=='existing'||database.engine!=='postgresql')errors.push('EXISTING_POSTGRESQL_REQUIRED');required(errors,database.instance_identifier,'RDS_IDENTIFIER_MISSING');required(errors,database.name,'DATABASE_NAME_MISSING');required(errors,database.schema,'DATABASE_SCHEMA_MISSING');required(errors,database.connection_source,'DATABASE_CONNECTION_SOURCE_MISSING');if(database.instance_identifier&&database.name===database.instance_identifier)errors.push('RDS_IDENTIFIER_USED_AS_DATABASE_NAME');disabled(errors,database,'allow_create_rds','RDS_CREATION_NOT_DISABLED');disabled(errors,database,'allow_create_database','DATABASE_CREATION_NOT_DISABLED');if(database.allow_create_schema!==false&&!(database.allow_create_schema===true&&database.schema_change_mode==='approved_reversible_migration'))errors.push('SCHEMA_CREATION_NOT_APPROVED');
    if(storage.mode!=='existing')errors.push('EXISTING_STORAGE_REQUIRED');if(storage.provider==='s3'){required(errors,storage.bucket,'STORAGE_BUCKET_MISSING');required(errors,storage.prefix,'STORAGE_PREFIX_MISSING');disabled(errors,storage,'allow_create_bucket','BUCKET_CREATION_NOT_DISABLED')}else if(storage.provider==='local_ebs'){required(errors,storage.root_source,'STORAGE_ROOT_SOURCE_MISSING');required(errors,storage.migration_status,'STORAGE_MIGRATION_STATUS_MISSING')}else errors.push('STORAGE_PROVIDER_INVALID');if(deployment.mode!=='existing'||deployment.provider!=='ec2')errors.push('EXISTING_EC2_REQUIRED');required(errors,deployment.instance_id,'INSTANCE_ID_MISSING');disabled(errors,deployment,'allow_create_instance','INSTANCE_CREATION_NOT_DISABLED');disabled(errors,deployment,'allow_create_port','PORT_CREATION_NOT_DISABLED');
    const tags=database.resource_tags;if(tags){required(errors,tags.Name,'RDS_NAME_TAG_MISSING');required(errors,tags.Project,'RDS_PROJECT_TAG_MISSING');required(errors,tags.Environment,'RDS_ENVIRONMENT_TAG_MISSING');required(errors,tags.DatabaseName,'RDS_DATABASE_NAME_TAG_MISSING');if(tags.Name!==database.instance_identifier)errors.push('RDS_NAME_TAG_MISMATCH');if(tags.DatabaseName!==database.name)errors.push('RDS_DATABASE_NAME_TAG_MISMATCH')}
  }
  if(type==='aws_serverless'){
    if(database.mode!=='existing'||database.engine!=='dynamodb')errors.push('EXISTING_DYNAMODB_REQUIRED');required(errors,database.region,'DATABASE_REGION_MISSING');required(errors,database.table_names,'DYNAMODB_TABLES_MISSING');disabled(errors,database,'allow_create_database','DATABASE_CREATION_NOT_DISABLED');if(storage.mode!=='existing'||storage.provider!=='s3')errors.push('EXISTING_STORAGE_REQUIRED');required(errors,storage.region,'STORAGE_REGION_MISSING');required(errors,storage.bucket_names,'STORAGE_BUCKETS_MISSING');disabled(errors,storage,'allow_create_bucket','BUCKET_CREATION_NOT_DISABLED');if(deployment.mode!=='existing'||!['lambda_open_next','lambda_api'].includes(deployment.provider))errors.push('EXISTING_LAMBDA_DEPLOYMENT_REQUIRED');required(errors,deployment.region,'DEPLOYMENT_REGION_MISSING');required(errors,deployment.function_names,'LAMBDA_FUNCTIONS_MISSING');disabled(errors,deployment,'allow_create_instance','INSTANCE_CREATION_NOT_DISABLED');if(routing.provider!=='cloudfront')errors.push('CLOUDFRONT_ROUTING_REQUIRED');required(errors,routing.distribution_id,'DISTRIBUTION_ID_MISSING');required(errors,routing.origin_evidence,'CLOUDFRONT_ORIGIN_EVIDENCE_MISSING');required(errors,routing.function_association_evidence,'CLOUDFRONT_ASSOCIATION_EVIDENCE_MISSING');disabled(errors,routing,'allow_create_distribution','DISTRIBUTION_CREATION_NOT_DISABLED');
  }
  if(type==='aws_static'){if(storage.mode!=='existing'||storage.provider!=='s3')errors.push('EXISTING_STORAGE_REQUIRED');required(errors,storage.bucket_names??storage.bucket,'STORAGE_BUCKETS_MISSING');disabled(errors,storage,'allow_create_bucket','BUCKET_CREATION_NOT_DISABLED');if(routing.provider!=='cloudfront')errors.push('CLOUDFRONT_ROUTING_REQUIRED');required(errors,routing.distribution_id,'DISTRIBUTION_ID_MISSING');disabled(errors,routing,'allow_create_distribution','DISTRIBUTION_CREATION_NOT_DISABLED')}
  if(type==='external_legacy'){required(errors,deployment.provider,'EXTERNAL_PROVIDER_MISSING');required(errors,deployment.origin,'EXTERNAL_ORIGIN_MISSING');required(errors,deployment.migration_status,'MIGRATION_STATUS_MISSING')}
  for(const [key,code] of Object.entries({new_ec2_instances:'NEW_EC2_INSTANCES_NOT_ZERO',new_databases:'NEW_DATABASES_NOT_ZERO',new_buckets:'NEW_BUCKETS_NOT_ZERO',new_ports:'NEW_PORTS_NOT_ZERO'})){if(limits[key]!==0)errors.push(code)}
  const serialized=JSON.stringify(record);if(/postgres(?:ql)?:\/\//i.test(serialized)||/(password|secret_access_key|credential_code)\s*[=:]/i.test(serialized))errors.push('SECRET_VALUE_FORBIDDEN');
  const deploymentBaselineStatus=validateDeploymentBaseline(errors,record,{required:options.requireDeploymentBaseline===true,inspectionReceipt:options.inspectionReceipt,inspectionAuthority:options.inspectionAuthority});
  return{status:errors.length?'blocked':'pass',code:errors.length?'RESOURCE_REGISTRY_INCOMPLETE':'RESOURCE_REGISTRY_CONFIRMED',projectId:project.id??null,architectureType:type??null,deploymentBaselineStatus,errors};
}
function baselineYaml(baseline){return `projectDeploymentBaseline:\n${Object.entries(baseline).map(([key,value])=>`  ${key}: ${typeof value==='number'?value:JSON.stringify(value)}`).join('\n')}\n`}
function replaceBaselineYaml(text,baseline){const lines=String(text).split(/\r?\n/),start=lines.findIndex(line=>/^projectDeploymentBaseline:\s*$/.test(line));if(start>=0){let end=start+1;while(end<lines.length&&(!lines[end].trim()||/^\s+/.test(lines[end])))end+=1;lines.splice(start,end-start)}while(lines.length&&lines.at(-1)==='')lines.pop();return`${lines.join('\n')}\n${baselineYaml(baseline)}`}
function atomicWrite(filePath,content){const temp=`${filePath}.${process.pid}.${Date.now()}.tmp`;try{fs.writeFileSync(temp,content,'utf8');fs.renameSync(temp,filePath)}catch(error){try{fs.rmSync(temp,{force:true})}catch{}throw error}}
const journalPathFor=absolute=>`${absolute}.deployment-baseline.transaction.json`;
const snapshotFile=filePath=>fs.existsSync(filePath)?Buffer.from(fs.readFileSync(filePath)).toString('base64'):null;
const restoreFile=(filePath,encoded)=>{if(encoded===null){fs.rmSync(filePath,{force:true});return}atomicWrite(filePath,Buffer.from(encoded,'base64').toString('utf8'))};
export function recoverProjectDeploymentBaseline({resourcePath}={}){
  const absolute=path.resolve(resourcePath),journalPath=journalPathFor(absolute);if(!fs.existsSync(journalPath))return false;
  let journal;try{journal=JSON.parse(fs.readFileSync(journalPath,'utf8'))}catch{throw Object.assign(new Error('DEPLOYMENT_BASELINE_TRANSACTION_INVALID'),{code:'DEPLOYMENT_BASELINE_TRANSACTION_INVALID'})}
  const expectedSidecar=path.join(path.dirname(absolute),`${path.basename(absolute,path.extname(absolute))}.deployment-inspection.json`),safeSnapshot=value=>value===null||(typeof value==='string'&&value.length<=16*1024*1024&&/^[A-Za-z0-9+/]*={0,2}$/.test(value));
  if(!exactKeys(journal,['version','status','resource_path','sidecar_path','previous_resource','previous_sidecar'])||journal.version!==1||journal.resource_path!==absolute||journal.sidecar_path!==expectedSidecar||!safeSnapshot(journal.previous_resource)||!safeSnapshot(journal.previous_sidecar)||!['prepared','committed'].includes(journal.status))throw Object.assign(new Error('DEPLOYMENT_BASELINE_TRANSACTION_INVALID'),{code:'DEPLOYMENT_BASELINE_TRANSACTION_INVALID'});
  if(journal.status==='prepared'){restoreFile(absolute,journal.previous_resource);restoreFile(journal.sidecar_path,journal.previous_sidecar)}
  fs.rmSync(journalPath,{force:true});return true;
}
export function writeProjectDeploymentBaseline({resourcePath,inspectionReceiptPath,inspectionAuthority,faultInjector}={}){
  const absolute=path.resolve(resourcePath);recoverProjectDeploymentBaseline({resourcePath:absolute});
  const receiptAbsolute=path.resolve(inspectionReceiptPath),text=fs.readFileSync(absolute,'utf8'),record=parseSimpleYaml(text),receipt=JSON.parse(fs.readFileSync(receiptAbsolute,'utf8'));
  const sidecarName=`${path.basename(absolute,path.extname(absolute))}.deployment-inspection.json`,sidecarPath=path.join(path.dirname(absolute),sidecarName);
  const baseline=createProjectDeploymentBaseline(record,{inspectionReceipt:receipt,inspectionAuthority,inspectionReceiptPath:sidecarName}),resourceContent=replaceBaselineYaml(text,baseline),sidecarContent=`${JSON.stringify(receipt,null,2)}\n`;
  const candidate=parseSimpleYaml(resourceContent),candidateReceipt=JSON.parse(sidecarContent),candidateResult=validateResourceRecord(candidate,{requireDeploymentBaseline:true,inspectionReceipt:candidateReceipt,inspectionAuthority});
  if(candidateResult.status!=='pass')throw Object.assign(new Error('DEPLOYMENT_BASELINE_WRITE_VALIDATION_FAILED'),{code:'DEPLOYMENT_BASELINE_WRITE_VALIDATION_FAILED',errors:candidateResult.errors});
  const journalPath=journalPathFor(absolute),journal={version:1,status:'prepared',resource_path:absolute,sidecar_path:sidecarPath,previous_resource:snapshotFile(absolute),previous_sidecar:snapshotFile(sidecarPath)};
  atomicWrite(journalPath,`${JSON.stringify(journal)}\n`);
  try{
    faultInjector?.('before-sidecar-replace');atomicWrite(sidecarPath,sidecarContent);
    faultInjector?.('before-resource-replace');atomicWrite(absolute,resourceContent);
    const persisted=parseSimpleYaml(fs.readFileSync(absolute,'utf8')),persistedReceipt=JSON.parse(fs.readFileSync(sidecarPath,'utf8')),result=validateResourceRecord(persisted,{requireDeploymentBaseline:true,inspectionReceipt:persistedReceipt,inspectionAuthority});
    if(result.status!=='pass')throw Object.assign(new Error('DEPLOYMENT_BASELINE_WRITE_VALIDATION_FAILED'),{code:'DEPLOYMENT_BASELINE_WRITE_VALIDATION_FAILED',errors:result.errors});
    atomicWrite(journalPath,`${JSON.stringify({...journal,status:'committed'})}\n`);fs.rmSync(journalPath,{force:true});return result;
  }catch(error){restoreFile(absolute,journal.previous_resource);restoreFile(sidecarPath,journal.previous_sidecar);fs.rmSync(journalPath,{force:true});throw error}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const index=process.argv.indexOf('--resource');
  if(index<0||!process.argv[index+1]){console.log(JSON.stringify({status:'failed',code:'RESOURCE_PATH_REQUIRED'}));process.exit(1)}
  try{
    const resourcePath=path.resolve(process.argv[index+1]);recoverProjectDeploymentBaseline({resourcePath});
    const writeBaseline=process.argv.includes('--write-deployment-baseline'),requireBaseline=process.argv.includes('--require-deployment-baseline');
    const record=parseSimpleYaml(fs.readFileSync(resourcePath,'utf8')),needsAuthority=writeBaseline||requireBaseline||Boolean(record.projectDeploymentBaseline);
    let inspectionAuthority;
    if(needsAuthority){const authorityPath=process.env.BUYNA_DEPLOYMENT_INSPECTION_PUBLIC_KEY_FILE;if(!authorityPath)throw Object.assign(new Error('DEPLOYMENT_INSPECTION_AUTHORITY_REQUIRED'),{code:'DEPLOYMENT_INSPECTION_AUTHORITY_REQUIRED'});inspectionAuthority=createDeploymentInspectionAuthority({publicKeyPem:fs.readFileSync(path.resolve(authorityPath),'utf8')})}
    if(writeBaseline){
      const receiptIndex=process.argv.indexOf('--inspection-receipt');if(receiptIndex<0||!process.argv[receiptIndex+1])throw Object.assign(new Error('DEPLOYMENT_INSPECTION_RECEIPT_REQUIRED'),{code:'DEPLOYMENT_INSPECTION_RECEIPT_REQUIRED'});
      console.log(JSON.stringify({...writeProjectDeploymentBaseline({resourcePath,inspectionReceiptPath:process.argv[receiptIndex+1],inspectionAuthority}),code:'DEPLOYMENT_BASELINE_WRITTEN'}));
    }else{
      const baseline=record.projectDeploymentBaseline,receiptPath=baseline?.inspection_receipt_path?path.join(path.dirname(resourcePath),baseline.inspection_receipt_path):null,inspectionReceipt=receiptPath&&fs.existsSync(receiptPath)?JSON.parse(fs.readFileSync(receiptPath,'utf8')):undefined;
      const result=validateResourceRecord(record,{requireDeploymentBaseline:requireBaseline,inspectionReceipt,inspectionAuthority});console.log(JSON.stringify(result));if(result.status!=='pass')process.exitCode=2;
    }
  }catch(error){console.log(JSON.stringify({status:'failed',code:error.code||error.message||'RESOURCE_VALIDATION_FAILED',errors:error.errors}));process.exit(1)}
}
