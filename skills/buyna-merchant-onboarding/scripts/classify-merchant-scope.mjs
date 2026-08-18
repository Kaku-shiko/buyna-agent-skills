#!/usr/bin/env node
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const intents=new Map([
  ['new_independent',{route:'buyna-merchant-onboarding',resourceLifecycle:'candidate',requiresLegacySource:false}],
  ['existing_alias',{route:'buyna-project-resource-registry',resourceLifecycle:'reconcile',requiresLegacySource:true}],
  ['existing_migration',{route:'buyna-unified-merchant-architecture',resourceLifecycle:'verified',requiresLegacySource:true}],
]);
const idPattern=/^[a-z0-9][a-z0-9_-]{0,79}$/;

function required(value,code){const text=String(value??'').trim().toLowerCase();if(!text)throw new Error(code);return text}
function validHost(value){const host=required(value,'PRIMARY_HOST_REQUIRED');if(host.length>253||!host.includes('.')||!/^[a-z0-9.-]+$/.test(host)||host.startsWith('.')||host.endsWith('.')||host.includes('..'))throw new Error('PRIMARY_HOST_INVALID');return host}

export function classifyMerchantScope({intent,primaryHost,projectId,sellerId}={}){
  const normalizedIntent=required(intent,'MERCHANT_INTENT_REQUIRED'),classification=intents.get(normalizedIntent);
  if(!classification)throw new Error('MERCHANT_INTENT_INVALID');
  const host=validHost(primaryHost);
  const project=String(projectId??'').trim().toLowerCase()||null;
  const seller=String(sellerId??'').trim().toLowerCase()||null;
  if(project&&!idPattern.test(project))throw new Error('PROJECT_ID_INVALID');
  if(seller&&!idPattern.test(seller))throw new Error('SELLER_ID_INVALID');
  return{status:'pass',intent:normalizedIntent,primaryHost:host,projectId:project,sellerId:seller,identityResolutionRequired:!project||!seller,...classification,reuseSharedFoundation:true,mayCreateSchemaAfterApproval:normalizedIntent==='new_independent'};
}

function arg(name){const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1]}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{console.log(JSON.stringify(classifyMerchantScope({intent:arg('--intent'),primaryHost:arg('--host'),projectId:arg('--project-id'),sellerId:arg('--seller-id')})))}
  catch(error){console.log(JSON.stringify({status:'blocked',code:error.message||'MERCHANT_SCOPE_CLASSIFICATION_FAILED'}));process.exitCode=2}
}
