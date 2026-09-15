import {createHash, randomUUID} from 'node:crypto';
import {buildMerchantObjectKey} from './file-core.mjs';

function fail(code) { throw Object.assign(new Error(code), {code}); }
const formats = {
  'image/jpeg': {extension:'jpg', matches:b=>b[0]===255 && b[1]===216 && b[2]===255},
  'image/png': {extension:'png', matches:b=>b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))},
  'image/webp': {extension:'webp', matches:b=>b.subarray(0,4).toString()==='RIFF' && b.subarray(8,12).toString()==='WEBP'},
};

// Signature validation is a format guard, not a complete image decoder.
export function validateImageBytes({bytes,contentType,maxBytes=5*1024*1024}={}) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<=0) fail('INVALID_IMAGE_SIZE_POLICY');
  const format=Object.hasOwn(formats,contentType)?formats[contentType]:null;
  if(!format) fail('IMAGE_TYPE_NOT_ALLOWED');
  if(!(bytes instanceof Uint8Array)||!bytes.byteLength||bytes.byteLength>maxBytes) fail('IMAGE_SIZE_NOT_ALLOWED');
  const body=Buffer.from(bytes);
  if(!format.matches(body)) fail('IMAGE_CONTENT_MISMATCH');
  return {body,contentType,size:body.length,extension:format.extension,sha256:createHash('sha256').update(body).digest('hex')};
}

/** Durable write protocol. Metadata adapter owns SQL transactions and leases. */
export function createMerchantImageWriter({projectId,sellerId,storage,metadata,quota,maxBytes=5*1024*1024}={}) {
  const scope=Object.freeze({projectId,sellerId});
  // Validate scope before any adapter can run.
  buildMerchantObjectKey({...scope,entityType:'images',entityId:'scope',objectId:'scope',extension:'png'});
  for(const name of ['reserveImageWrite','commitImageWrite']) if(typeof metadata?.[name]!=='function') fail('IMAGE_WRITE_ADAPTER_MISSING');
  if(typeof storage?.putObject!=='function'||typeof storage?.headObject!=='function') fail('IMAGE_STORAGE_ADAPTER_MISSING');
  if(typeof quota?.reserve!=='function'||typeof quota?.confirm!=='function') fail('STORAGE_QUOTA_ADAPTER_REQUIRED');
  return {
    async write({requestKey,entityType,entityId,variant='original',expectedRevision,bytes,contentType}={}) {
      if(typeof requestKey!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(requestKey)) fail('INVALID_UPLOAD_REQUEST_KEY');
      if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0) fail('IMAGE_REVISION_REQUIRED');
      const image=validateImageBytes({bytes,contentType,maxBytes});
      const fingerprint=createHash('sha256').update(JSON.stringify([entityType,entityId,variant,expectedRevision,image.contentType,image.sha256])).digest('hex');
      const objectKey=buildMerchantObjectKey({...scope,entityType,entityId,variant,objectId:randomUUID(),extension:image.extension});
      const slot={entityType,entityId,variant};
      // The durable candidate is recorded BEFORE S3. Retries recover this same key.
      const claim=await metadata.reserveImageWrite({scope:{...scope},requestKey,fingerprint,slot,expectedRevision,objectKey,contentType:image.contentType,size:image.size,sha256:image.sha256});
      if(claim?.fingerprint!==fingerprint) fail('IMAGE_REQUEST_CONFLICT');
      if(claim.state==='committed') return {saved:true,replayed:true,file:claim.file};
      if(claim.state==='busy') fail('IMAGE_WRITE_IN_PROGRESS');
      if(claim.state!=='acquired'||typeof claim.leaseToken!=='string'||!claim.leaseToken) fail('INVALID_IMAGE_WRITE_CLAIM');
      const expectedPrefix=buildMerchantObjectKey({...scope,...slot,objectId:'scope',extension:image.extension}).replace(`scope.${image.extension}`,'');
      if(typeof claim.objectKey!=='string'||!claim.objectKey.startsWith(expectedPrefix)||!/^[-A-Za-z0-9]+\.(?:jpg|png|webp)$/.test(claim.objectKey.slice(expectedPrefix.length))) fail('INVALID_IMAGE_WRITE_KEY');
      await quota.reserve({scope:{...scope},requestKey,objectKey:claim.objectKey,size:image.size});
      await storage.putObject({key:claim.objectKey,body:image.body,contentType:image.contentType});
      const stored=await storage.headObject({key:claim.objectKey});
      if(!stored||stored.size!==image.size||stored.contentType!==image.contentType) fail('IMAGE_UPLOAD_NOT_CONFIRMED');
      // A confirmed object consumes space even if attaching it later fails.
      await quota.confirm({scope:{...scope},requestKey,objectKey:claim.objectKey,size:image.size});
      // This atomic transaction binds the slot, file and request, and enqueues
      // old-object cleanup. No delete/URL signing occurs in the write path.
      const file=await metadata.commitImageWrite({scope:{...scope},requestKey,fingerprint,leaseToken:claim.leaseToken,slot,expectedRevision,objectKey:claim.objectKey,contentType:image.contentType,size:image.size,sha256:image.sha256,etag:stored.etag??null});
      return {saved:true,replayed:false,file};
    },
  };
}
