import {createHash,createPublicKey,randomBytes,verify} from 'node:crypto';
import {mkdir,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isTrustedWorkflowState,validateWorkflowReadinessEvidence,WORKFLOW_GATES} from './index.mjs';
import {consumeWorkflowTransitionProof,trustWorkflowState} from './workflow-provenance.mjs';

export const WORKFLOW_CURRENT_PATH=path.join('workflow','current.json');
export const WORKFLOW_REVISIONS_PATH=path.join('workflow','revisions');
const pinnedAuthorities=new WeakSet();
let pinnedAuthorityCache;

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
function encoded(value){return Buffer.from(JSON.stringify(canonical(value)))}
function digest(value){return createHash('sha256').update(encoded(value)).digest('hex')}
function same(left,right){return digest(left)===digest(right)}
function timestamp(value,code){
  const result=String(value??'').trim();
  if(!result||Number.isNaN(Date.parse(result)))throw new Error(code);
  return result;
}
function exactKeys(value,keys,code){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(code);
  const actual=Reflect.ownKeys(value);
  if(actual.length!==keys.length||keys.some(key=>!actual.includes(key)))throw new Error(code);
}
function locations(projectRoot){
  if(!String(projectRoot??'').trim())throw new Error('PROJECT_ROOT_REQUIRED');
  const workflow=path.join(path.resolve(projectRoot),'workflow');
  return{workflow,current:path.join(workflow,'current.json'),revisions:path.join(workflow,'revisions'),staging:path.join(workflow,'.staging')};
}
function recordContent(record){
  return{
    sequence:record.sequence,previousEventId:record.previousEventId,previousEventHash:record.previousEventHash,
    event:record.event,stateRevision:record.stateRevision,stateDigest:record.stateDigest,timestamp:record.timestamp,
  };
}
function unsignedRecord(record){const {receipt:discarded,...content}=record;return content}
function authorityHead(snapshot){
  const base={
    projectId:snapshot.state.projectId,revision:snapshot.stateRevision,stateDigest:snapshot.stateDigest,sequence:snapshot.journalHead.sequence,
    eventId:snapshot.journalHead.eventId,eventHash:snapshot.journalHead.eventHash,candidateId:snapshot.candidateId,
  };
  return{...base,headDigest:digest(base)};
}
function validateAuthorityHead(head,code){
  if(head===null)return;
  exactKeys(head,['projectId','revision','stateDigest','sequence','eventId','eventHash','candidateId','headDigest'],code);
  if(!String(head.projectId??'').trim()||!Number.isInteger(head.revision)||head.revision<1||!Number.isInteger(head.sequence)||head.sequence<1
    ||!/^r\d+-[a-f0-9]{32}$/.test(String(head.candidateId??'')))throw new Error(code);
  const {headDigest,...base}=head;
  if(headDigest!==digest(base))throw new Error(code);
}
function verifyPinnedSignature(authority,payload,signature,code){
  if(typeof signature!=='string'||!signature)throw new Error(code);
  let valid=false;
  try{valid=verify(null,encoded(payload),authority.publicKey,Buffer.from(signature,'base64'))}catch{}
  if(!valid)throw new Error(code);
}
async function readJson(file,code){
  try{return JSON.parse(await readFile(file,'utf8'))}catch{throw new Error(code)}
}
async function readJournal(file){
  let source;
  try{source=await readFile(file,'utf8')}catch{throw new Error('WORKFLOW_JOURNAL_REQUIRED')}
  if(!source.trim())return[];
  try{return source.trim().split('\n').map(line=>JSON.parse(line))}catch{throw new Error('WORKFLOW_JOURNAL_INVALID')}
}

export async function loadPinnedWorkflowAuthority(){
  if(pinnedAuthorityCache)return pinnedAuthorityCache;
  const configPath=process.env.BUYNA_WORKFLOW_AUTHORITY_CONFIG_PATH;
  if(!String(configPath??'').trim())throw new Error('WORKFLOW_AUTHORITY_CONFIG_PATH_REQUIRED');
  const config=await readJson(path.resolve(configPath),'WORKFLOW_AUTHORITY_CONFIG_INVALID');
  exactKeys(config,['keyId','algorithm','publicKeyPem'],'WORKFLOW_AUTHORITY_CONFIG_INVALID');
  if(!String(config.keyId??'').trim()||config.algorithm!=='Ed25519'||!String(config.publicKeyPem??'').includes('PUBLIC KEY'))throw new Error('WORKFLOW_AUTHORITY_CONFIG_INVALID');
  let publicKey;
  try{publicKey=createPublicKey(config.publicKeyPem)}catch{throw new Error('WORKFLOW_AUTHORITY_CONFIG_INVALID')}
  if(publicKey.asymmetricKeyType!=='ed25519')throw new Error('WORKFLOW_AUTHORITY_CONFIG_INVALID');
  const authority=Object.freeze({keyId:config.keyId,algorithm:config.algorithm,publicKey});
  pinnedAuthorities.add(authority);pinnedAuthorityCache=authority;
  return authority;
}

