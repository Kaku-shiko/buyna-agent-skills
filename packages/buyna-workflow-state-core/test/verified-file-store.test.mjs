import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as workflowCore from '../src/index.mjs';
const {createWorkflow,isTrustedWorkflowState,recordDelivery,setInteractionMode,startGate}=workflowCore;
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
  return{...storeArgs,store,storeArgs};
}

async function currentFiles(context){
  const pointer=JSON.parse(await readFile(path.join(context.projectRoot,'workflow','current.json'),'utf8'));
  const root=path.join(context.projectRoot,'workflow','revisions',pointer.candidateId);
  return{statePath:path.join(root,'workflow-state.json'),historyPath:path.join(root,'workflow-events.jsonl')};
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
    let files=await currentFiles(context);
    const persisted=JSON.parse(await readFile(files.statePath,'utf8'));
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

    files=await currentFiles(context);
    const records=await journal(files.historyPath);
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
    const snapshot=JSON.parse(await readFile(files.statePath,'utf8'));
    assert.equal(snapshot.stateRevision,2);
    assert.equal(snapshot.stateDigest,records.at(-1).stateDigest);
    assert.equal(snapshot.journalHead.eventId,records.at(-1).eventId);
  }finally{await rm(context.projectRoot,{recursive:true,force:true})}
});

