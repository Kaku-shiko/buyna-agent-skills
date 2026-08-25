const trustedWorkflowStates=new WeakMap();

function canonicalValue(value){
  if(Array.isArray(value))return value.map(canonicalValue);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalValue(value[key])]));
  return value;
}

function fingerprint(state){return JSON.stringify(canonicalValue(state))}

export function trustWorkflowState(state){
  trustedWorkflowStates.set(state,fingerprint(state));
  return state;
}

export function isTrustedWorkflowState(state){
  if(!state||typeof state!=='object')return false;
  try{return trustedWorkflowStates.get(state)===fingerprint(state)}catch{return false}
}
