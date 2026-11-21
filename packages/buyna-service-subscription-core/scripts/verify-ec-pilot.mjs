import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../../..');
const out=path.join(root,'.codex-tmp/subscription-acceptance',new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const checks=[
 ['core-and-ec',root,['--test','packages/buyna-service-subscription-core/test/*.test.mjs','packages/buyna-service-subscription-core/src/read-client.server.test.mjs','projects/ectecshop/tests/*.test.mjs']],
 ['official-payment-and-crm',path.join(root,'official-frontend'),['node_modules/vitest/vitest.mjs','run','src/lib/subscriptions','src/lib/subscription-invoice-outbox.test.ts','src/lib/subscription-receipt-email.test.ts','src/lib/crm-subscription-state.test.ts','src/lib/crm-subscriptions.test.ts']],
 ['reminder-browser',root,['projects/ectecshop/tests/subscription-reminder-browser.mjs']],
 ['direct-checkout-browser',root,['projects/ectecshop/tests/subscription-direct-browser.mjs']],
 ['crm-refresh-browser',root,['projects/ectecshop/tests/subscription-crm-browser.mjs']],
];
const receipt={at:new Date().toISOString(),scope:'EC pilot regression; no deployment',node:process.version,productionWrites:0,realPayments:0,checks:[],providerAcceptance:'USER_OWNED_PENDING',merchantRollout:'BLOCKED_UNTIL_COMPATIBILITY_AND_PAYMENT_ACCEPTANCE'};
for(const [name,cwd,args] of checks){
 const result=spawnSync(process.execPath,args,{cwd,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
 fs.writeFileSync(path.join(out,name+'.log'),(result.stdout||'')+(result.stderr||''));
 receipt.checks.push({name,passed:result.status===0,exitCode:result.status,error:result.error?.message});
 console.log(`${name}: ${result.status===0?'PASS':'FAIL'}`);
}
const index=path.join(root,'projects/ectecshop/frontend/dist/index.html');
receipt.buildIndexSha256=fs.existsSync(index)?createHash('sha256').update(fs.readFileSync(index)).digest('hex'):null;
receipt.passed=receipt.checks.every(c=>c.passed);
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));
console.log('Evidence: '+out);
if(!receipt.passed)process.exitCode=1;
