#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseSimpleYaml,validateResourceRecord} from '../../buyna-project-resource-registry/scripts/validate-resource-record.mjs';

const stableFields=[
  ['project.id','PROJECT_ID_CHANGED'],['project.seller_id','SELLER_ID_CHANGED'],['architecture.type','ARCHITECTURE_CHANGED'],
  ['domains.primary','PRIMARY_DOMAIN_CHANGED'],['database.engine','DATABASE_ENGINE_CHANGED'],['database.schema','DATABASE_SCHEMA_CHANGED'],
  ['storage.provider','STORAGE_PROVIDER_CHANGED'],['storage.bucket','STORAGE_BUCKET_CHANGED'],['storage.prefix','STORAGE_PREFIX_CHANGED'],
  ['deployment.instance_id','INSTANCE_CHANGED'],['routing.ingress','INGRESS_CHANGED']
];
const get=(value,key)=>key.split('.').reduce((current,part)=>current?.[part],value);
export function validateResourceIdentityMigration(before,after){
  const errors=[];
  const beforeResult=validateResourceRecord(before),afterResult=validateResourceRecord(after);
  if(beforeResult.status!=='pass')errors.push('BEFORE_RESOURCE_INVALID');
  if(afterResult.status!=='pass')errors.push('AFTER_RESOURCE_INVALID');
  if(before.architecture?.type!=='shared_ec2_postgresql'||after.architecture?.type!=='shared_ec2_postgresql')errors.push('SHARED_POSTGRESQL_REQUIRED');
  for(const [field,code] of stableFields)if(get(before,field)!==get(after,field))errors.push(code);
  const identifierChanged=before.database?.instance_identifier!==after.database?.instance_identifier;
  const databaseNameChanged=before.database?.name!==after.database?.name;
  if(!identifierChanged&&!databaseNameChanged)errors.push('RESOURCE_IDENTITY_UNCHANGED');
  if(after.database?.resource_tags){
    if(after.database.resource_tags.Name!==after.database.instance_identifier)errors.push('AFTER_NAME_TAG_MISMATCH');
    if(after.database.resource_tags.DatabaseName!==after.database.name)errors.push('AFTER_DATABASE_TAG_MISMATCH');
  }
  return{status:errors.length?'blocked':'pass',code:errors.length?'RESOURCE_IDENTITY_MIGRATION_BLOCKED':'RESOURCE_IDENTITY_MIGRATION_READY',changes:{rdsIdentifier:identifierChanged,databaseName:databaseNameChanged},errors};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const value=flag=>{const index=process.argv.indexOf(flag);return index>=0?process.argv[index+1]:null};
  const beforePath=value('--before'),afterPath=value('--after');
  if(!beforePath||!afterPath){console.log(JSON.stringify({status:'failed',code:'BEFORE_AND_AFTER_PATHS_REQUIRED'}));process.exit(1)}
  try{
    const before=parseSimpleYaml(fs.readFileSync(path.resolve(beforePath),'utf8'));
    const after=parseSimpleYaml(fs.readFileSync(path.resolve(afterPath),'utf8'));
    const result=validateResourceIdentityMigration(before,after);console.log(JSON.stringify(result));if(result.status!=='pass')process.exitCode=2;
  }catch(error){console.log(JSON.stringify({status:'failed',code:error.message||'RESOURCE_IDENTITY_VALIDATION_FAILED'}));process.exit(1)}
}
