import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as workflowCore from '../src/index.mjs';
const {createWorkflow,isTrustedWorkflowState,recordDelivery,startGate}=workflowCore;
import {createVerifiedWorkflowStore,loadPinnedWorkflowAuthority} from '../src/file-store.mjs';

const keyId='verified-file-store-key';
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const timestamp='2026-08-26T10:00:00.000Z';

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}

function encoded(value){return Buffer.from(JSON.stringify(canonical(value)))}
function hash(value){return createHash('sha256').update(encoded(value)).digest('hex')}
function signed(payload){return sign(null,encoded(payload),privateKey).toString('base64')}
function same(left,right){return JSON.stringify(canonical(left))===JSON.stringify(canonical(right))}

function transport(){
  let latestHead=null;
  return{
    async issueJournalReceipt({record}){
      const recordDigest=hash(record),payload={type:'workflow_journal_receipt',keyId,recordDigest};
      return{keyId,recordDigest,signature:signed(payload)};
    },
    async readLatestHead({projectId,nonce}){
      const payload={type:'workflow_latest_head',keyId,projectId,nonce,head:latestHead};
      return{keyId,projectId,nonce,head:structuredClone(latestHead),signature:signed(payload)};
    },
    async commitLatestHead({projectId,previousHead,nextHead}){
      const accepted=same(previousHead,latestHead);
      if(accepted)latestHead=structuredClone(nextHead);
      const committedAt='2026-08-26T10:00:00.000Z';
      const payload={type:'workflow_head_commit',keyId,projectId,previousHead,nextHead,accepted,committedAt};
      return{keyId,projectId,previousHead:structuredClone(previousHead),nextHead:structuredClone(nextHead),accepted,committedAt,signature:signed(payload)};
    },
  };
}

async function storeContext(projectRoot){
  const configPath=path.join(projectRoot,'authority.json');
  await writeFile(configPath,JSON.stringify({keyId,algorithm:'Ed25519',publicKeyPem:publicKey.export({type:'spki',format:'pem'})}));
  process.env.BUYNA_WORKFLOW_AUTHORITY_CONFIG_PATH=configPath;
  const pinnedAuthority=await loadPinnedWorkflowAuthority(),authorityTransport=transport();
  return{projectRoot,pinnedAuthority,authorityTransport};
}

async function fixture(){
  const projectRoot=await mkdtemp(path.join(tmpdir(),'buyna-verified-workflow-'));
  const storeArgs=await storeContext(projectRoot),store=createVerifiedWorkflowStore(storeArgs);
  await store.initializeWorkflow({state:createWorkflow({projectId:'verified-store',now:timestamp}),now:timestamp});
  return{...storeArgs,store,storeArgs,statePath:path.join(projectRoot,'workflow','workflow-state.json'),historyPath:path.join(projectRoot,'workflow','history','workflow-events.jsonl')};
}

async function journal(historyPath){
  const content=await readFile(historyPath,'utf8');
  return content.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
}

test('arbitrary per-load verifier callback is not a public provenance API',()=>{
  assert.equal(workflowCore.hydrateVerifiedWorkflowState,undefined);
});

test('trusted store saves, crosses serialization, verifies, and resumes the next transition',async()=>{
  const context=await fixture();
  try{
    const persisted=JSON.parse(await readFile(context.statePath,'utf8'));
    assert.equal(isTrustedWorkflowState(persisted.state),false);
    assert.throws(()=>startGate({state:persisted.state,gate:'customer_intake'}),/WORKFLOW_STATE_PROVENANCE_UNTRUSTED/);

    const resumedStore=createVerifiedWorkflowStore(context.storeArgs);
    const loaded=await resumedStore.loadVerifiedWorkflow();
    assert.equal(isTrustedWorkflowState(loaded),true);
    const started=startGate({state:loaded,gate:'customer_intake',now:'2026-08-26T10:01:00.000Z'});
    await resumedStore.saveWorkflow({loadedState:loaded,transition:started,now:'2026-08-26T10:01:00.000Z'});

    const nextProcessStore=createVerifiedWorkflowStore(context.storeArgs);
    const resumed=await nextProcessStore.loadVerifiedWorkflow();
    assert.equal(isTrustedWorkflowState(resumed),true);
    assert.doesNotThrow(()=>recordDelivery({state:resumed,gate:'customer_intake',delivery:{
      record:'workflow/records/customer-intake.json',
      capabilities:{siteType:'content',requiresDashboard:false,requiresCart:false,requiresCheckout:false,requiresPayment:false,requiresBooking:false},
    }}));

    const records=await journal(context.historyPath);
    assert.equal(records.length,2);
    for(const [index,record] of records.entries()){
      assert.deepEqual(Object.keys(record).sort(),[
        'event','eventHash','eventId','previousEventHash','previousEventId','receipt',
        'sequence','stateDigest','stateRevision','timestamp',
      ].sort());
      assert.equal(record.sequence,index+1);
      assert.equal(record.stateRevision,index+1);
      assert.equal(record.eventHash,record.eventId);
      assert.equal(record.previousEventId,index===0?null:records[index-1].eventId);
      assert.equal(record.previousEventHash,index===0?null:records[index-1].eventHash);
    }
    const snapshot=JSON.parse(await readFile(context.statePath,'utf8'));
    assert.equal(snapshot.stateRevision,2);
    assert.equal(snapshot.stateDigest,records.at(-1).stateDigest);
    assert.equal(snapshot.journalHead.eventId,records.at(-1).eventId);
  }finally{await rm(context.projectRoot,{recursive:true,force:true})}
});

