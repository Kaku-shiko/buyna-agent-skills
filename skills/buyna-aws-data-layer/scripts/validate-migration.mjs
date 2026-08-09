#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export function validateMigration({upSql='',downSql=''}={}){
  const up=String(upSql),down=String(downSql),errors=[];
  if(/\bCREATE\s+DATABASE\b/i.test(up))errors.push('CREATE_DATABASE_FORBIDDEN');
  if(/\bsqlite\b/i.test(up))errors.push('SQLITE_FORBIDDEN');
  if(/\bsupabase\b/i.test(up))errors.push('SUPABASE_FORBIDDEN');
  if(!down.trim())errors.push('ROLLBACK_MISSING');
  if(/\b(?:TRUNCATE|DROP\s+TABLE)\b/i.test(up))errors.push('DESTRUCTIVE_MIGRATION_REQUIRES_MANUAL_REVIEW');
  return{status:errors.length?'blocked':'pass',code:errors.length?'MIGRATION_UNSAFE':'MIGRATION_SAFE',errors};
}

function arg(name){const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:null}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const upPath=arg('--up'),downPath=arg('--down');
    if(!upPath){console.log(JSON.stringify({status:'failed',code:'UP_MIGRATION_REQUIRED'}));process.exit(1)}
    const result=validateMigration({upSql:fs.readFileSync(path.resolve(upPath),'utf8'),downSql:downPath?fs.readFileSync(path.resolve(downPath),'utf8'):''});
    console.log(JSON.stringify(result));if(result.status!=='pass')process.exitCode=2;
  }catch(error){console.log(JSON.stringify({status:'failed',code:error.code||error.message||'MIGRATION_INSPECTION_FAILED'}));process.exit(1)}
}
