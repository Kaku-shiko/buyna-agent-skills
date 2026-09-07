function fail(code){const error=new Error(code);error.code=code;throw error}
function text(value,code){if(typeof value!=='string'||!value.trim())fail(code);return value.trim()}

// Browser orchestration only. Server adapters own auth, storage targets and DB writes.
export function createImageUploadClient({api,fetchImpl=globalThis.fetch}={}){
  for(const name of ['prepareUpload','attachImage','getEntity']){
    if(typeof api?.[name]!=='function')fail('IMAGE_UPLOAD_API_REQUIRED');
  }
  if(typeof fetchImpl!=='function')fail('IMAGE_UPLOAD_FETCH_REQUIRED');
  return Object.freeze({
    async saveImage({entityId,file,requestKey,altText='',signal}={}){
      const id=text(entityId,'IMAGE_ENTITY_ID_REQUIRED');
      const key=text(requestKey,'IMAGE_REQUEST_KEY_REQUIRED');
      // Retain the File/Blob outside the queue's serializable metadata snapshot.
      if(!file||typeof file.arrayBuffer!=='function'||typeof file.slice!=='function')fail('IMAGE_FILE_BYTES_REQUIRED');
      if(!Number.isSafeInteger(file.size)||file.size<=0)fail('IMAGE_FILE_SIZE_INVALID');
      const filename=text(file.name,'IMAGE_FILENAME_REQUIRED');
      const contentType=text(file.type,'IMAGE_CONTENT_TYPE_REQUIRED');
      const upload=await api.prepareUpload({entityId:id,filename,contentType,size:file.size,requestKey:key,signal});
      const uploadId=text(upload?.uploadId,'IMAGE_UPLOAD_ID_REQUIRED');
      const url=text(upload?.url,'IMAGE_UPLOAD_URL_REQUIRED');
      if(!/^https?:\/\//.test(url))fail('IMAGE_UPLOAD_URL_INVALID');
      const response=await fetchImpl(url,{method:'PUT',headers:upload.headers??{},body:file,signal});
      if(!response?.ok)fail('IMAGE_UPLOAD_TRANSFER_FAILED');
      const attached=await api.attachImage({entityId:id,uploadId,requestKey:key,altText,signal});
      const imageId=text(attached?.imageId,'IMAGE_RELATION_ID_REQUIRED');
      const entity=await api.getEntity({entityId:id,signal});
      const image=entity?.images?.find(image=>image.id===imageId);
      if(entity?.id!==id||!image||typeof image.url!=='string'||!image.url||/^(blob:|data:|file:)/i.test(image.url))fail('IMAGE_PERSISTENCE_NOT_CONFIRMED');
      return{entity,imageId};
    },
  });
}
