import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,sign} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {
  createProjectDeploymentBaseline,
  createDeploymentInspectionAuthority,
  parseSimpleYaml,
  validateResourceRecord,
  writeProjectDeploymentBaseline,
} from './validate-resource-record.mjs';

const evidence={version:1,checked_at:'2026-08-15T00:00:00Z',evidence_source:'aws-inspection'};
const zeroLimits={new_ec2_instances:0,new_databases:0,new_buckets:0,new_ports:0};

test('accepts an existing shared RDS project',()=>{
  const result=validateResourceRecord({record:evidence,project:{id:'shop',seller_id:'seller'},architecture:{type:'shared_ec2_postgresql'},domains:{primary:'shop.example'},database:{mode:'existing',engine:'postgresql',instance_identifier:'shared-prod-postgres',name:'commerce',schema:'shop',connection_source:'DATABASE_URL',allow_create_rds:false,allow_create_database:false,allow_create_schema:false},storage:{mode:'existing',provider:'s3',bucket:'shared-assets',prefix:'projects/shop/sellers/seller/',allow_create_bucket:false},deployment:{mode:'existing',provider:'ec2',instance_id:'i-existing',allow_create_instance:false,allow_create_port:false},release_limits:zeroLimits});
  assert.equal(result.status,'pass');
});

test('accepts a registered serverless project without forcing RDS or EC2',()=>{
  const result=validateResourceRecord({record:evidence,project:{id:'blue',seller_id:'blue'},architecture:{type:'aws_serverless'},domains:{primary:'blue.example'},database:{mode:'existing',engine:'dynamodb',region:'ap-northeast-1',table_names:'commerce,cache',allow_create_database:false},storage:{mode:'existing',provider:'s3',region:'ap-northeast-1',bucket_names:'assets,images',allow_create_bucket:false},deployment:{mode:'existing',provider:'lambda_open_next',region:'ap-northeast-1',function_names:'server,image',allow_create_instance:false},routing:{provider:'cloudfront',distribution_id:'E123',origin_evidence:'distribution-export',function_association_evidence:'behavior-export',allow_create_distribution:false},release_limits:zeroLimits});
  assert.equal(result.status,'pass');
});

test('accepts verified local EBS storage without inventing an S3 bucket',()=>{
  const result=validateResourceRecord({record:evidence,project:{id:'legacy',seller_id:'legacy'},architecture:{type:'shared_ec2_postgresql'},domains:{primary:'legacy.example'},database:{mode:'existing',engine:'postgresql',instance_identifier:'shared-prod-postgres',name:'commerce',schema:'legacy',connection_source:'DATABASE_URL',allow_create_rds:false,allow_create_database:false,allow_create_schema:false},storage:{mode:'existing',provider:'local_ebs',root_source:'APP_UPLOAD_ROOT',migration_status:'retained'},deployment:{mode:'existing',provider:'ec2',instance_id:'i-existing',allow_create_instance:false,allow_create_port:false},release_limits:zeroLimits});
  assert.equal(result.status,'pass');
});

test('unknown required serverless values remain blocked',()=>{
  const result=validateResourceRecord({record:{version:1,checked_at:'unknown',evidence_source:'unknown'},project:{id:'blue',seller_id:'blue'},architecture:{type:'aws_serverless'},domains:{primary:'unknown'},database:{mode:'existing',engine:'dynamodb',region:'unknown',table_names:'unknown',allow_create_database:false},storage:{mode:'existing',provider:'s3',region:'unknown',bucket_names:'unknown',allow_create_bucket:false},deployment:{mode:'existing',provider:'lambda_open_next',region:'unknown',function_names:'unknown',allow_create_instance:false},routing:{provider:'cloudfront',distribution_id:'unknown',origin_evidence:'unknown',function_association_evidence:'unknown',allow_create_distribution:false}});
  assert.equal(result.status,'blocked');
  assert.ok(result.errors.includes('DISTRIBUTION_ID_MISSING'));
});

