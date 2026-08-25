import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createWorkflow,startGate} from '../src/index.mjs';
import {createVerifiedWorkflowStore,loadPinnedWorkflowAuthority} from '../src/file-store.mjs';

const keyId='workflow-test-key-v1';
const {publicKey,privateKey}=generateKeyPairSync('ed25519');

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
function encode(value){return Buffer.from(JSON.stringify(canonical(value)))}
function hash(value){return createHash('sha256').update(encode(value)).digest('hex')}
function signature(payload){return sign(null,encode(payload),privateKey).toString('base64')}
function same(left,right){return JSON.stringify(canonical(left))===JSON.stringify(canonical(right))}

function authoritativeTransport(){
  let latestHead=null,failAfterCommit=false;
  return{
    get latestHead(){return latestHead},
    failAfterNextCommit(){failAfterCommit=true},
    async issueJournalReceipt({record}){
      const payload={type:'workflow_journal_receipt',keyId,recordDigest:hash(record)};
      return{keyId,recordDigest:payload.recordDigest,signature:signature(payload)};
    },
    async readLatestHead({projectId,nonce}){
      const payload={type:'workflow_latest_head',keyId,projectId,nonce,head:latestHead};
      return{keyId,projectId,nonce,head:structuredClone(latestHead),signature:signature(payload)};
    },
    async commitLatestHead({projectId,previousHead,nextHead}){
      const accepted=same(previousHead,latestHead);
      if(accepted)latestHead=structuredClone(nextHead);
      if(accepted&&failAfterCommit){failAfterCommit=false;throw new Error('simulated acknowledgement loss')}
      const committedAt='2026-08-26T12:00:00.000Z';
      const payload={type:'workflow_head_commit',keyId,projectId,previousHead,nextHead,accepted,committedAt};
      return{keyId,projectId,previousHead:structuredClone(previousHead),nextHead:structuredClone(nextHead),accepted,committedAt,signature:signature(payload)};
    },
  };
}

async function setup(){
  const projectRoot=await mkdtemp(path.join(tmpdir(),'buyna-pinned-authority-'));
  const configPath=path.join(projectRoot,'server-owned-authority.json');
  await writeFile(configPath,JSON.stringify({keyId,algorithm:'Ed25519',publicKeyPem:publicKey.export({type:'spki',format:'pem'})}));
  process.env.BUYNA_WORKFLOW_AUTHORITY_CONFIG_PATH=configPath;
  const pinnedAuthority=await loadPinnedWorkflowAuthority();
  const transport=authoritativeTransport();
  return{projectRoot,pinnedAuthority,transport,authorityTransport:transport};
}

test('pinned authority loader ignores caller paths and reads server-owned configuration',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'buyna-server-authority-config-'));
  try{
    const configPath=path.join(root,'authority.json');
    await writeFile(configPath,JSON.stringify({keyId,algorithm:'Ed25519',publicKeyPem:publicKey.export({type:'spki',format:'pem'})}));
    process.env.BUYNA_WORKFLOW_AUTHORITY_CONFIG_PATH=configPath;
    const pinned=await loadPinnedWorkflowAuthority({configPath:path.join(root,'caller-controlled.json')});
    assert.equal(pinned.keyId,keyId);
  }finally{await rm(root,{recursive:true,force:true})}
});

test('authoritative head recovers an immutable candidate after CAS acknowledgement loss',async()=>{
  const context=await setup();
  try{
    const store=createVerifiedWorkflowStore(context);
    await store.initializeWorkflow({state:createWorkflow({projectId:'recovery-shop'})});
    const loaded=await store.loadVerifiedWorkflow();
    const transition=startGate({state:loaded,gate:'customer_intake'});
    context.transport.failAfterNextCommit();
    await assert.rejects(store.saveWorkflow({loadedState:loaded,transition}),/WORKFLOW_MONOTONIC_COMMIT_RESPONSE_INVALID/);

    const recovered=await createVerifiedWorkflowStore(context).loadVerifiedWorkflow();
    assert.equal(recovered.gates.customer_intake.status,'in_progress');
    const pointer=JSON.parse(await readFile(path.join(context.projectRoot,'workflow','current.json'),'utf8'));
    assert.equal(pointer.headDigest,context.transport.latestHead.headDigest);
    const candidate=path.join(context.projectRoot,'workflow','revisions',pointer.candidateId,'workflow-state.json');
    assert.equal(JSON.parse(await readFile(candidate,'utf8')).stateRevision,2);
  }finally{await rm(context.projectRoot,{recursive:true,force:true})}
});

