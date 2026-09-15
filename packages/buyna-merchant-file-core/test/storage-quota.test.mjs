import test from 'node:test';
import assert from 'node:assert/strict';
import {MERCHANT_STORAGE_LIMITS,merchantStorageQuota,assertStorageCapacity,createMerchantImageWriter} from '../src/file-core.mjs';
test('Basic is 500 MiB and Pro is 2 GiB; boundaries include all reservations',()=>{
  assert.equal(MERCHANT_STORAGE_LIMITS.basic,524288000);assert.equal(MERCHANT_STORAGE_LIMITS.pro,2147483648);
  for(const plan of ['basic','pro']){
    const limit=MERCHANT_STORAGE_LIMITS[plan];
    assert.doesNotThrow(()=>assertStorageCapacity({plan,usedBytes:limit-20,reservedBytes:10,additionalBytes:10}));
    assert.throws(()=>assertStorageCapacity({plan,usedBytes:limit-20,reservedBytes:10,additionalBytes:11}),/STORAGE_QUOTA_EXCEEDED/);
  }
});
test('unknown plans and invalid usage fail closed; downgrade preserves existing bytes',()=>{
  for(const plan of [undefined,'free','enterprise','__proto__'])assert.throws(()=>merchantStorageQuota({plan}),/STORAGE_PLAN_UNAVAILABLE/);
  for(const usedBytes of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>merchantStorageQuota({plan:'basic',usedBytes}));
  const q=merchantStorageQuota({plan:'basic',usedBytes:800*1024*1024});assert.equal(q.overLimit,true);assert.equal(q.remainingBytes,0);assert.equal(q.usedBytes,800*1024*1024);
  assert.equal(merchantStorageQuota({plan:'pro',usedBytes:q.usedBytes}).overLimit,false);
});
test('new image writer cannot operate without server quota enforcement',()=>{
  assert.throws(()=>createMerchantImageWriter({projectId:'shop',sellerId:'seller',storage:{putObject(){},headObject(){}},metadata:{reserveImageWrite(){},commitImageWrite(){}}}),/STORAGE_QUOTA_ADAPTER_REQUIRED/);
});
test('quota denial occurs before S3 transfer; stored bytes are charged before attachment',async()=>{
  const events=[],bytes=Buffer.from([137,80,78,71,13,10,26,10,0]);let allow=false;
  const writer=createMerchantImageWriter({projectId:'shop',sellerId:'seller',
    metadata:{async reserveImageWrite(x){return {...x,state:'acquired',leaseToken:'lease'};},async commitImageWrite(){events.push('attach');return{id:'file'};}},
    storage:{async putObject(){events.push('put');},async headObject(){return {size:bytes.length,contentType:'image/png'};}},
    quota:{async reserve(){events.push('reserve');if(!allow)throw new Error('STORAGE_QUOTA_EXCEEDED');},async confirm(){events.push('charge');}},
  });
  const input={requestKey:'r1',entityType:'site-banner',entityId:'home',expectedRevision:0,contentType:'image/png',bytes};
  await assert.rejects(writer.write(input),/STORAGE_QUOTA_EXCEEDED/);assert.deepEqual(events,['reserve']);
  allow=true;events.length=0;await writer.write({...input,requestKey:'r2'});assert.deepEqual(events,['reserve','put','charge','attach']);
});