test('blocks confused identifiers, unapproved schema creation, and embedded secrets',()=>{
  const record=parseSimpleYaml(`record: {version: 1, checked_at: 2026-08-15, evidence_source: audit}\nproject: {id: shop, seller_id: seller}\narchitecture: {type: shared_ec2_postgresql}\ndomains: {primary: shop.example}\ndatabase:\n  mode: existing\n  engine: postgresql\n  instance_identifier: shared-prod-postgres\n  name: shared-prod-postgres\n  schema: shop\n  connection_source: postgresql://user:password@example/db\n  allow_create_rds: false\n  allow_create_database: false\n  allow_create_schema: true\nstorage:\n  mode: existing\n  bucket: assets\n  prefix: projects/shop/\n  allow_create_bucket: false\ndeployment:\n  mode: existing\n  provider: ec2\n  instance_id: i-existing\n  allow_create_instance: false`);
  const result=validateResourceRecord(record);
  assert.equal(result.status,'blocked');
  assert.ok(result.errors.includes('RDS_IDENTIFIER_USED_AS_DATABASE_NAME'));
  assert.ok(result.errors.includes('SCHEMA_CREATION_NOT_APPROVED'));
  assert.ok(result.errors.includes('SECRET_VALUE_FORBIDDEN'));
});

test('blocks placeholders and every non-zero infrastructure counter',()=>{
  const result=validateResourceRecord({record:{...evidence,evidence_source:'placeholder'},project:{id:'shop',seller_id:'seller'},architecture:{type:'shared_ec2_postgresql'},domains:{primary:'shop.example'},database:{mode:'existing',engine:'postgresql',instance_identifier:'shared',name:'commerce',schema:'shop',connection_source:'DATABASE_URL',allow_create_rds:false,allow_create_database:false,allow_create_schema:false},storage:{mode:'existing',provider:'s3',bucket:'assets',prefix:'projects/shop/',allow_create_bucket:false},deployment:{mode:'existing',provider:'ec2',instance_id:'i-existing',allow_create_instance:false,allow_create_port:true},release_limits:{new_ec2_instances:1,new_databases:0,new_buckets:0,new_ports:1}});
  assert.equal(result.status,'blocked');
  assert.ok(result.errors.includes('EVIDENCE_SOURCE_MISSING'));
  assert.ok(result.errors.includes('PORT_CREATION_NOT_DISABLED'));
  assert.ok(result.errors.includes('NEW_EC2_INSTANCES_NOT_ZERO'));
  assert.ok(result.errors.includes('NEW_PORTS_NOT_ZERO'));
});

test('validates optional RDS resource tags against active identifiers',()=>{
  const base={record:evidence,project:{id:'shop',seller_id:'seller'},architecture:{type:'shared_ec2_postgresql'},domains:{primary:'shop.example'},database:{mode:'existing',engine:'postgresql',instance_identifier:'shared-prod-postgres',name:'commerce',schema:'shop',connection_source:'DATABASE_URL',allow_create_rds:false,allow_create_database:false,allow_create_schema:false},storage:{mode:'existing',provider:'s3',bucket:'shared-assets',prefix:'projects/shop/sellers/seller/',allow_create_bucket:false},deployment:{mode:'existing',provider:'ec2',instance_id:'i-existing',allow_create_instance:false,allow_create_port:false},release_limits:zeroLimits};
  const pass=validateResourceRecord({...base,database:{...base.database,resource_tags:{Name:'shared-prod-postgres',Project:'shared-merchants',Environment:'production',DatabaseName:'commerce'}}});
  assert.equal(pass.status,'pass');
  const blocked=validateResourceRecord({...base,database:{...base.database,resource_tags:{Name:'old-rds',Project:'shared-merchants',Environment:'production',DatabaseName:'old_database'}}});
  assert.equal(blocked.status,'blocked');
  assert.ok(blocked.errors.includes('RDS_NAME_TAG_MISMATCH'));
  assert.ok(blocked.errors.includes('RDS_DATABASE_NAME_TAG_MISMATCH'));
});

