import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {resolveMerchantIdentity} from './resolve-merchant-identity.mjs';

test('generates a deterministic new merchant identity from the approved host',()=>{
  const result=resolveMerchantIdentity({primaryHost:'chameleon.buyna.ai'});
  assert.deepEqual({...result},{status:'candidate',projectId:'chameleon',sellerId:'seller_chameleon',resourceFile:path.join('projects','chameleon','resources.yaml')});
});

test('accepts explicit canonical IDs including underscores',()=>{
  const result=resolveMerchantIdentity({projectId:'chameleon_shop',sellerId:'seller_chameleon'});
  assert.equal(result.sellerId,'seller_chameleon');
});

test('reuses an exact registry identity and blocks collisions',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'merchant-registry-'));
  try{
    const folder=path.join(root,'chameleon');mkdirSync(folder);
    writeFileSync(path.join(folder,'resources.yaml'),'project: {id: chameleon, seller_id: seller_chameleon}\n');
    assert.equal(resolveMerchantIdentity({primaryHost:'chameleon.buyna.ai',registryRoot:root}).status,'existing');
    assert.throws(()=>resolveMerchantIdentity({projectId:'other',sellerId:'seller_chameleon',registryRoot:root}),/MERCHANT_IDENTITY_COLLISION/);
  }finally{rmSync(root,{recursive:true,force:true})}
});

test('blocks an identity when no safe ASCII source exists',()=>{
  assert.throws(()=>resolveMerchantIdentity({primaryHost:'商店.例.jp'}),/PROJECT_ID_SOURCE_REQUIRED/);
});
