import test from 'node:test';
import assert from 'node:assert/strict';
import {createMerchantImageWriter,validateImageBytes} from '../src/file-core.mjs';

const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const input={requestKey:'upload-1',entityType:'site-banner',entityId:'home',variant:'desktop',expectedRevision:0,bytes,contentType:'image/png'};
function fixture({lostAck=false,failHead=false}={}) {
  const events=[],requests=new Map(),objects=new Map();let revision=0;
  const metadata={
    async reserveImageWrite(x) {
      events.push('reserve'); const previous=requests.get(x.requestKey);
      if(previous) return {...previous,state:previous.state==='committed'?'committed':'busy'};
      const claim={...x,state:'acquired',leaseToken:'lease-1'};requests.set(x.requestKey,claim);return claim;
    },
    async commitImageWrite(x) {
      events.push('commit');assert.equal(x.expectedRevision,revision);
      const row=requests.get(x.requestKey);assert.equal(row.leaseToken,x.leaseToken);
      revision++;const file={id:'file-1',objectKey:x.objectKey,revision};
      requests.set(x.requestKey,{...row,state:'committed',file});
      if(lostAck){lostAck=false;throw new Error('CONNECTION_LOST_AFTER_COMMIT');}
      return file;
    },
  };
  const storage={
    async putObject(x){events.push('put');objects.set(x.key,x);},
    async headObject({key}){events.push('head');if(failHead)return null;const x=objects.get(key);return{size:x.body.length,contentType:x.contentType,etag:'etag'};},
    async deleteObject(){events.push('delete');throw new Error('MUST_NOT_DELETE');},
    async signImage(){throw new Error('READ_LINK_FAILED');},
  };
  return {writer:createMerchantImageWriter({projectId:'shop-a',sellerId:'seller-a',storage,metadata}),events,requests,objects,storage};
}
test('validates MIME, signature, policy and actual byte length',()=>{
  assert.equal(validateImageBytes({bytes,contentType:'image/png'}).extension,'png');
  for(const contentType of ['image/jpeg','image/svg+xml','__proto__']) assert.throws(()=>validateImageBytes({bytes,contentType}));
  assert.throws(()=>validateImageBytes({bytes,contentType:'image/png',maxBytes:1}),/IMAGE_SIZE_NOT_ALLOWED/);
  assert.throws(()=>validateImageBytes({bytes,contentType:'image/png',maxBytes:NaN}),/INVALID_IMAGE_SIZE_POLICY/);
});
test('durably tracks candidate, uploads, confirms and commits, with stable replay',async()=>{
  const f=fixture();const a=await f.writer.write(input);const b=await f.writer.write(input);
  assert.deepEqual(f.events,['reserve','put','head','commit','reserve']);assert.equal(b.replayed,true);assert.deepEqual(a.file,b.file);
  assert.match(a.file.objectKey,/^projects\/shop-a\/sellers\/seller-a\/site-banner\/home\/desktop\//);
});
test('lost database commit acknowledgement does not delete new image; retry recovers',async()=>{
  const f=fixture({lostAck:true});await assert.rejects(f.writer.write(input),/CONNECTION_LOST/);
  const recovered=await f.writer.write(input);assert.equal(recovered.saved,true);assert.equal(recovered.replayed,true);
  assert.equal(f.objects.size,1);assert.equal(f.events.includes('delete'),false);
});
test('display URL failure after save cannot compensate a committed write',async()=>{
  const f=fixture();const saved=await f.writer.write(input);
  await assert.rejects(f.storage.signImage({key:saved.file.objectKey}),/READ_LINK_FAILED/);
  assert.equal(f.objects.has(saved.file.objectKey),true);assert.equal(f.requests.get(input.requestKey).state,'committed');
});
test('confirmation failure keeps a tracked pending candidate and rejects overlapping retry',async()=>{
  const f=fixture({failHead:true});await assert.rejects(f.writer.write(input),/IMAGE_UPLOAD_NOT_CONFIRMED/);
  await assert.rejects(f.writer.write(input),/IMAGE_WRITE_IN_PROGRESS/);
  assert.equal(f.requests.size,1);assert.equal(f.events.includes('commit'),false);assert.equal(f.events.includes('delete'),false);
});
test('same request with changed bytes or target is rejected before another upload',async()=>{
  const f=fixture();await f.writer.write(input);
  await assert.rejects(f.writer.write({...input,entityId:'different'}),/IMAGE_REQUEST_CONFLICT/);
  assert.equal(f.events.filter(x=>x==='put').length,1);
});
test('missing revision and invalid tenant never reach storage',async()=>{
  const f=fixture();await assert.rejects(f.writer.write({...input,expectedRevision:undefined}),/IMAGE_REVISION_REQUIRED/);
  assert.deepEqual(f.events,[]);assert.throws(()=>createMerchantImageWriter({projectId:'../b',sellerId:'a'}),/INVALID_PROJECT_ID/);
});
