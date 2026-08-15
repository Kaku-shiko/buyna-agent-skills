import {appendFile, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';

export const WORKFLOW_STATE_PATH=path.join('workflow','workflow-state.json');
function locations(projectRoot){
  if(!String(projectRoot??'').trim())throw new Error('PROJECT_ROOT_REQUIRED');
  const workflow=path.join(path.resolve(projectRoot),'workflow');
  return{state:path.join(workflow,'workflow-state.json'),history:path.join(workflow,'history','workflow-events.jsonl')};
}
export async function loadWorkflow({projectRoot}={}){return JSON.parse(await readFile(locations(projectRoot).state,'utf8'))}
export async function saveTransition({projectRoot,transition}={}){
  if(!transition?.state||!transition?.event)throw new Error('TRANSITION_REQUIRED');
  const target=locations(projectRoot),temporary=`${target.state}.tmp`;
  await mkdir(path.dirname(target.history),{recursive:true});
  await writeFile(temporary,`${JSON.stringify(transition.state,null,2)}\n`,'utf8');
  await rename(temporary,target.state);
  await appendFile(target.history,`${JSON.stringify(transition.event)}\n`,'utf8');
  return transition.state;
}
export async function initializeWorkflow({projectRoot,state,now=new Date().toISOString()}={}){
  return saveTransition({projectRoot,transition:{state,event:{event:'workflow_initialized',gate:state?.currentGate,at:now}}});
}
