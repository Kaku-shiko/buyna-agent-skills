import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMerchantObjectKey} from '../../../packages/buyna-merchant-file-core/src/file-core.mjs';
import {createS3ImageStorage} from './s3-image-storage.mjs';
const bytes=Buffer.from([137,80,78,71,13,10,26,10]);
test('S3 adapter pins bucket, rejects cross-tenant keys, encrypts writes and returns fresh links',async()=>{
  const calls=[];class Command{constructor(input){this.input=input;}}
  const commands=Object.fromEntries(['PutObjectCommand','HeadObjectCommand','DeleteObjectCommand','GetObjectCommand'].map(x=>[x,Command]));
  const storage=createS3ImageStorage({buildMerchantObjectKey,bucket:'existing',projectId:'shop-a',sellerId:'seller-a',commands,client:{send:async c=>{calls.push(c.input);return{ContentLength:bytes.length,ContentType:'image/png'};}},signer:async(client,cmd,options)=>({key:cmd.input.Key,expiresIn:options.expiresIn})});
  const key='projects/shop-a/sellers/seller-a/site-banner/home/desktop/a.png';
  await storage.putObject({key,body:bytes,contentType:'image/png'});
  assert.equal(calls[0].Bucket,'existing');assert.equal(calls[0].ServerSideEncryption,'AES256');assert.equal(calls[0].ACL,undefined);
  assert.equal((await storage.signImage({key})).expiresIn,900);
  for(const key of ['projects/shop-b/sellers/seller-a/a.png','projects/shop-a/sellers/seller-a/../b.png']) await assert.rejects(storage.deleteObject({key}),/OUTSIDE_MERCHANT_SCOPE/);
  await assert.rejects(storage.signImage({key,expiresIn:86400}),/INVALID_IMAGE_URL_TTL/);
});
