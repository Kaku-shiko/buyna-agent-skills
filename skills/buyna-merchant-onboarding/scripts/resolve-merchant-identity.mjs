import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const ownerPattern=/^[a-z0-9][a-z0-9_-]{0,79}$/;
function fail(code){const error=new Error(code);error.code=code;throw error}
function clean(value){return String(value??'').trim().replace(/^['"]|['"]$/g,'')}
function validate(value,code){const result=clean(value);if(!ownerPattern.test(result))fail(code);return result}
function slug(value,max=80){
  const result=clean(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9_-]+/g,'-').replace(/^[-_]+|[-_]+$/g,'').slice(0,max).replace(/[-_]+$/,'');
  return result;
}
function projectFromHost(host){
  const labels=clean(host).toLowerCase().replace(/^https?:\/\//,'').split('/')[0].split('.').filter(Boolean);
  if(labels[0]==='www')labels.shift();
  return slug(labels[0]??'');
}
function parseIdentity(text){
  const inline=String(text).match(/project:\s*\{\s*id:\s*([^,}\s]+)\s*,\s*seller_id:\s*([^}\s]+)\s*\}/);
  if(inline)return{projectId:clean(inline[1]),sellerId:clean(inline[2])};
  const projectBlock=String(text).match(/^project:\s*\r?\n((?:^[ \t]+.*\r?\n?)*)/m)?.[1]??'';
  return{projectId:clean(projectBlock.match(/^\s*id:\s*(.+)$/m)?.[1]),sellerId:clean(projectBlock.match(/^\s*seller_id:\s*(.+)$/m)?.[1])};
}
function records(root){
  if(!root||!fs.existsSync(root))return[];
  return fs.readdirSync(root,{withFileTypes:true}).filter(entry=>entry.isDirectory()).flatMap(entry=>{
    const file=path.join(root,entry.name,'resources.yaml');
    if(!fs.existsSync(file))return[];
    const identity=parseIdentity(fs.readFileSync(file,'utf8'));
    return identity.projectId&&identity.sellerId?[{...identity,file}]:[];
  });
}

export function resolveMerchantIdentity({projectId,sellerId,primaryHost,registryRoot}={}){
  const project=projectId?validate(projectId,'PROJECT_ID_INVALID'):projectFromHost(primaryHost);
  if(!project)fail('PROJECT_ID_SOURCE_REQUIRED');
  const seller=sellerId?validate(sellerId,'SELLER_ID_INVALID'):validate(`seller_${project.replaceAll('-','_').slice(0,73)}`,'SELLER_ID_INVALID');
  const existing=records(registryRoot);
  const exact=existing.find(item=>item.projectId===project&&item.sellerId===seller);
  if(exact)return Object.freeze({status:'existing',projectId:project,sellerId:seller,resourceFile:exact.file});
  if(existing.some(item=>item.projectId===project||item.sellerId===seller))fail('MERCHANT_IDENTITY_COLLISION');
  return Object.freeze({status:'candidate',projectId:project,sellerId:seller,resourceFile:path.join(registryRoot??'projects',project,'resources.yaml')});
}

function args(argv){const result={};for(let index=0;index<argv.length;index+=2)result[argv[index].replace(/^--/,'')]=argv[index+1];return result}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const input=args(process.argv.slice(2));
    console.log(JSON.stringify(resolveMerchantIdentity({projectId:input['project-id'],sellerId:input['seller-id'],primaryHost:input['primary-host'],registryRoot:input['registry-root']})));
  }catch(error){console.error(JSON.stringify({status:'blocked',code:error.code??error.message}));process.exitCode=1}
}
