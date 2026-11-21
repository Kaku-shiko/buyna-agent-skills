import assert from 'node:assert/strict';
const [command,...args]=process.argv.slice(2),options={};
assert(['preflight','publish','rollback','status'].includes(command),'Use preflight | publish | rollback | status');
for(let i=0;i<args.length;i+=2){assert(['--version','--projects','--request-id','--batch-id'].includes(args[i])&&args[i+1]&&!options[args[i]],'Invalid arguments');options[args[i]]=args[i+1];}
const cookie=process.env.BUYNA_ADMIN_COOKIE;assert(cookie,'BUYNA_ADMIN_COOKIE is required; never pass credentials on the command line');
const base='https://www.buyna.jp/api/admin/';
async function request(route,body){const r=await fetch(base+route,{method:body?'POST':'GET',headers:{cookie,origin:'https://www.buyna.jp','content-type':'application/json','x-buyna-module-operation':'1'},...(body?{body:JSON.stringify(body)}:{})});const result=await r.json();assert(r.ok,JSON.stringify(result));return result;}
if(command==='status'){assert(options['--batch-id']);console.log(JSON.stringify(await request('module-batches/'+options['--batch-id']),null,2));}
else if(command==='rollback'){
 assert(options['--batch-id']&&options['--request-id']);console.log(JSON.stringify(await request('module-batches/rollback',{batchId:options['--batch-id'],requestId:options['--request-id'],confirm:true}),null,2));
}else{
 const projects=(options['--projects']||'').split(',').filter(Boolean),version=options['--version'];assert(projects.length&&version);
 const plan=await request('module-batches/preflight',{projects,version});
 if(command==='preflight')console.log(JSON.stringify(plan,null,2));
 else{assert(options['--request-id'],'Stable --request-id is required for safe retries');console.log(JSON.stringify(await request('module-batches',{projects,version,requestId:options['--request-id'],confirm:true,expectedDeploymentIds:Object.fromEntries(plan.targets.map(t=>[t.project,t.expectedDeploymentId]))}),null,2));}
}
