import {createHash} from 'node:crypto';

const trustedWorkflowStates=new WeakMap();
const workflowTransitionProofs=new WeakMap();

function canonicalValue(value){
  if(Array.isArray(value))return value.map(canonicalValue);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalValue(value[key])]));
  return value;
}

function fingerprint(state){
  return createHash('sha256').update(JSON.stringify(canonicalValue(state))).digest('hex');
}

export function trustWorkflowState(state){
  trustedWorkflowStates.set(state,fingerprint(state));
  return state;
}

export function isTrustedWorkflowState(state){
  if(!state||typeof state!=='object')return false;
  try{return trustedWorkflowStates.get(state)===fingerprint(state)}catch{return false}
}

function transitionFingerprint(value){
  try{return fingerprint(value)}catch{return null}
}

export function issueWorkflowTransition({parentState,state,event,events}){
  if(!isTrustedWorkflowState(parentState)||!isTrustedWorkflowState(state))throw new Error('WORKFLOW_TRANSITION_PROOF_INVALID');
  const canonicalEvents=Array.isArray(events)?events:[event];
  if(canonicalEvents.length===0||canonicalEvents.some(item=>!item||typeof item!=='object'||Array.isArray(item)))throw new Error('WORKFLOW_TRANSITION_PROOF_INVALID');
  const transitionProof=Object.freeze(Object.create(null));
  workflowTransitionProofs.set(transitionProof,{
    parentFingerprint:fingerprint(parentState),stateFingerprint:fingerprint(state),
    eventFingerprint:transitionFingerprint(event),eventsFingerprint:transitionFingerprint(canonicalEvents),
  });
  return Object.freeze({state,event,...(Array.isArray(events)?{events}:{}),transitionProof});
}

export function consumeWorkflowTransitionProof({transitionProof,parentState,state,event,events}){
  const recorded=workflowTransitionProofs.get(transitionProof);
  workflowTransitionProofs.delete(transitionProof);
  const canonicalEvents=Array.isArray(events)?events:[event];
  if(!recorded||!isTrustedWorkflowState(parentState)||!isTrustedWorkflowState(state)
    ||recorded.parentFingerprint!==transitionFingerprint(parentState)
    ||recorded.stateFingerprint!==transitionFingerprint(state)
    ||recorded.eventFingerprint!==transitionFingerprint(event)
    ||recorded.eventsFingerprint!==transitionFingerprint(canonicalEvents))throw new Error('WORKFLOW_TRANSITION_PROOF_INVALID');
  return canonicalEvents;
}
