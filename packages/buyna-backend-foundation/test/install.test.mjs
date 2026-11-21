import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectBackendBundle,installBackendBundle} from '../src/install.mjs';

test('installation is atomic, repeatable, detects drift and refuses existing projects',t=>{
  const dir=mkdtempSync(join(tmpdir(),'buyna-backend-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const source=join(dir,'source'),target=join(dir,'vendor');
  mkdirSync(join(source,'packages/buyna-backend-foundation'),{recursive:true});
  writeFileSync(join(source,'repository-manifest.json'),JSON.stringify({packages:['buyna-backend-foundation']}));
  writeFileSync(join(source,'packages/buyna-backend-foundation/package.json'),JSON.stringify({version:'1.0.0'}));
  assert.equal(inspectBackendBundle(source).packages.length,1);
  assert.equal(installBackendBundle({repositoryRoot:source,target}).installed,true);
  assert.equal(installBackendBundle({repositoryRoot:source,target}).installed,false);
  writeFileSync(join(target,'packages/buyna-backend-foundation/package.json'),'{}');
  assert.throws(()=>installBackendBundle({repositoryRoot:source,target}),/DRIFT/);
  const existing=join(dir,'existing');mkdirSync(existing);writeFileSync(join(existing,'data'),'keep');
  assert.throws(()=>installBackendBundle({repositoryRoot:source,target:existing}),/REVIEWED_UPGRADE/);
  assert.equal(readFileSync(join(existing,'data'),'utf8'),'keep');
});

test('a declared but missing module blocks the bundle instead of creating a substitute',t=>{
  const dir=mkdtempSync(join(tmpdir(),'buyna-backend-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  writeFileSync(join(dir,'repository-manifest.json'),JSON.stringify({packages:['buyna-backend-foundation']}));
  assert.throws(()=>inspectBackendBundle(dir),/MISSING_FIXED_MODULE/);
});
