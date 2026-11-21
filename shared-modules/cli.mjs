import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const defaultRoot=path.resolve(import.meta.dirname,'..');
const adapters={'service-subscription':{script:'packages/buyna-service-subscription-core/scripts/distribution.mjs',lock:'subscription-package.lock.json'}};
function check(value,message){if(!value)throw Error(message);}
function versionParts(value){check(/^\d+\.\d+\.\d+$/.test(value),'EXPLICIT_SEMVER_REQUIRED');return value.split('.').map(Number);}
function newer(next,current){const a=versionParts(next),b=versionParts(current);for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i];return false;}

export function parseArgs(args){
  const [command,module,...rest]=args;
  check(['install','verify','upgrade','rollback'].includes(command),'COMMAND_REQUIRED: install | verify | upgrade | rollback');
  check(Object.hasOwn(adapters,module),'MODULE_ADAPTER_NOT_REGISTERED');
  const options={};
  for(let i=0;i<rest.length;i+=2){
    const key=rest[i];check(['--project','--version'].includes(key)&&rest[i+1]&&!rest[i+1].startsWith('--')&&!Object.hasOwn(options,key),'INVALID_ARGUMENTS');options[key]=rest[i+1];
  }
  check(options['--project'],'PROJECT_REQUIRED');
  if(['install','upgrade'].includes(command))versionParts(options['--version']||'');
  else check(!options['--version'],'VERSION_NOT_ALLOWED');
  return {command,module,project:options['--project'],version:options['--version']};
}

export function createPlan(input,{root=defaultRoot,registry,lock,integration}={}){
  if(registry===undefined){
    const registryPath=process.env.BUYNA_MODULE_REGISTRY_FILE||path.join(root,'shared-modules/registry.json');
    check(fs.existsSync(registryPath),'REVIEWED_PRIVATE_REGISTRY_REQUIRED');
    registry=JSON.parse(fs.readFileSync(registryPath));
  }
  const adapter=adapters[input.module];check(adapter,'MODULE_ADAPTER_NOT_REGISTERED');
  const module=registry.modules?.[input.module];check(registry.schema===1&&module,'MODULE_NOT_REGISTERED');
  const project=/^[a-zA-Z0-9_-]+$/.test(input.project)?path.join(root,'projects',input.project):path.resolve(input.project);
  const projectId=path.basename(project);check(project===path.join(root,'projects',projectId),'REGISTERED_PROJECT_PATH_REQUIRED');
  if(integration===undefined){const file=path.join(project,'subscription-integration.json');integration=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;}
  if(lock===undefined){const file=path.join(project,adapter.lock);lock=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;}
  const entryFor=(version,digest)=>{
    const entry=module.versions?.[version];check(entry,'VERSION_NOT_REGISTERED');
    check(['ec-pilot','approved'].includes(entry.status),'VERSION_NOT_APPROVED');
    if(entry.compatibility?.contract==='merchant-subscription-v1'){
      check(integration?.schema===1&&integration.projectId===projectId&&integration.apiVersion===entry.apiVersion&&integration.module==='service-subscription'&&integration.adapterVerified===true,'PROJECT_COMPATIBILITY_REQUIRED');
      check(/^[a-f0-9]{64}$/.test(integration.evidenceSha256||''),'COMPATIBILITY_EVIDENCE_REQUIRED');
      const evidence=path.join(project,'subscription-compatibility.json');
      check(fs.existsSync(evidence),'COMPATIBILITY_EVIDENCE_REQUIRED');
      check(createHash('sha256').update(fs.readFileSync(evidence)).digest('hex')===integration.evidenceSha256,'COMPATIBILITY_EVIDENCE_MISMATCH');
      const accepted=JSON.parse(fs.readFileSync(evidence));
      check(accepted.passed===true&&accepted.apiVersion===entry.apiVersion&&['projectId','sellerId','shopId'].every(key=>accepted.identity?.[key]===integration.identity?.[key]),'COMPATIBILITY_EVIDENCE_MISMATCH');
      check(integration.identity?.projectId===projectId&&integration.identity?.sellerId&&integration.identity?.shopId,'PROJECT_IDENTITY_REQUIRED');
    }else check(entry.validatedProjects?.includes(projectId),'PROJECT_NOT_APPROVED');
    if(entry.status==='ec-pilot')check(projectId==='ectecshop','EC_PILOT_ONLY');
    check(/^[a-f0-9]{64}$/.test(entry.sha256)&&entry.uri===`s3://${registry.bucket}/shared-modules/${input.module}/${version}/bundle.json`,'INVALID_REGISTRY_ENTRY');
    if(digest)check(digest===entry.sha256,'LOCK_REGISTRY_MISMATCH');return entry;
  };
  if(lock){check(lock.name===module.package,'LOCK_PACKAGE_MISMATCH');entryFor(lock.version,lock.sha256);}
  let args;
  if(['install','upgrade'].includes(input.command)){
    const entry=entryFor(input.version);
    if(input.command==='install')check(!lock||lock.version===input.version,'ALREADY_INSTALLED_USE_UPGRADE');
    else {check(lock,'INSTALL_REQUIRED');check(newer(input.version,lock.version),'UPGRADE_REQUIRES_NEWER_VERSION');}
    args=['install',entry.uri,entry.sha256,project];
  }else{
    check(lock,'INSTALL_REQUIRED');
    if(input.command==='rollback'){
      check(lock.previous,'NO_PREVIOUS_VERSION');check(lock.previous.name===module.package,'LOCK_PACKAGE_MISMATCH');
      entryFor(lock.previous.version,lock.previous.sha256);check(newer(lock.version,lock.previous.version),'INVALID_ROLLBACK_VERSION');
    }
    args=[input.command,project];
  }
  return {command:input.command,module:input.module,project,version:input.version??(input.command==='rollback'?lock.previous.version:lock.version),script:path.join(root,adapter.script),args,preverify:!!lock};
}

export function executePlan(plan,run=(script,args)=>spawnSync(process.execPath,[script,...args],{stdio:'inherit'})){
  // Validate the installed version before changing its lock; never conceal tampering.
  if(plan.preverify&&['install','upgrade'].includes(plan.command))check(run(plan.script,['verify',plan.project]).status===0,'CURRENT_PACKAGE_VERIFICATION_FAILED');
  check(run(plan.script,plan.args).status===0,'MODULE_OPERATION_FAILED');
  if(plan.command!=='verify')check(run(plan.script,['verify',plan.project]).status===0,'RESULT_VERIFICATION_FAILED');
  return {command:plan.command,module:plan.module,version:plan.version,project:plan.project,deployed:false,billingChanged:false,requiresBuild:plan.command!=='verify'};
}
export function main(args){console.log(JSON.stringify(executePlan(createPlan(parseArgs(args)))));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}
}