export function createVerifiedWorkflowStore({projectRoot,pinnedAuthority,authorityTransport}={}){
  const target=locations(projectRoot);
  if(!pinnedAuthorities.has(pinnedAuthority))throw new Error('WORKFLOW_PINNED_AUTHORITY_REQUIRED');
  if(!authorityTransport||typeof authorityTransport.issueJournalReceipt!=='function'
    ||typeof authorityTransport.readLatestHead!=='function'||typeof authorityTransport.commitLatestHead!=='function')throw new Error('WORKFLOW_AUTHORITY_TRANSPORT_REQUIRED');
  const issueJournalReceipt=authorityTransport.issueJournalReceipt.bind(authorityTransport);
  const readLatestHead=authorityTransport.readLatestHead.bind(authorityTransport);
  const commitLatestHead=authorityTransport.commitLatestHead.bind(authorityTransport);
  const verifiedLoads=new WeakMap(),keyId=pinnedAuthority.keyId;

  async function queryLatestHead(projectId){
    const nonce=randomBytes(32).toString('hex');
    let response;
    try{response=await readLatestHead({projectId,nonce})}catch{throw new Error('WORKFLOW_LATEST_HEAD_RESPONSE_INVALID')}
    exactKeys(response,['keyId','projectId','nonce','head','signature'],'WORKFLOW_LATEST_HEAD_RESPONSE_INVALID');
    if(response.keyId!==keyId||response.projectId!==projectId||(response.head!==null&&response.head.projectId!==projectId))throw new Error('WORKFLOW_LATEST_HEAD_RESPONSE_INVALID');
    if(response.nonce!==nonce)throw new Error('WORKFLOW_LATEST_HEAD_NONCE_INVALID');
    validateAuthorityHead(response.head,'WORKFLOW_LATEST_HEAD_RESPONSE_INVALID');
    verifyPinnedSignature(pinnedAuthority,{type:'workflow_latest_head',keyId,projectId,nonce,head:response.head},response.signature,'WORKFLOW_LATEST_HEAD_SIGNATURE_INVALID');
    return structuredClone(response.head);
  }
  async function requestJournalReceipt(record){
    let response;
    try{response=await issueJournalReceipt({record:structuredClone(record)})}catch{throw new Error('WORKFLOW_JOURNAL_RECEIPT_INVALID')}
    exactKeys(response,['keyId','recordDigest','signature'],'WORKFLOW_JOURNAL_RECEIPT_INVALID');
    const recordDigest=digest(record);
    if(response.keyId!==keyId||response.recordDigest!==recordDigest)throw new Error('WORKFLOW_JOURNAL_RECEIPT_INVALID');
    verifyPinnedSignature(pinnedAuthority,{type:'workflow_journal_receipt',keyId,recordDigest},response.signature,'WORKFLOW_JOURNAL_RECEIPT_INVALID');
    return structuredClone(response);
  }
  function verifyJournalReceipt(record){
    const receipt=record.receipt,content=unsignedRecord(record);
    exactKeys(receipt,['keyId','recordDigest','signature'],'WORKFLOW_JOURNAL_RECEIPT_INVALID');
    const recordDigest=digest(content);
    if(receipt.keyId!==keyId||receipt.recordDigest!==recordDigest)throw new Error('WORKFLOW_JOURNAL_RECEIPT_INVALID');
    verifyPinnedSignature(pinnedAuthority,{type:'workflow_journal_receipt',keyId,recordDigest},receipt.signature,'WORKFLOW_JOURNAL_RECEIPT_INVALID');
  }
  async function commitHead({projectId,previousHead,nextHead}){
    let response;
    try{response=await commitLatestHead({projectId,previousHead:structuredClone(previousHead),nextHead:structuredClone(nextHead)})}catch{throw new Error('WORKFLOW_MONOTONIC_COMMIT_RESPONSE_INVALID')}
    exactKeys(response,['keyId','projectId','previousHead','nextHead','accepted','committedAt','signature'],'WORKFLOW_MONOTONIC_COMMIT_RESPONSE_INVALID');
    validateAuthorityHead(response.previousHead,'WORKFLOW_MONOTONIC_COMMIT_RESPONSE_INVALID');
    validateAuthorityHead(response.nextHead,'WORKFLOW_MONOTONIC_COMMIT_RESPONSE_INVALID');
    if(response.nextHead===null||response.keyId!==keyId||response.projectId!==projectId||typeof response.accepted!=='boolean'
      ||!same(response.previousHead,previousHead)||!same(response.nextHead,nextHead))throw new Error('WORKFLOW_MONOTONIC_COMMIT_RESPONSE_INVALID');
    timestamp(response.committedAt,'WORKFLOW_MONOTONIC_COMMIT_RESPONSE_INVALID');
    verifyPinnedSignature(pinnedAuthority,{
      type:'workflow_head_commit',keyId,projectId,previousHead:response.previousHead,nextHead:response.nextHead,
      accepted:response.accepted,committedAt:response.committedAt,
    },response.signature,'WORKFLOW_MONOTONIC_COMMIT_SIGNATURE_INVALID');
    if(!response.accepted)throw new Error('WORKFLOW_MONOTONIC_COMMIT_CONFLICT');
  }

  function candidateFiles(candidateId){
    const root=path.join(target.revisions,candidateId);
    return{root,state:path.join(root,'workflow-state.json'),history:path.join(root,'workflow-events.jsonl')};
  }
  async function currentPointer(){
    try{
      const pointer=await readJson(target.current,'WORKFLOW_CURRENT_POINTER_INVALID');
      exactKeys(pointer,['formatVersion','projectId','candidateId','headDigest','revision'],'WORKFLOW_CURRENT_POINTER_INVALID');
      if(pointer.formatVersion!==1||!String(pointer.projectId??'').trim()||!/^r\d+-[a-f0-9]{32}$/.test(pointer.candidateId)
        ||!String(pointer.headDigest??'').trim()||!Number.isInteger(pointer.revision)||pointer.revision<1)throw new Error('WORKFLOW_CURRENT_POINTER_INVALID');
      return pointer;
    }catch{return null}
  }
  async function inferProjectId(){
    const pointer=await currentPointer();
    if(pointer){
      try{
        const snapshot=await readJson(candidateFiles(pointer.candidateId).state,'WORKFLOW_STATE_SNAPSHOT_INVALID');
        if(snapshot?.state?.projectId===pointer.projectId)return pointer.projectId;
      }catch{}
    }
    let entries=[];
    try{entries=await readdir(target.revisions,{withFileTypes:true})}catch{}
    const projects=new Set();
    for(const entry of entries){
      if(!entry.isDirectory())continue;
      try{
        const snapshot=await readJson(candidateFiles(entry.name).state,'WORKFLOW_STATE_SNAPSHOT_INVALID');
        if(String(snapshot?.state?.projectId??'').trim())projects.add(snapshot.state.projectId);
      }catch{}
    }
    if(projects.size!==1)throw new Error('WORKFLOW_PROJECT_ID_UNRESOLVED');
    return[...projects][0];
  }
  async function switchCurrent(projectId,head){
    const pointer={formatVersion:1,projectId,candidateId:head.candidateId,headDigest:head.headDigest,revision:head.revision};
    await mkdir(target.workflow,{recursive:true});
    const temporary=path.join(target.workflow,`.current-${head.revision}-${randomBytes(16).toString('hex')}.tmp`);
    await writeFile(temporary,`${JSON.stringify(pointer,null,2)}\n`,'utf8');
    await rename(temporary,target.current);
  }
  async function verifyCandidate(head){
    validateAuthorityHead(head,'WORKFLOW_MONOTONIC_HEAD_INVALID');
    const files=candidateFiles(head.candidateId);
    const [snapshot,records]=await Promise.all([readJson(files.state,'WORKFLOW_STATE_SNAPSHOT_INVALID'),readJournal(files.history)]);
    exactKeys(snapshot,['formatVersion','candidateId','stateRevision','stateDigest','journalHead','state'],'WORKFLOW_STATE_SNAPSHOT_INVALID');
    if(snapshot.formatVersion!==1||snapshot.candidateId!==head.candidateId||!Number.isInteger(snapshot.stateRevision)||snapshot.stateRevision<1)throw new Error('WORKFLOW_STATE_REVISION_INVALID');
    exactKeys(snapshot.journalHead,['sequence','eventId','eventHash'],'WORKFLOW_STATE_SNAPSHOT_INVALID');
    if(digest(snapshot.state)!==snapshot.stateDigest)throw new Error('WORKFLOW_STATE_DIGEST_INVALID');
    if(!same(authorityHead(snapshot),head))throw new Error('WORKFLOW_MONOTONIC_HEAD_MISMATCH');
    const rawEventIds=records.map(record=>record?.eventId);
    if(new Set(rawEventIds).size!==rawEventIds.length)throw new Error('WORKFLOW_JOURNAL_REPLAY_DETECTED');
    if(records.length<snapshot.journalHead.sequence)throw new Error('WORKFLOW_JOURNAL_TRUNCATED');
    if(records.length>snapshot.journalHead.sequence)throw new Error('WORKFLOW_JOURNAL_AHEAD_OF_STATE');
    let previous=null,previousRevision=0,previousDigest=null;
    for(let index=0;index<records.length;index+=1){
      const record=records[index];
      exactKeys(record,['sequence','eventId','previousEventId','previousEventHash','event','eventHash','stateRevision','stateDigest','timestamp','receipt'],'WORKFLOW_JOURNAL_INVALID');
      if(record.sequence!==index+1)throw new Error('WORKFLOW_JOURNAL_SEQUENCE_INVALID');
      if(record.previousEventId!==(previous?.eventId??null)||record.previousEventHash!==(previous?.eventHash??null))throw new Error('WORKFLOW_JOURNAL_CONTINUITY_INVALID');
      if(!Number.isInteger(record.stateRevision)||record.stateRevision<1||record.stateRevision<previousRevision||record.stateRevision>previousRevision+1)throw new Error('WORKFLOW_JOURNAL_REVISION_INVALID');
      if(record.stateRevision===previousRevision&&record.stateDigest!==previousDigest)throw new Error('WORKFLOW_JOURNAL_REVISION_INVALID');
      timestamp(record.timestamp,'WORKFLOW_JOURNAL_TIMESTAMP_INVALID');
      const expected=digest(recordContent(record));
      if(record.eventId!==expected||record.eventHash!==expected)throw new Error('WORKFLOW_JOURNAL_EVENT_HASH_INVALID');
      verifyJournalReceipt(record);
      previous=record;previousRevision=record.stateRevision;previousDigest=record.stateDigest;
    }
    if(!previous)throw new Error('WORKFLOW_JOURNAL_TRUNCATED');
    if(previous.sequence!==snapshot.journalHead.sequence||previous.eventId!==snapshot.journalHead.eventId||previous.eventHash!==snapshot.journalHead.eventHash)throw new Error('WORKFLOW_JOURNAL_HEAD_INVALID');
    if(previous.stateRevision!==snapshot.stateRevision||previous.stateDigest!==snapshot.stateDigest)throw new Error('WORKFLOW_JOURNAL_STATE_MISMATCH');
    validateWorkflowReadinessEvidence(snapshot.state);
    return{snapshot,records,head,files};
  }
  async function loadAuthoritativeCandidate(){
    const projectId=await inferProjectId(),head=await queryLatestHead(projectId);
    if(head===null)throw new Error('WORKFLOW_MONOTONIC_HEAD_REQUIRED');
    const verified=await verifyCandidate(head),pointer=await currentPointer();
    if(!pointer||pointer.projectId!==projectId||pointer.candidateId!==head.candidateId
      ||pointer.headDigest!==head.headDigest||pointer.revision!==head.revision)await switchCurrent(projectId,head);
    return verified;
  }

  async function buildRevision({state,events,revision,records,now}){
    if(!isTrustedWorkflowState(state))throw new Error('WORKFLOW_STATE_PROVENANCE_UNTRUSTED');
    validateWorkflowReadinessEvidence(state);
    const candidateId=`r${revision}-${randomBytes(16).toString('hex')}`,stateDigest=digest(state),nextRecords=[...records];
    let previous=nextRecords.at(-1)??null;
    for(const event of events){
      const partial={
        sequence:nextRecords.length+1,previousEventId:previous?.eventId??null,previousEventHash:previous?.eventHash??null,
        event:structuredClone(event),stateRevision:revision,stateDigest,
        timestamp:timestamp(event.at??now,'WORKFLOW_JOURNAL_TIMESTAMP_INVALID'),
      };
      const eventId=digest(partial),unsigned={...partial,eventId,eventHash:eventId};
      const record={...unsigned,receipt:await requestJournalReceipt(unsigned)};
      nextRecords.push(record);previous=record;
    }
    const snapshot={
      formatVersion:1,candidateId,stateRevision:revision,stateDigest,
      journalHead:{sequence:previous.sequence,eventId:previous.eventId,eventHash:previous.eventHash},state:structuredClone(state),
    };
    return{snapshot,records:nextRecords,head:authorityHead(snapshot)};
  }
  async function stageImmutableCandidate(built){
    await mkdir(target.staging,{recursive:true});await mkdir(target.revisions,{recursive:true});
    const staging=path.join(target.staging,built.snapshot.candidateId),final=candidateFiles(built.snapshot.candidateId);
    await mkdir(staging);
    await Promise.all([
      writeFile(path.join(staging,'workflow-events.jsonl'),built.records.map(record=>JSON.stringify(record)).join('\n')+'\n',{encoding:'utf8',flag:'wx'}),
      writeFile(path.join(staging,'workflow-state.json'),`${JSON.stringify(built.snapshot,null,2)}\n`,{encoding:'utf8',flag:'wx'}),
    ]);
    await rename(staging,final.root);
  }
  async function persistRevision({state,events,revision,records,previousHead,now}){
    const built=await buildRevision({state,events,revision,records,now});
    await stageImmutableCandidate(built);
    await commitHead({projectId:state.projectId,previousHead,nextHead:built.head});
    await switchCurrent(state.projectId,built.head);
    return state;
  }
  async function initializeWorkflow({state,now=new Date().toISOString()}={}){
    const fresh=state?.currentGate===WORKFLOW_GATES[0]&&state?.status===undefined&&state?.activeRepair===undefined
      &&Array.isArray(state?.configuration?.dashboardSlices)&&state.configuration.dashboardSlices.length===0
      &&Array.isArray(state?.configuration?.notificationOperations)&&state.configuration.notificationOperations.length===0
      &&state?.configuration?.workPackage===undefined
      &&WORKFLOW_GATES.every((gate,index)=>state?.gates?.[gate]?.status===(index===0?'ready':'locked')&&state.gates[gate].delivery===undefined);
    if(!fresh||!isTrustedWorkflowState(state))throw new Error('WORKFLOW_INITIAL_STATE_REQUIRED');
    const previousHead=await queryLatestHead(state.projectId);
    if(previousHead!==null)throw new Error('WORKFLOW_ALREADY_INITIALIZED');
    const event={event:'workflow_initialized',gate:state.currentGate,interactionMode:state.configuration?.interactionMode??'team',at:now};
    return persistRevision({state,events:[event],revision:1,records:[],previousHead:null,now});
  }
  async function loadVerifiedWorkflow(){
    const verified=await loadAuthoritativeCandidate(),state=trustWorkflowState(verified.snapshot.state);
    verifiedLoads.set(state,{head:structuredClone(verified.head)});
    return state;
  }
  async function saveWorkflow({loadedState,transition,now=new Date().toISOString()}={}){
    const loaded=verifiedLoads.get(loadedState);
    if(!loaded||!isTrustedWorkflowState(loadedState))throw new Error('WORKFLOW_PERSISTED_STATE_NOT_VERIFIED');
    verifiedLoads.delete(loadedState);
    const events=consumeWorkflowTransitionProof({
      transitionProof:transition?.transitionProof,parentState:loadedState,state:transition?.state,
      event:transition?.event,events:transition?.events,
    });
    const latestHead=await queryLatestHead(loadedState.projectId);
    if(!same(latestHead,loaded.head))throw new Error('WORKFLOW_PERSISTED_STATE_STALE');
    const current=await verifyCandidate(latestHead);
    return persistRevision({state:transition.state,events,revision:latestHead.revision+1,records:current.records,previousHead:latestHead,now});
  }
  return Object.freeze({initializeWorkflow,loadVerifiedWorkflow,saveWorkflow});
}