const sharedRecord=()=>({record:{...evidence},project:{id:'shop',seller_id:'seller'},architecture:{type:'shared_ec2_postgresql'},domains:{primary:'shop.example'},database:{mode:'existing',engine:'postgresql',region:'ap-northeast-1',instance_identifier:'shared-prod-postgres',name:'commerce',schema:'shop',connection_source:'DATABASE_URL',allow_create_rds:false,allow_create_database:false,allow_create_schema:false},storage:{mode:'existing',provider:'s3',region:'ap-northeast-1',bucket:'shared-assets',prefix:'projects/shop/sellers/seller/',allow_create_bucket:false},deployment:{mode:'existing',provider:'ec2',region:'ap-northeast-1',instance_id:'i-existing',instance_ip:'203.0.113.10',allow_create_instance:false,allow_create_port:false},routing:{ingress:'nginx',runtime_source:'shop.service'},release_limits:{...zeroLimits}});
const keys=generateKeyPairSync('ed25519'),publicKeyPem=keys.publicKey.export({type:'spki',format:'pem'}),inspectionAuthority=createDeploymentInspectionAuthority({publicKeyPem});
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const inspectionReceipt=(overrides={})=>{const payload={schemaVersion:1,status:'confirmed',account_id:'123456789012',region:'ap-northeast-1',architecture_type:'shared_ec2_postgresql',target_id:'i-existing',ownership:{status:'confirmed',evidence_digest:'1'.repeat(64)},runtime:{status:'confirmed',evidence_digest:'2'.repeat(64)},sources:{sts:'aws-sts-get-caller-identity',target:'aws-describe-instances',runtime:'ssm-read-only-runtime-inspection'},observed_at:'2026-09-02T00:00:00Z',authority_id:inspectionAuthority.authorityId,signature_algorithm:'Ed25519',...overrides};return{...payload,signature:sign(null,Buffer.from(canonical(payload)),keys.privateKey).toString('base64')}};

test('creates and validates a reusable deployment baseline from stable resource identity',()=>{
  const record=sharedRecord();
  record.projectDeploymentBaseline=createProjectDeploymentBaseline(record,{inspectionReceipt:inspectionReceipt(),inspectionAuthority});
  const result=validateResourceRecord(record,{requireDeploymentBaseline:true,inspectionReceipt:inspectionReceipt(),inspectionAuthority});
  assert.equal(result.status,'pass');
  assert.equal(result.deploymentBaselineStatus,'confirmed');
});

test('mutable IP and evidence time do not invalidate the deployment baseline',()=>{
  const record=sharedRecord();
  record.projectDeploymentBaseline=createProjectDeploymentBaseline(record,{inspectionReceipt:inspectionReceipt(),inspectionAuthority});
  record.deployment.instance_ip='198.51.100.25';
  record.record.checked_at='2026-09-03T00:00:00Z';
  assert.equal(validateResourceRecord(record,{requireDeploymentBaseline:true,inspectionReceipt:inspectionReceipt(),inspectionAuthority}).status,'pass');
});

test('stable resource or zero-create policy changes invalidate the deployment baseline',()=>{
  for(const mutate of [
    record=>{record.deployment.instance_id='i-other'},
    record=>{record.deployment.region='us-east-1'},
    record=>{record.release_limits.new_ports=1},
  ]){
    const record=sharedRecord();
    record.projectDeploymentBaseline=createProjectDeploymentBaseline(record,{inspectionReceipt:inspectionReceipt(),inspectionAuthority});
    mutate(record);
    const result=validateResourceRecord(record,{requireDeploymentBaseline:true,inspectionReceipt:inspectionReceipt(),inspectionAuthority});
    assert.equal(result.status,'blocked');
    assert.ok(result.errors.some(code=>code.includes('BASELINE')||code.includes('NOT_ZERO')));
  }
});

test('an existing baseline can be rewritten from a new trusted receipt',()=>{
  const record=sharedRecord(),firstReceipt=inspectionReceipt();
  record.projectDeploymentBaseline=createProjectDeploymentBaseline(record,{inspectionReceipt:firstReceipt,inspectionAuthority});
  const nextReceipt=inspectionReceipt({observed_at:'2026-09-03T00:00:00Z'});
  record.projectDeploymentBaseline=createProjectDeploymentBaseline(record,{inspectionReceipt:nextReceipt,inspectionAuthority});
  assert.equal(validateResourceRecord(record,{requireDeploymentBaseline:true,inspectionReceipt:nextReceipt,inspectionAuthority}).status,'pass');
});