test('verified store preserves notification operation approval evidence across serialization',async()=>{
  const projectRoot=await mkdtemp(path.join(tmpdir(),'buyna-notification-approval-'));
  try{
    const storeArgs=await storeContext(projectRoot),store=createVerifiedWorkflowStore(storeArgs);
    await store.initializeWorkflow({state:createWorkflow({projectId:'notification-store',now:timestamp}),now:timestamp});
    const apply=async make=>{
      const loaded=await store.loadVerifiedWorkflow();
      await store.saveWorkflow({loadedState:loaded,transition:make(loaded)});
    };
    const capabilities={siteType:'commerce',requiresDashboard:true,requiresCart:true,requiresCheckout:true,requiresPayment:false,requiresBooking:false};
    await apply(state=>workflowCore.startGate({state,gate:'customer_intake'}));
    await apply(state=>workflowCore.recordDelivery({state,gate:'customer_intake',delivery:{record:'intake.json',capabilities}}));
    await apply(state=>workflowCore.requestApproval({state,gate:'customer_intake'}));
    await apply(state=>workflowCore.approveGate({state,gate:'customer_intake',approvedBy:'user'}));
    await apply(state=>workflowCore.startGate({state,gate:'design_and_structure'}));
    await apply(state=>workflowCore.recordDelivery({state,gate:'design_and_structure',delivery:{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'}}));
    await apply(state=>workflowCore.requestApproval({state,gate:'design_and_structure'}));
    await apply(state=>workflowCore.approveGate({state,gate:'design_and_structure',approvedBy:'user'}));
    await apply(state=>workflowCore.setApprovedDashboardSlices({state,slices:['orders'],approvedBy:'user'}));
    await apply(state=>workflowCore.setApprovedNotificationOperations({state,operations:['order_notification'],approvedBy:'user'}));

    const resumed=await createVerifiedWorkflowStore(storeArgs).loadVerifiedWorkflow();
    assert.deepEqual(resumed.configuration.notificationOperations,['order_notification']);
    assert.equal(resumed.configuration.notificationOperationApproval.authorizationEvidence.event,'notification_operations_approved');
    assert.equal(isTrustedWorkflowState(resumed),true);
    assert.doesNotThrow(()=>workflowCore.validateWorkflowReadinessEvidence(resumed));
  }finally{await rm(projectRoot,{recursive:true,force:true})}
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

test('save accepts only the opaque core transition proof bound to loaded parent, result, and event',async()=>{
  const context=await fixture();
  try{
    const loaded=await context.store.loadVerifiedWorkflow();
    const legitimate=startGate({state:loaded,gate:'customer_intake',now:'2026-08-26T10:01:00.000Z'});
    assert.ok(legitimate.transitionProof);
    await assert.rejects(context.store.saveWorkflow({
      loadedState:loaded,
      transition:{state:legitimate.state,event:legitimate.event,transitionProof:{}},
    }),/WORKFLOW_TRANSITION_PROOF_INVALID/);

    const reloaded=await context.store.loadVerifiedWorkflow();
    const valid=startGate({state:reloaded,gate:'customer_intake',now:'2026-08-26T10:01:00.000Z'});
    await assert.rejects(context.store.saveWorkflow({
      loadedState:reloaded,
      transition:{...valid,event:{...valid.event,event:'forged_event'}},
    }),/WORKFLOW_TRANSITION_PROOF_INVALID/);

    const finalLoad=await context.store.loadVerifiedWorkflow();
    const finalTransition=startGate({state:finalLoad,gate:'customer_intake',now:'2026-08-26T10:01:00.000Z'});
    await context.store.saveWorkflow({loadedState:finalLoad,transition:finalTransition});
    await assert.rejects(
      context.store.saveWorkflow({loadedState:finalLoad,transition:finalTransition}),
      /WORKFLOW_PERSISTED_STATE_NOT_VERIFIED|WORKFLOW_TRANSITION_PROOF_INVALID/,
    );
  }finally{await rm(context.projectRoot,{recursive:true,force:true})}
});

test('concurrent saves consume one loaded permit before I/O and only one can publish',async()=>{
  const context=await fixture();
  try{
    const loaded=await context.store.loadVerifiedWorkflow();
    const transition=startGate({state:loaded,gate:'customer_intake',now:'2026-08-26T10:01:00.000Z'});
    const outcomes=await Promise.allSettled([
      context.store.saveWorkflow({loadedState:loaded,transition}),
      context.store.saveWorkflow({loadedState:loaded,transition}),
    ]);
    assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);
    assert.equal(outcomes.filter(item=>item.status==='rejected').length,1);
    assert.match(String(outcomes.find(item=>item.status==='rejected').reason),/WORKFLOW_PERSISTED_STATE_NOT_VERIFIED|WORKFLOW_TRANSITION_PROOF_INVALID/);
    const resumed=await createVerifiedWorkflowStore(context.storeArgs).loadVerifiedWorkflow();
    assert.equal(resumed.gates.customer_intake.status,'in_progress');
  }finally{await rm(context.projectRoot,{recursive:true,force:true})}
});

test('independent concurrent writers stage unique candidates and signed CAS publishes exactly one',async()=>{
  const context=await fixture();
  try{
    const first=createVerifiedWorkflowStore(context.storeArgs),second=createVerifiedWorkflowStore(context.storeArgs);
    const [firstState,secondState]=await Promise.all([first.loadVerifiedWorkflow(),second.loadVerifiedWorkflow()]);
    const outcomes=await Promise.allSettled([
      first.saveWorkflow({loadedState:firstState,transition:startGate({state:firstState,gate:'customer_intake'})}),
      second.saveWorkflow({loadedState:secondState,transition:setInteractionMode({state:secondState,mode:'developer',selectedBy:'user'})}),
    ]);
    assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);
    assert.equal(outcomes.filter(item=>item.status==='rejected').length,1);
    assert.match(String(outcomes.find(item=>item.status==='rejected').reason),/WORKFLOW_MONOTONIC_COMMIT_CONFLICT/);
    const pointer=JSON.parse(await readFile(path.join(context.projectRoot,'workflow','current.json'),'utf8'));
    const candidates=await readdir(path.join(context.projectRoot,'workflow','revisions'));
    const resumed=await createVerifiedWorkflowStore(context.storeArgs).loadVerifiedWorkflow();
    assert.equal(pointer.revision,2);
    assert.equal(new Set(candidates).size,candidates.length);
    assert.equal(candidates.length,3);
    assert.ok(candidates.includes(pointer.candidateId));
    assert.ok(resumed.gates.customer_intake.status==='in_progress'||resumed.configuration.interactionMode==='developer');
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
    mutate:async context=>{const {statePath}=await currentFiles(context);const data=JSON.parse(await readFile(statePath,'utf8'));data.state.workflowVersion='altered';await writeFile(statePath,JSON.stringify(data));},
  },
  {
    name:'altered event contents',code:/WORKFLOW_JOURNAL_EVENT_HASH_INVALID/,
    mutate:async context=>{const {historyPath}=await currentFiles(context);const rows=await journal(historyPath);rows[0].event.event='altered';await writeFile(historyPath,rows.map(JSON.stringify).join('\n')+'\n');},
  },
  {
    name:'truncated journal',code:/WORKFLOW_JOURNAL_TRUNCATED/,
    mutate:async context=>{const {historyPath}=await currentFiles(context);await writeFile(historyPath,'');},
  },
  {
    name:'reordered journal',code:/WORKFLOW_JOURNAL_SEQUENCE_INVALID/,
    prepare:async context=>{const loaded=await context.store.loadVerifiedWorkflow();await context.store.saveWorkflow({loadedState:loaded,transition:startGate({state:loaded,gate:'customer_intake'}),now:'2026-08-26T10:01:00.000Z'});},
    mutate:async context=>{const {historyPath}=await currentFiles(context);const rows=(await journal(historyPath)).reverse();await writeFile(historyPath,rows.map(JSON.stringify).join('\n')+'\n');},
  },
  {
    name:'replayed event',code:/WORKFLOW_JOURNAL_REPLAY_DETECTED/,
    mutate:async context=>{const {historyPath}=await currentFiles(context);const rows=await journal(historyPath);rows.push(rows[0]);await writeFile(historyPath,rows.map(JSON.stringify).join('\n')+'\n');},
  },
  {
    name:'invalid provider receipt',code:/WORKFLOW_JOURNAL_RECEIPT_INVALID/,
    mutate:async context=>{const {historyPath}=await currentFiles(context);const rows=await journal(historyPath);rows[0].receipt.signature=createHash('sha256').update('invalid').digest('hex');await writeFile(historyPath,rows.map(JSON.stringify).join('\n')+'\n');},
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
