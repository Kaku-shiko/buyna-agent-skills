import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildBundle,validateBundle,installBundle,verifyInstalled,rollbackInstalled,sha256} from '../scripts/distribution.mjs';

const root=path.resolve(import.meta.dirname,'..');
test('package is deterministic, runtime-only and rejects tampering/traversal',()=>{
  const bundle=buildBundle(root), bytes=Buffer.from(JSON.stringify(bundle));
  assert.deepEqual(buildBundle(root),bundle);
  assert.ok(bundle.files.every(file=>!file.path.includes('.test.')));
  const metadata=JSON.parse(bundle.files.find(file=>file.path==='package.json').content);
  assert.equal(metadata.exports['./server-proxy'],'./src/server-proxy.ts');
  assert.ok(bundle.files.some(file=>file.path==='src/server-proxy.ts'));
  assert.equal(validateBundle(bytes,sha256(bytes)).version,JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version);
  assert.throws(()=>validateBundle(bytes,'0'.repeat(64)),/DIGEST/);
  bundle.files[0].path='../escape';const bad=Buffer.from(JSON.stringify(bundle));
  assert.throws(()=>validateBundle(bad,sha256(bad)),/UNSAFE/);
});
test('installation is pinned, repeatable and retains a verified rollback version',()=>{
  const project=fs.mkdtempSync(path.join(os.tmpdir(),'subscription-package-'));
  try {
    const bundle=buildBundle(root),bytes=Buffer.from(JSON.stringify(bundle)),digest=sha256(bytes);
    const first=installBundle(bytes,digest,project,'fixture');verifyInstalled(project,first);
    assert.equal(installBundle(bytes,digest,project,'fixture').previous,null);
    const originalVersion=bundle.version,parts=originalVersion.split('.').map(Number);parts[2]++;bundle.version=parts.join('.');const pkg=bundle.files.find(f=>f.path==='package.json');const metadata=JSON.parse(pkg.content);metadata.version=bundle.version;pkg.content=JSON.stringify(metadata);pkg.sha256=sha256(pkg.content);
    const next=Buffer.from(JSON.stringify(bundle));const upgraded=installBundle(next,sha256(next),project,'fixture');
    assert.equal(upgraded.previous.version,originalVersion);verifyInstalled(project,upgraded.previous);
    fs.appendFileSync(path.join(project,upgraded.path,'ui/SubscriptionPanel.jsx'),'tamper');
    assert.throws(()=>verifyInstalled(project,upgraded),/DIGEST/);
    verifyInstalled(project,upgraded.previous);
    assert.equal(rollbackInstalled(project).version,originalVersion);
    assert.equal(JSON.parse(fs.readFileSync(path.join(project,'subscription-package.lock.json'))).version,originalVersion);
    assert.throws(()=>rollbackInstalled(project),/NO_PREVIOUS/);
  } finally {fs.rmSync(project,{recursive:true,force:true});}
});
