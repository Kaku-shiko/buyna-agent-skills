import {createHash} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isTrustedWorkflowState,validateWorkflowReadinessEvidence,WORKFLOW_GATES} from './index.mjs';
import {trustWorkflowState} from './workflow-provenance.mjs';

export const WORKFLOW_STATE_PATH=path.join('workflow','workflow-state.json');
export const WORKFLOW_HISTORY_PATH=path.join('workflow','history','workflow-events.jsonl');

function locations(projectRoot){
  if(!String(projectRoot??'').trim())throw new Error('PROJECT_ROOT_REQUIRED');
  const workflow=path.join(path.resolve(projectRoot),'workflow');
  return{state:path.join(workflow,'workflow-state.json'),history:path.join(workflow,'history','workflow-events.jsonl')};
}

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
function digest(value){return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}
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
function eventsFrom(transition){
  if(!transition?.state||(!transition?.event&&!Array.isArray(transition?.events)))throw new Error('TRANSITION_REQUIRED');
  const events=Array.isArray(transition.events)?transition.events:[transition.event];
  if(events.length===0||events.some(event=>!event||typeof event!=='object'||Array.isArray(event)))throw new Error('TRANSITION_REQUIRED');
  return events;
}
function recordContent(record){
  return{
    sequence:record.sequence,
    previousEventId:record.previousEventId,
    previousEventHash:record.previousEventHash,
    event:record.event,
    stateRevision:record.stateRevision,
    stateDigest:record.stateDigest,
    timestamp:record.timestamp,
  };
}
function receiptedContent(record){
  const {receipt:discarded,...content}=record;
  return content;
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

export function createVerifiedWorkflowStore({projectRoot,receiptAuthority}={}){
  const target=locations(projectRoot);
  if(!receiptAuthority||typeof receiptAuthority.createReceipt!=='function'||typeof receiptAuthority.verifyReceipt!=='function'){
    throw new Error('WORKFLOW_RECEIPT_AUTHORITY_REQUIRED');
  }
  const createReceipt=receiptAuthority.createReceipt.bind(receiptAuthority);
  const verifyReceipt=receiptAuthority.verifyReceipt.bind(receiptAuthority);
  const verifiedLoads=new WeakMap();

  async function verifyPersisted(){
    const [snapshot,records]=await Promise.all([
      readJson(target.state,'WORKFLOW_STATE_SNAPSHOT_INVALID'),
      readJournal(target.history),
    ]);
    exactKeys(snapshot,['formatVersion','stateRevision','stateDigest','journalHead','state'],'WORKFLOW_STATE_SNAPSHOT_INVALID');
    if(snapshot.formatVersion!==1||!Number.isInteger(snapshot.stateRevision)||snapshot.stateRevision<1)throw new Error('WORKFLOW_STATE_REVISION_INVALID');
    exactKeys(snapshot.journalHead,['sequence','eventId','eventHash'],'WORKFLOW_STATE_SNAPSHOT_INVALID');
    if(digest(snapshot.state)!==snapshot.stateDigest)throw new Error('WORKFLOW_STATE_DIGEST_INVALID');
    const rawEventIds=records.map(record=>record?.eventId);
    if(new Set(rawEventIds).size!==rawEventIds.length)throw new Error('WORKFLOW_JOURNAL_REPLAY_DETECTED');
    if(records.length<snapshot.journalHead.sequence)throw new Error('WORKFLOW_JOURNAL_TRUNCATED');
    if(records.length>snapshot.journalHead.sequence)throw new Error('WORKFLOW_JOURNAL_AHEAD_OF_STATE');

    const seen=new Set();
    let previous=null,previousRevision=0,previousDigest=null;
    for(let index=0;index<records.length;index+=1){
      const record=records[index];
      exactKeys(record,['sequence','eventId','previousEventId','previousEventHash','event','eventHash','stateRevision','stateDigest','timestamp','receipt'],'WORKFLOW_JOURNAL_INVALID');
      if(seen.has(record.eventId))throw new Error('WORKFLOW_JOURNAL_REPLAY_DETECTED');
      seen.add(record.eventId);
      if(record.sequence!==index+1)throw new Error('WORKFLOW_JOURNAL_SEQUENCE_INVALID');
      if(record.previousEventId!==(previous?.eventId??null)||record.previousEventHash!==(previous?.eventHash??null))throw new Error('WORKFLOW_JOURNAL_CONTINUITY_INVALID');
      if(!Number.isInteger(record.stateRevision)||record.stateRevision<1||record.stateRevision<previousRevision||record.stateRevision>previousRevision+1)throw new Error('WORKFLOW_JOURNAL_REVISION_INVALID');
      if(record.stateRevision===previousRevision&&record.stateDigest!==previousDigest)throw new Error('WORKFLOW_JOURNAL_REVISION_INVALID');
      timestamp(record.timestamp,'WORKFLOW_JOURNAL_TIMESTAMP_INVALID');
      const expected=digest(recordContent(record));
      if(record.eventId!==expected||record.eventHash!==expected)throw new Error('WORKFLOW_JOURNAL_EVENT_HASH_INVALID');
      let receiptValid=false;
      try{receiptValid=await verifyReceipt({record:structuredClone(receiptedContent(record)),receipt:structuredClone(record.receipt)})===true}catch{}
      if(!receiptValid)throw new Error('WORKFLOW_JOURNAL_RECEIPT_INVALID');
      previous=record;previousRevision=record.stateRevision;previousDigest=record.stateDigest;
    }
    if(!previous)throw new Error('WORKFLOW_JOURNAL_TRUNCATED');
    if(previous.sequence!==snapshot.journalHead.sequence||previous.eventId!==snapshot.journalHead.eventId||previous.eventHash!==snapshot.journalHead.eventHash)throw new Error('WORKFLOW_JOURNAL_HEAD_INVALID');
    if(previous.stateRevision!==snapshot.stateRevision||previous.stateDigest!==snapshot.stateDigest)throw new Error('WORKFLOW_JOURNAL_STATE_MISMATCH');
    validateWorkflowReadinessEvidence(snapshot.state);
    return{snapshot,records};
  }

  async function writeRevision({state,events,revision,records,now}){
    if(!isTrustedWorkflowState(state))throw new Error('WORKFLOW_STATE_PROVENANCE_UNTRUSTED');
    validateWorkflowReadinessEvidence(state);
    const stateDigest=digest(state),nextRecords=[...records];
    let previous=nextRecords.at(-1)??null;
    for(const event of events){
      const partial={
        sequence:nextRecords.length+1,
        previousEventId:previous?.eventId??null,
        previousEventHash:previous?.eventHash??null,
        event:structuredClone(event),
        stateRevision:revision,
        stateDigest,
        timestamp:timestamp(event.at??now,'WORKFLOW_JOURNAL_TIMESTAMP_INVALID'),
      };
      const eventId=digest(partial);
      const unsigned={...partial,eventId,eventHash:eventId};
      const receipt=await createReceipt({record:structuredClone(unsigned)});
      if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))throw new Error('WORKFLOW_JOURNAL_RECEIPT_INVALID');
      const record={...unsigned,receipt:structuredClone(receipt)};
      nextRecords.push(record);previous=record;
    }
    const snapshot={
      formatVersion:1,
      stateRevision:revision,
      stateDigest,
      journalHead:{sequence:previous.sequence,eventId:previous.eventId,eventHash:previous.eventHash},
      state:structuredClone(state),
    };
    await mkdir(path.dirname(target.history),{recursive:true});
    const historyTemporary=`${target.history}.tmp`,stateTemporary=`${target.state}.tmp`;
    await writeFile(historyTemporary,nextRecords.map(record=>JSON.stringify(record)).join('\n')+'\n','utf8');
    await writeFile(stateTemporary,`${JSON.stringify(snapshot,null,2)}\n`,'utf8');
    await rename(historyTemporary,target.history);
    await rename(stateTemporary,target.state);
    return state;
  }

  async function initializeWorkflow({state,now=new Date().toISOString()}={}){
    const fresh=state?.currentGate===WORKFLOW_GATES[0]
      &&state?.status===undefined&&state?.activeRepair===undefined
      &&Array.isArray(state?.configuration?.dashboardSlices)&&state.configuration.dashboardSlices.length===0
      &&state?.configuration?.workPackage===undefined
      &&WORKFLOW_GATES.every((gate,index)=>state?.gates?.[gate]?.status===(index===0?'ready':'locked')
        &&state.gates[gate].delivery===undefined);
    if(!fresh)throw new Error('WORKFLOW_INITIAL_STATE_REQUIRED');
    const event={event:'workflow_initialized',gate:state?.currentGate,interactionMode:state?.configuration?.interactionMode??'team',at:now};
    return writeRevision({state,events:[event],revision:1,records:[],now});
  }

  async function loadVerifiedWorkflow(){
    const verified=await verifyPersisted();
    const state=trustWorkflowState(verified.snapshot.state);
    verifiedLoads.set(state,{
      revision:verified.snapshot.stateRevision,
      digest:verified.snapshot.stateDigest,
      head:verified.snapshot.journalHead,
    });
    return state;
  }

  async function saveWorkflow({loadedState,transition,now=new Date().toISOString()}={}){
    const loaded=verifiedLoads.get(loadedState);
    if(!loaded||!isTrustedWorkflowState(loadedState))throw new Error('WORKFLOW_PERSISTED_STATE_NOT_VERIFIED');
    const events=eventsFrom(transition);
    if(!isTrustedWorkflowState(transition.state))throw new Error('WORKFLOW_STATE_PROVENANCE_UNTRUSTED');
    if(transition.state.projectId!==loadedState.projectId||transition.state.workflowId!==loadedState.workflowId||transition.state.createdAt!==loadedState.createdAt)throw new Error('WORKFLOW_TRANSITION_LINEAGE_INVALID');
    const current=await verifyPersisted();
    if(current.snapshot.stateRevision!==loaded.revision||current.snapshot.stateDigest!==loaded.digest
      ||current.snapshot.journalHead.eventId!==loaded.head.eventId)throw new Error('WORKFLOW_PERSISTED_STATE_STALE');
    const saved=await writeRevision({state:transition.state,events,revision:loaded.revision+1,records:current.records,now});
    verifiedLoads.delete(loadedState);
    return saved;
  }

  return Object.freeze({initializeWorkflow,loadVerifiedWorkflow,saveWorkflow});
}