test('an approved target and region migration replaces rather than validates the old baseline',()=>{
  const record=sharedRecord(),firstReceipt=inspectionReceipt();
  record.projectDeploymentBaseline=createProjectDeploymentBaseline(record,{inspectionReceipt:firstReceipt,inspectionAuthority});
  record.deployment.instance_id='i-migrated';record.deployment.region='us-east-1';record.database.region='us-east-1';record.storage.region='us-east-1';
  const migratedReceipt=inspectionReceipt({target_id:'i-migrated',region:'us-east-1'});
  record.projectDeploymentBaseline=createProjectDeploymentBaseline(record,{inspectionReceipt:migratedReceipt,inspectionAuthority});
  const result=validateResourceRecord(record,{requireDeploymentBaseline:true,inspectionReceipt:migratedReceipt,inspectionAuthority});
  assert.equal(result.status,'pass');assert.equal(record.projectDeploymentBaseline.target_id,'i-migrated');assert.equal(record.projectDeploymentBaseline.region,'us-east-1');
});

test('baseline creation rejects free-text identity and mismatched or weak inspection receipts',()=>{
  assert.throws(()=>createProjectDeploymentBaseline(sharedRecord(),{accountId:'123456789012'}),error=>error.code==='DEPLOYMENT_INSPECTION_RECEIPT_REQUIRED');
  assert.throws(()=>createProjectDeploymentBaseline(sharedRecord(),{inspectionReceipt:{...inspectionReceipt(),target_id:'i-other'},inspectionAuthority}),error=>error.code==='DEPLOYMENT_INSPECTION_SIGNATURE_INVALID');
  assert.throws(()=>createProjectDeploymentBaseline(sharedRecord(),{inspectionReceipt:{...inspectionReceipt(),ownership:{status:'confirmed',evidence_digest:'0'.repeat(64)}},inspectionAuthority}),error=>error.code==='DEPLOYMENT_INSPECTION_SIGNATURE_INVALID');
  assert.throws(()=>createProjectDeploymentBaseline(sharedRecord(),{inspectionReceipt:inspectionReceipt()}),error=>error.code==='DEPLOYMENT_INSPECTION_AUTHORITY_REQUIRED');
});

test('CLI atomically writes and immediately validates a deployment baseline',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'buyna-resource-baseline-'));
  try{
    const resourcePath=path.join(root,'resources.yaml'),receiptPath=path.join(root,'inspection.json'),publicKeyPath=path.join(root,'inspection-public.pem');
    writeFileSync(resourcePath,`record: {version: 1, checked_at: 2026-09-02T00:00:00Z, evidence_source: aws-inspection}\nproject: {id: shop, seller_id: seller}\narchitecture: {type: shared_ec2_postgresql}\ndomains: {primary: shop.example}\ndatabase:\n  mode: existing\n  engine: postgresql\n  region: ap-northeast-1\n  instance_identifier: shared-prod-postgres\n  name: commerce\n  schema: shop\n  connection_source: DATABASE_URL\n  allow_create_rds: false\n  allow_create_database: false\n  allow_create_schema: false\nstorage:\n  mode: existing\n  provider: s3\n  region: ap-northeast-1\n  bucket: shared-assets\n  prefix: projects/shop/sellers/seller/\n  allow_create_bucket: false\ndeployment:\n  mode: existing\n  provider: ec2\n  region: ap-northeast-1\n  instance_id: i-existing\n  allow_create_instance: false\n  allow_create_port: false\nrouting:\n  ingress: nginx\n  runtime_source: shop.service\nrelease_limits:\n  new_ec2_instances: 0\n  new_databases: 0\n  new_buckets: 0\n  new_ports: 0\n`);
    writeFileSync(receiptPath,JSON.stringify(inspectionReceipt()));
    writeFileSync(publicKeyPath,publicKeyPem);
    const cliPath=fileURLToPath(new URL('../scripts/validate-resource-record.mjs',import.meta.url));
    const env={...process.env,BUYNA_DEPLOYMENT_INSPECTION_PUBLIC_KEY_FILE:publicKeyPath};
    const cli=spawnSync(process.execPath,[cliPath,'--resource',resourcePath,'--write-deployment-baseline','--inspection-receipt',receiptPath],{encoding:'utf8',env});
    assert.equal(cli.status,0,cli.stdout+cli.stderr);
    assert.match(readFileSync(resourcePath,'utf8'),/projectDeploymentBaseline:\s*\n[^]*inspection_receipt_digest:/);
    const verify=spawnSync(process.execPath,[cliPath,'--resource',resourcePath,'--require-deployment-baseline'],{encoding:'utf8',env});
    assert.equal(verify.status,0,verify.stdout+verify.stderr);
    assert.equal(JSON.parse(verify.stdout).deploymentBaselineStatus,'confirmed');
  }finally{rmSync(root,{recursive:true,force:true})}
});

