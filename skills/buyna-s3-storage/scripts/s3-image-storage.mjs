function fail(code) { throw Object.assign(new Error(code), {code}); }

/** SDK constructors are injected so the fixed module has no vendor dependency. */
export function createS3ImageStorage({client,commands,signer,bucket,projectId,sellerId,buildMerchantObjectKey}={}) {
  if(typeof buildMerchantObjectKey!=='function') fail('IMAGE_KEY_BUILDER_REQUIRED');
  if(!bucket||typeof client?.send!=='function'||typeof signer!=='function') fail('IMAGE_STORAGE_NOT_CONFIGURED');
  for(const name of ['PutObjectCommand','HeadObjectCommand','DeleteObjectCommand','GetObjectCommand']) {
    if(typeof commands?.[name]!=='function') fail('IMAGE_STORAGE_COMMAND_MISSING');
  }
  const sample=buildMerchantObjectKey({projectId,sellerId,entityType:'images',entityId:'scope',objectId:'scope',extension:'png'});
  const prefix=sample.split('/').slice(0,4).join('/')+'/';
  function owned(key) {
    if(typeof key!=='string'||!key.startsWith(prefix)||key.includes('..')||key.includes('\\')||/[\u0000-\u001f]/.test(key)) fail('OBJECT_KEY_OUTSIDE_MERCHANT_SCOPE');
    return key;
  }
  return {
    async putObject({key,body,contentType}) {
      const result=await client.send(new commands.PutObjectCommand({Bucket:bucket,Key:owned(key),Body:body,ContentType:contentType,ServerSideEncryption:'AES256',CacheControl:'private, max-age=31536000'}));
      return {etag:result.ETag??null};
    },
    async headObject({key}) {
      try {
        const result=await client.send(new commands.HeadObjectCommand({Bucket:bucket,Key:owned(key)}));
        return {size:result.ContentLength,contentType:result.ContentType,etag:result.ETag??null};
      } catch(error) {
        if(error?.name==='NotFound'||error?.name==='NoSuchKey') return null;
        throw error;
      }
    },
    async deleteObject({key}) { await client.send(new commands.DeleteObjectCommand({Bucket:bucket,Key:owned(key)})); },
    async signImage({key,expiresIn=900}) {
      if(!Number.isInteger(expiresIn)||expiresIn<1||expiresIn>3600) fail('INVALID_IMAGE_URL_TTL');
      return signer(client,new commands.GetObjectCommand({Bucket:bucket,Key:owned(key)}),{expiresIn});
    },
  };
}

