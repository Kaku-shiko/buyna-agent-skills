import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Load the actual browser export graph in an environment without Node builtins.
test('browser upload entry runs without Node imports or Buffer', () => {
  const probe = `
    import fs from 'node:fs';
    import vm from 'node:vm';
    import {webcrypto} from 'node:crypto';
    import path from 'node:path';
    const manifest=JSON.parse(fs.readFileSync('package.json','utf8'));
    const entry=typeof manifest.exports==='string'?manifest.exports:
      (manifest.exports['.'].browser??manifest.exports['.'].default??manifest.exports['.']);
    const context=vm.createContext({crypto:webcrypto,TextEncoder,Date});
    const cache=new Map();
    function load(file){
      if(cache.has(file))return cache.get(file);
      const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});
      cache.set(file,m);return m;
    }
    const module=load(path.resolve(entry));
    await module.link((specifier,parent)=>{
      if(!specifier.startsWith('.'))throw Error('BROWSER_IMPORT_FORBIDDEN:'+specifier);
      return load(path.resolve(path.dirname(parent.identifier),specifier));
    });
    await module.evaluate();
    const queue=module.namespace.createUploadQueue({projectId:'project',sellerId:'seller'});
    const item=queue.select({name:'image.png',type:'image/png',size:1}).snapshot.items[0];
    const effect=queue.transition({itemId:item.itemId,event:'start_validation'}).effects[0];
    const executor=module.namespace.createUploadEffectExecutor({
      projectId:'project',sellerId:'seller',
      effectStore:{async acquireEffect(){return vm.runInContext('({outcome:"acquired"})',context)},async completeEffect(){},async failEffect(){}},
      handlers:{async validate_file(){return vm.runInContext('({valid:true})',context)}}
    });
    await executor.execute(effect);
  `;
  const result=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',probe],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
