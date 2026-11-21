// Compatibility wrapper: installation policy belongs to the unified entrypoint.
import {existsSync} from 'node:fs';
const entry=['../../../shared-modules/cli.mjs','../../../../shared-modules/cli.mjs'].map(value=>new URL(value,import.meta.url)).find(value=>existsSync(value));
if(!entry)throw Error('SHARED_MODULE_DISTRIBUTION_REQUIRED');
const {main}=await import(entry.href);
const [command,project,version,...extra]=process.argv.slice(2);
try{
  if(extra.length)throw Error('INVALID_ARGUMENTS');
  main([command,'service-subscription','--project',project,...(version?['--version',version]:[])]);
}catch(error){console.error(error.message);process.exitCode=1;}
