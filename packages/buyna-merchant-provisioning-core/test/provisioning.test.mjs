import test from 'node:test';
import assert from 'node:assert/strict';
import {activateMerchant,approveCandidate,createCandidate,recordProvisioned,recordVerified} from '../src/index.mjs';
import {loadProvisioning,saveProvisioningTransition} from '../src/file-store.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const base={projectId:'project_alpha',sellerId:'seller_alpha',primaryHost:'shop.example.com',schemaCandidate:'project_alpha',runtimeCandidate:'project-alpha.socket',storagePrefix:'projects/project_alpha/sellers/seller_alpha/',foundation:{architectureType:'shared_ec2_postgresql',instanceId:'i-shared',databaseInstanceIdentifier:'buyna-shared-merchant-postgres',databaseName:'buyna_merchants',databaseConnectionSource:'PROJECT_ALPHA_DATABASE_URL',storageProvider:'s3',storageIdentifier:'buyna-shared-media',region:'ap-northeast-1'}};
function approved(){return approveCandidate({state:createCandidate(base).state,approvedBy:'user',backupPlan:'backup-id',reversibleMigration:'001-up-and-down',schemaChangeMode:'approved_reversible_migration'}).state}
function provisioned(){return recordProvisioned({state:approved(),evidence:{schema:'project_alpha',runtimeIdentity:'project-alpha.socket',environmentSource:'PROJECT_ALPHA_DATABASE_URL',storagePrefix:base.storagePrefix,publicTraffic:false,newEc2Instances:0,newDatabases:0,newBuckets:0,newPorts:0}}).state}

test('advances only candidate approved provisioned verified active',()=>{
  let state=provisioned();
  state=recordVerified({state,checks:{existingMerchantRegression:'PASS',tenantIsolation:'PASS',adminLogin:'PASS',storage:'PASS',orders:'PASS',rollback:'PASS',payment:'N/A',crmGmv:'DISABLED'}}).state;
  state=activateMerchant({state,release:'release-1',rollback:'release-0',verifiedHost:'shop.example.com'}).state;
  assert.equal(state.lifecycle,'active');
});

test('blocks provisioning with new resources or early traffic',()=>{
  assert.throws(()=>recordProvisioned({state:approved(),evidence:{schema:'project_alpha',runtimeIdentity:'project-alpha.socket',environmentSource:'PROJECT_ALPHA_DATABASE_URL',storagePrefix:base.storagePrefix,publicTraffic:true,newEc2Instances:0,newDatabases:0,newBuckets:0,newPorts:0}}),/PUBLIC_TRAFFIC_BEFORE_VERIFICATION/);
  assert.throws(()=>recordProvisioned({state:approved(),evidence:{schema:'project_alpha',runtimeIdentity:'project-alpha.socket',environmentSource:'PROJECT_ALPHA_DATABASE_URL',storagePrefix:base.storagePrefix,publicTraffic:false,newEc2Instances:0,newDatabases:1,newBuckets:0,newPorts:0}}),/NEW_DATABASES_NOT_ZERO/);
});

test('requires every named verification check',()=>{
  assert.throws(()=>recordVerified({state:provisioned(),checks:{existingMerchantRegression:'PASS',tenantIsolation:'PASS'}}),/CHECK_FAILED_ADMINLOGIN/);
});

test('persists state atomically with append-only events',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'merchant-provisioning-'));
  try{const transition=createCandidate(base);await saveProvisioningTransition({projectRoot:root,transition});assert.equal((await loadProvisioning({projectRoot:root})).lifecycle,'candidate')}finally{await rm(root,{recursive:true,force:true})}
});
