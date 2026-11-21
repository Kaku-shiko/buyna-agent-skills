import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {parseArgs,createPlan,executePlan} from './cli.mjs';
const root=path.resolve('fixture-root'),digest='a'.repeat(64);
const entry=v=>({sha256:digest,uri:`s3://buyna-s3/shared-modules/service-subscription/${v}/bundle.json`,status:'ec-pilot',validatedProjects:['ectecshop']});
const registry={schema:1,bucket:'buyna-s3',modules:{'service-subscription':{package:'@buyna/service-subscription-core',versions:{'0.3.0':entry('0.3.0'),'0.3.1':entry('0.3.1')}}}};
const lock={name:'@buyna/service-subscription-core',version:'0.3.0',sha256:digest};
const input=(command,version)=>({command,module:'service-subscription',project:'ectecshop',version});
test('explicit version and safe argument parsing; no deployment command',()=>{
  assert.equal(parseArgs(['install','service-subscription','--project','ectecshop','--version','0.3.0']).version,'0.3.0');
  for(const args of [['deploy','service-subscription'],['install','unknown'],['install','service-subscription','--project','ectecshop','--version','latest'],['verify','service-subscription','--project','ectecshop','--version','0.3.0']])assert.throws(()=>parseArgs(args));
});
test('install is idempotent but cannot silently upgrade',()=>{
  assert.equal(createPlan(input('install','0.3.0'),{root,registry,lock:null}).args[0],'install');
  assert.equal(createPlan(input('install','0.3.0'),{root,registry,lock}).version,'0.3.0');
  assert.throws(()=>createPlan(input('install','0.3.1'),{root,registry,lock}),/USE_UPGRADE/);
});
test('upgrade requires an installed, registered newer version',()=>{
  assert.equal(createPlan(input('upgrade','0.3.1'),{root,registry,lock}).version,'0.3.1');
  assert.throws(()=>createPlan(input('upgrade','0.3.1'),{root,registry,lock:null}),/INSTALL_REQUIRED/);
  assert.throws(()=>createPlan(input('upgrade','0.3.0'),{root,registry,lock}),/NEWER/);
  assert.throws(()=>createPlan(input('upgrade','9.0.0'),{root,registry,lock}),/NOT_REGISTERED/);
});
test('foreign project and changed digest are rejected before execution',()=>{
  assert.throws(()=>createPlan({...input('install','0.3.0'),project:'medinance'},{root,registry,lock:null}),/NOT_APPROVED/);
  assert.throws(()=>createPlan({...input('install','0.3.0'),project:'../escape'},{root,registry,lock:null}),/PATH/);
  assert.throws(()=>createPlan(input('verify'),{root,registry,lock:{...lock,sha256:'b'.repeat(64)}}),/MISMATCH/);
});
test('rollback requires an approved previous version and does not verify the broken current files',()=>{
  assert.throws(()=>createPlan(input('rollback'),{root,registry,lock}),/NO_PREVIOUS/);
  const plan=createPlan(input('rollback'),{root,registry,lock:{...lock,version:'0.3.1',previous:lock}});
  const calls=[];executePlan(plan,(_s,args)=>{calls.push(args[0]);return {status:0};});
  assert.deepEqual(calls,['rollback','verify']);assert.equal(plan.version,'0.3.0');
});
test('upgrade verifies before and after; failed preflight never installs',()=>{
  const plan=createPlan(input('upgrade','0.3.1'),{root,registry,lock}),calls=[];
  const result=executePlan(plan,(_s,args)=>{calls.push(args[0]);return {status:0};});
  assert.deepEqual(calls,['verify','install','verify']);assert.equal(result.deployed,false);assert.equal(result.billingChanged,false);
  const stopped=[];assert.throws(()=>executePlan(plan,(_s,args)=>{stopped.push(args[0]);return {status:1};}),/CURRENT_PACKAGE/);assert.deepEqual(stopped,['verify']);
});
test('generic packages use verified compatibility rather than a merchant name allowlist',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'buyna-module-test-')),project='merchant_fixture',directory=path.join(temp,'projects',project);
 fs.mkdirSync(directory,{recursive:true});
 try{
  const identity={projectId:project,sellerId:'seller_fixture',shopId:'default'};
  const body=JSON.stringify({passed:true,apiVersion:'1.1',identity});fs.writeFileSync(path.join(directory,'subscription-compatibility.json'),body);
  const integration={schema:1,projectId:project,identity,module:'service-subscription',apiVersion:'1.1',adapterVerified:true,evidenceSha256:createHash('sha256').update(body).digest('hex')};
  const generic={...entry('0.5.2'),status:'approved',apiVersion:'1.1',validatedProjects:undefined,compatibility:{contract:'merchant-subscription-v1'}};
  const catalog={schema:1,bucket:'buyna-s3',modules:{'service-subscription':{package:lock.name,versions:{'0.5.2':generic}}}};
  const command={command:'install',module:'service-subscription',project,version:'0.5.2'};
  assert.equal(createPlan(command,{root:temp,registry:catalog,lock:null,integration}).version,'0.5.2');
  assert.throws(()=>createPlan(command,{root:temp,registry:catalog,lock:null,integration:null}),/COMPATIBILITY/);
  fs.writeFileSync(path.join(directory,'subscription-compatibility.json'),'{}');
  assert.throws(()=>createPlan(command,{root:temp,registry:catalog,lock:null,integration}),/EVIDENCE_MISMATCH/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
