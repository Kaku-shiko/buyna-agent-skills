import {appendFile,mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';

function locations(projectRoot){
  if(!String(projectRoot??'').trim())throw new Error('PROJECT_ROOT_REQUIRED');
  const root=path.resolve(projectRoot,'workflow','merchant-provisioning');
  return{state:path.join(root,'state.json'),history:path.join(root,'events.jsonl')};
}
export async function loadProvisioning({projectRoot}={}){return JSON.parse(await readFile(locations(projectRoot).state,'utf8'))}
export async function saveProvisioningTransition({projectRoot,transition}={}){
  if(!transition?.state||!transition?.event)throw new Error('TRANSITION_REQUIRED');
  const target=locations(projectRoot),temporary=`${target.state}.tmp`;
  await mkdir(path.dirname(target.state),{recursive:true});
  await writeFile(temporary,`${JSON.stringify(transition.state,null,2)}\n`,'utf8');
  await rename(temporary,target.state);
  await appendFile(target.history,`${JSON.stringify(transition.event)}\n`,'utf8');
  return transition.state;
}
