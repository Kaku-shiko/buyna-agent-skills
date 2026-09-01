import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {resolveMerchantIdentity} from './resolve-merchant-identity.mjs';

test('generates a deterministic new merchant identity from the approved host',()=>{
  const result=resolveMerchantIdentity({primaryHost:'demo-store.example.test'});
  assert.deepEqual({...result},{status:'candidate',projectId:'demo-store',sellerId:'seller_demo_store',resourceFile:path.join('projects','demo-store','resources.yaml')});
});

test('accepts explicit canonical IDs including underscores',()=>{
  const result=resolveMerchantIdentity({projectId:'demo_store',sellerId:'seller_demo_store'});
  assert.equal(result.sellerId,'seller_demo_store');
});

test('reuses an exact registry identity and blocks collisions',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'merchant-registry-'));
  try{
    const folder=path.join(root,'demo-store');mkdirSync(folder);
    writeFileSync(path.join(folder,'resources.yaml'),'project: {id: demo-store, seller_id: seller_demo_store}\n');
    assert.equal(resolveMerchantIdentity({primaryHost:'demo-store.example.test',registryRoot:root}).status,'existing');
    assert.throws(()=>resolveMerchantIdentity({projectId:'other',sellerId:'seller_demo_store',registryRoot:root}),/MERCHANT_IDENTITY_COLLISION/);
  }finally{rmSync(root,{recursive:true,force:true})}
});

test('blocks an identity when no safe ASCII source exists',()=>{
  assert.throws(()=>resolveMerchantIdentity({primaryHost:'商店.例.jp'}),/PROJECT_ID_SOURCE_REQUIRED/);
});
