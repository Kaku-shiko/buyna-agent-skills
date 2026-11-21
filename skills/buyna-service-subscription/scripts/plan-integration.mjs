import {readFile} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const metadataUrl=['../../../packages/buyna-service-subscription-core/package.json','../../../../packages/buyna-service-subscription-core/package.json'].map(value=>new URL(value,import.meta.url)).find(value=>existsSync(value));
if(!metadataUrl)throw Error('SUBSCRIPTION_MODULE_REQUIRED');
const moduleMetadata=JSON.parse(readFileSync(metadataUrl,'utf8'));
export function planSubscriptionIntegration(config){
 const id=value=>typeof value==='string'&&/^[-a-zA-Z0-9_]{1,120}$/.test(value);
 if(!config||!['projectId','sellerId','shopId'].every(key=>id(config[key])))throw Error('INVALID_MERCHANT_IDENTITY');
 const origin=new URL(config.origin);if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw Error('INVALID_MERCHANT_ORIGIN');
 if(!['react','next','other'].includes(config.frontend))throw Error('FRONTEND_REQUIRED');
 if(!config.resourceRecordPath||!config.authAdapterPath)throw Error('SERVER_EVIDENCE_PATHS_REQUIRED');
 return {status:'CONFIG_VALIDATED_NOT_DEPLOYED',module:moduleMetadata.name,moduleVersion:moduleMetadata.version,apiVersion:'1.1',identity:{projectId:config.projectId,sellerId:config.sellerId,shopId:config.shopId},origin:origin.origin,frontend:config.frontend,resourceRecordPath:config.resourceRecordPath,authAdapterPath:config.authAdapterPath,requiredBindings:['trusted merchant session and observed host','registered official identity','server-only read/management tokens','same-origin API proxy','canonical subscription UI','revalidation events','tests and rollback evidence'],legacyDefaults:{unknownDates:'MIGRATION_REVIEW',enforcementEnabled:false,notificationsEnabled:false,automaticCharges:false},actionsPerformed:{deployment:false,charges:false,emails:false,businessWrites:false}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv.length!==3)throw Error('Usage: node plan-integration.mjs path/to/project-config.json');const input=JSON.parse(await readFile(process.argv[2],'utf8'));if(Object.keys(input).some(key=>/secret|token|password|credential|card/i.test(key)))throw Error('DO_NOT_INCLUDE_SECRETS');process.stdout.write(JSON.stringify(planSubscriptionIntegration(input),null,2)+'\n');}
 catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