test('store requires loader-branded pinned authority and rejects arbitrary callback trust',async()=>{
  assert.equal(loadPinnedWorkflowAuthority.length,0);
  const projectRoot=await mkdtemp(path.join(tmpdir(),'buyna-unpinned-authority-'));
  try{
    assert.throws(()=>createVerifiedWorkflowStore({
      projectRoot,
      receiptAuthority:{async createReceipt(){return{}},async verifyReceipt(){return true}},
    }),/WORKFLOW_PINNED_AUTHORITY_REQUIRED/);
    assert.throws(()=>createVerifiedWorkflowStore({
      projectRoot,
      pinnedAuthority:{keyId,publicKeyPem:'caller supplied'},
      authorityTransport:{
        async issueJournalReceipt(){return true},
        async readLatestHead(){return true},
        async commitLatestHead(){return true},
      },
    }),/WORKFLOW_PINNED_AUTHORITY_REQUIRED/);
  }finally{await rm(projectRoot,{recursive:true,force:true})}
});

test('signed CAS head survives process boundaries and repairs a rolled-back local pointer',async()=>{
  const context=await setup();
  try{
    const store=createVerifiedWorkflowStore(context);
    await store.initializeWorkflow({state:createWorkflow({projectId:'pinned-shop'})});
    const pointerPath=path.join(context.projectRoot,'workflow','current.json');
    const oldPointer=await readFile(pointerPath,'utf8');

    const processTwo=createVerifiedWorkflowStore(context);
    const loaded=await processTwo.loadVerifiedWorkflow();
    await processTwo.saveWorkflow({loadedState:loaded,transition:startGate({state:loaded,gate:'customer_intake'})});
    assert.equal(context.transport.latestHead.revision,2);

    await writeFile(pointerPath,oldPointer);
    const processThree=createVerifiedWorkflowStore(context);
    const recovered=await processThree.loadVerifiedWorkflow();
    assert.equal(recovered.gates.customer_intake.status,'in_progress');
    const repairedPointer=JSON.parse(await readFile(pointerPath,'utf8'));
    assert.equal(repairedPointer.candidateId,context.transport.latestHead.candidateId);
  }finally{await rm(context.projectRoot,{recursive:true,force:true})}
});

test('latest-head nonce prevents replay of an old signed response',async()=>{
  const context=await setup();
  try{
    const setupStore=createVerifiedWorkflowStore(context);
    await setupStore.initializeWorkflow({state:createWorkflow({projectId:'nonce-shop'})});
    let cached;
    const replayTransport={
      issueJournalReceipt:context.transport.issueJournalReceipt,
      commitLatestHead:context.transport.commitLatestHead,
      async readLatestHead(input){
        if(!cached)cached=await context.transport.readLatestHead(input);
        return structuredClone(cached);
      },
    };
    const store=createVerifiedWorkflowStore({...context,authorityTransport:replayTransport});
    await store.loadVerifiedWorkflow();
    await assert.rejects(store.loadVerifiedWorkflow(),/WORKFLOW_LATEST_HEAD_NONCE_INVALID/);
  }finally{await rm(context.projectRoot,{recursive:true,force:true})}
});

test('unsigned true and empty transport responses can never establish validity',async()=>{
  const context=await setup();
  try{
    const badStore=createVerifiedWorkflowStore({
      ...context,
      authorityTransport:{
        async issueJournalReceipt(){return true},
        async readLatestHead(){return{}},
        async commitLatestHead(){return true},
      },
    });
    await assert.rejects(
      badStore.initializeWorkflow({state:createWorkflow({projectId:'bad-transport'})}),
      /WORKFLOW_LATEST_HEAD_RESPONSE_INVALID|WORKFLOW_JOURNAL_RECEIPT_INVALID/,
    );
  }finally{await rm(context.projectRoot,{recursive:true,force:true})}
});