test('baseline writer rolls both files back when the second replacement fails',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'buyna-resource-baseline-rollback-'));
  try{
    const resourcePath=path.join(root,'resources.yaml'),receiptPath=path.join(root,'inspection.json'),sidecarPath=path.join(root,'resources.deployment-inspection.json');
    const yaml=`record: {version: 1, checked_at: 2026-09-02T00:00:00Z, evidence_source: aws-inspection}\nproject: {id: shop, seller_id: seller}\narchitecture: {type: shared_ec2_postgresql}\ndomains: {primary: shop.example}\ndatabase:\n  mode: existing\n  engine: postgresql\n  region: ap-northeast-1\n  instance_identifier: shared-prod-postgres\n  name: commerce\n  schema: shop\n  connection_source: DATABASE_URL\n  allow_create_rds: false\n  allow_create_database: false\n  allow_create_schema: false\nstorage:\n  mode: existing\n  provider: s3\n  region: ap-northeast-1\n  bucket: shared-assets\n  prefix: projects/shop/sellers/seller/\n  allow_create_bucket: false\ndeployment:\n  mode: existing\n  provider: ec2\n  region: ap-northeast-1\n  instance_id: i-existing\n  allow_create_instance: false\n  allow_create_port: false\nrouting:\n  ingress: nginx\n  runtime_source: shop.service\nrelease_limits:\n  new_ec2_instances: 0\n  new_databases: 0\n  new_buckets: 0\n  new_ports: 0\n`;
    writeFileSync(resourcePath,yaml);writeFileSync(receiptPath,JSON.stringify(inspectionReceipt()));writeFileSync(sidecarPath,'old-sidecar');
    assert.throws(()=>writeProjectDeploymentBaseline({resourcePath,inspectionReceiptPath:receiptPath,inspectionAuthority,faultInjector(stage){if(stage==='before-resource-replace')throw new Error('simulated interruption')}}),/simulated interruption/);
    assert.equal(readFileSync(resourcePath,'utf8'),yaml);assert.equal(readFileSync(sidecarPath,'utf8'),'old-sidecar');
    assert.equal(fsExists(`${resourcePath}.deployment-baseline.transaction.json`),false);
  }finally{rmSync(root,{recursive:true,force:true})}
});

const fsExists=file=>{try{readFileSync(file);return true}catch{return false}};

test('missing, forged, or placeholder deployment baselines fail closed when required',()=>{
  const missing=validateResourceRecord(sharedRecord(),{requireDeploymentBaseline:true});
  assert.ok(missing.errors.includes('DEPLOYMENT_BASELINE_MISSING'));

  const forged=sharedRecord();
  forged.projectDeploymentBaseline={version:1,status:'confirmed',resourceRecordDigest:'0'.repeat(64),account_id:'unknown',region:'ap-northeast-1',architecture_type:'shared_ec2_postgresql',target_id:'i-existing',zero_create_policy_digest:'0'.repeat(64),verified_at:'2026-09-02T00:00:00Z'};
  const result=validateResourceRecord(forged,{requireDeploymentBaseline:true});
  assert.equal(result.status,'blocked');
  assert.ok(result.errors.includes('DEPLOYMENT_BASELINE_ACCOUNT_MISSING'));
  assert.ok(result.errors.includes('DEPLOYMENT_BASELINE_RESOURCE_DIGEST_MISMATCH'));
});
