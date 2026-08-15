#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

function valueOf(raw){
  const value=raw.trim();
  if(value==='true')return true;if(value==='false')return false;if(value==='null')return null;
  if(/^-?\d+(?:\.\d+)?$/.test(value))return Number(value);
  if(/^['"].*['"]$/.test(value))return value.slice(1,-1);
  if(/^\{.*\}$/.test(value))return Object.fromEntries(value.slice(1,-1).split(',').filter(Boolean).map(part=>{const [key,...rest]=part.split(':');return[key.trim(),valueOf(rest.join(':'))]}));
  return value;
}

export function parseSimpleYaml(text){
  const root={},stack=[{indent:-1,value:root}];
  for(const rawLine of String(text).split(/\r?\n/)){
    if(!rawLine.trim()||rawLine.trimStart().startsWith('#'))continue;
    const indent=rawLine.match(/^\s*/)[0].length,line=rawLine.trim(),separator=line.indexOf(':');
    if(separator<1)throw new Error('UNSUPPORTED_RESOURCE_YAML');
    const key=line.slice(0,separator).trim(),rawValue=line.slice(separator+1).trim();
    while(stack.at(-1).indent>=indent)stack.pop();
    const parent=stack.at(-1).value;
    if(!rawValue){parent[key]={};stack.push({indent,value:parent[key]})}else parent[key]=valueOf(rawValue);
  }
  return root;
}

export function validateResourceRecord(record={}){
  const errors=[],project=record.project??{},database=record.database??{},storage=record.storage??{},deployment=record.deployment??{},limits=record.release_limits??{};
  const placeholder=/^(unknown|unverified|pending|placeholder|tbd|todo|n\/a)$/i;
  const confirmed=value=>typeof value==='string'&&value.trim()!==''&&!placeholder.test(value.trim());
  if(!confirmed(project.id))errors.push('PROJECT_ID_MISSING_OR_UNCONFIRMED');
  if(!confirmed(project.seller_id))errors.push('SELLER_ID_MISSING_OR_UNCONFIRMED');
  if(database.mode!=='existing')errors.push('DATABASE_NOT_EXISTING');
  if(String(database.engine??'').toLowerCase()!=='postgresql')errors.push('POSTGRESQL_REQUIRED');
  if(!confirmed(database.connection_source))errors.push('DATABASE_CONNECTION_SOURCE_MISSING_OR_UNCONFIRMED');
  if(!confirmed(database.instance_identifier))errors.push('RDS_IDENTIFIER_MISSING_OR_UNCONFIRMED');
  if(!confirmed(database.name))errors.push('DATABASE_NAME_MISSING_OR_UNCONFIRMED');
  if(database.instance_identifier&&database.name===database.instance_identifier)errors.push('RDS_IDENTIFIER_USED_AS_DATABASE_NAME');
  if(!confirmed(database.schema))errors.push('DATABASE_SCHEMA_MISSING_OR_UNCONFIRMED');
  if(database.allow_create_rds!==false)errors.push('RDS_CREATION_NOT_DISABLED');
  if(database.allow_create_database!==false)errors.push('DATABASE_CREATION_NOT_DISABLED');
  if(database.allow_create_schema!==false&&!(database.allow_create_schema===true&&database.schema_change_mode==='approved_reversible_migration'))errors.push('SCHEMA_CREATION_NOT_APPROVED');
  if(storage.mode!=='existing')errors.push('STORAGE_NOT_EXISTING');
  if(!confirmed(storage.bucket_source))errors.push('STORAGE_BUCKET_SOURCE_MISSING_OR_UNCONFIRMED');
  if(!confirmed(storage.region))errors.push('STORAGE_REGION_MISSING_OR_UNCONFIRMED');
  if(!confirmed(storage.prefix))errors.push('STORAGE_PREFIX_MISSING_OR_UNCONFIRMED');
  if(storage.allow_create_bucket!==false)errors.push('BUCKET_CREATION_NOT_DISABLED');
  if(!confirmed(deployment.instance_id))errors.push('INSTANCE_ID_MISSING_OR_UNCONFIRMED');
  if(deployment.instance_ip!=='35.73.127.215')errors.push('APPROVED_INSTANCE_IP_REQUIRED');
  if(deployment.allow_create_instance!==false)errors.push('INSTANCE_CREATION_NOT_DISABLED');
  if(deployment.allow_create_port!==false)errors.push('PORT_CREATION_NOT_DISABLED');
  for(const [key,code] of Object.entries({new_ec2_instances:'NEW_EC2_INSTANCES_NOT_ZERO',new_databases:'NEW_DATABASES_NOT_ZERO',new_buckets:'NEW_BUCKETS_NOT_ZERO',new_ports:'NEW_PORTS_NOT_ZERO'})){if(limits[key]!==0)errors.push(code)}
  return{status:errors.length?'blocked':'pass',code:errors.length?'EXISTING_RESOURCES_NOT_CONFIRMED':'EXISTING_RESOURCES_CONFIRMED',projectId:project.id??null,sellerId:project.seller_id??null,database:{engine:database.engine??null,instanceIdentifier:database.instance_identifier??null,name:database.name??null,schema:database.schema??null,connectionSource:database.connection_source??null},errors};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const index=process.argv.indexOf('--resource');
  if(index<0||!process.argv[index+1]){console.log(JSON.stringify({status:'failed',code:'RESOURCE_PATH_REQUIRED'}));process.exit(1)}
  try{const record=parseSimpleYaml(fs.readFileSync(path.resolve(process.argv[index+1]),'utf8'));const result=validateResourceRecord(record);console.log(JSON.stringify(result));if(result.status!=='pass')process.exitCode=2}
  catch(error){console.log(JSON.stringify({status:'failed',code:error.code||error.message||'RESOURCE_INSPECTION_FAILED'}));process.exit(1)}
}