test('save requires the exact state returned by a verified load',async()=>{
  const context=await fixture();
  try{
    const unpersisted=createWorkflow({projectId:'not-loaded'});
    const transition=startGate({state:unpersisted,gate:'customer_intake'});
    await assert.rejects(
      context.store.saveWorkflow({loadedState:unpersisted,transition}),
      /WORKFLOW_PERSISTED_STATE_NOT_VERIFIED/,
    );
  }finally{await rm(context.projectRoot,{recursive:true,force:true})}
});

test('initialization accepts only a fresh workflow state',async()=>{
  const projectRoot=await mkdtemp(path.join(tmpdir(),'buyna-invalid-initial-'));
  try{
    const store=createVerifiedWorkflowStore(await storeContext(projectRoot));
    const created=createWorkflow({projectId:'advanced-initial'});
    const advanced=startGate({state:created,gate:'customer_intake'}).state;
    await assert.rejects(store.initializeWorkflow({state:advanced}),/WORKFLOW_INITIAL_STATE_REQUIRED/);
  }finally{await rm(projectRoot,{recursive:true,force:true})}
});

for(const scenario of [
  {
    name:'invalid state digest',code:/WORKFLOW_STATE_DIGEST_INVALID/,
    mutate:async({statePath})=>{const data=JSON.parse(await readFile(statePath,'utf8'));data.state.projectId='altered';await writeFile(statePath,JSON.stringify(data));},
  },
  {
    name:'altered event contents',code:/WORKFLOW_JOURNAL_EVENT_HASH_INVALID/,
    mutate:async({historyPath})=>{const rows=await journal(historyPath);rows[0].event.event='altered';await writeFile(historyPath,rows.map(JSON.stringify).join('\n')+'\n');},
  },
  {
    name:'truncated journal',code:/WORKFLOW_JOURNAL_TRUNCATED/,
    mutate:async({historyPath})=>{await writeFile(historyPath,'');},
  },
  {
    name:'reordered journal',code:/WORKFLOW_JOURNAL_SEQUENCE_INVALID/,
    prepare:async context=>{const loaded=await context.store.loadVerifiedWorkflow();await context.store.saveWorkflow({loadedState:loaded,transition:startGate({state:loaded,gate:'customer_intake'}),now:'2026-08-26T10:01:00.000Z'});},
    mutate:async({historyPath})=>{const rows=(await journal(historyPath)).reverse();await writeFile(historyPath,rows.map(JSON.stringify).join('\n')+'\n');},
  },
  {
    name:'replayed event',code:/WORKFLOW_JOURNAL_REPLAY_DETECTED/,
    mutate:async({historyPath})=>{const rows=await journal(historyPath);rows.push(rows[0]);await writeFile(historyPath,rows.map(JSON.stringify).join('\n')+'\n');},
  },
  {
    name:'invalid provider receipt',code:/WORKFLOW_JOURNAL_RECEIPT_INVALID/,
    mutate:async({historyPath})=>{const rows=await journal(historyPath);rows[0].receipt.signature=createHash('sha256').update('invalid').digest('hex');await writeFile(historyPath,rows.map(JSON.stringify).join('\n')+'\n');},
  },
]){
  test(`verified load rejects ${scenario.name}`,async()=>{
    const context=await fixture();
    try{
      if(scenario.prepare)await scenario.prepare(context);
      await scenario.mutate(context);
      await assert.rejects(context.store.loadVerifiedWorkflow(),scenario.code);
    }finally{await rm(context.projectRoot,{recursive:true,force:true})}
  });
}
