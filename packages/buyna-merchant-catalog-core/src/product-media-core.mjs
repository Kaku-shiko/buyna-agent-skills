function failure(code,details={}){const error=new Error(code);error.code=code;Object.assign(error,details);throw error}
function text(value,code){const normalized=String(value??'').trim();if(!normalized)failure(code);return normalized}
function callable(owner,name){if(typeof owner?.[name]!=='function')failure(`PRODUCT_MEDIA_${name.replace(/[A-Z]/g,letter=>`_${letter}`).toUpperCase()}_REQUIRED`)}
function scopeId(value,code){const normalized=text(value,code);if(!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(normalized))failure(code);return normalized}
function imageId(value){return text(value,'PRODUCT_IMAGE_ID_REQUIRED')}
function productId(value){return text(value,'PRODUCT_ID_REQUIRED')}
function altText(value){return String(value??'').trim().slice(0,180)}
function fileId(file){return text(file?.id,'PRODUCT_MEDIA_FILE_ID_REQUIRED')}

export function createProductMediaService({projectId:projectIdValue,sellerId: sellerIdValue,catalogService,fileService,mediaStore,maxImages=8}={}){
  const scope=Object.freeze({projectId:scopeId(projectIdValue,'INVALID_PROJECT_ID'),sellerId:scopeId(sellerIdValue,'INVALID_SELLER_ID')});
  if(fileService?.scope?.projectId!==scope.projectId||fileService?.scope?.sellerId!==scope.sellerId)failure('PRODUCT_MEDIA_FILE_SCOPE_MISMATCH');
  callable(catalogService,'createProduct');callable(fileService,'confirmUpload');callable(fileService,'softDelete');callable(mediaStore,'transaction');callable(mediaStore,'getProductWithImages');callable(mediaStore,'getProductImageByFileId');
  const imageLimit=Number(maxImages);if(!Number.isSafeInteger(imageLimit)||imageLimit<1||imageLimit>20)failure('PRODUCT_IMAGE_LIMIT_INVALID');
  const scoped=()=>Object.freeze({...scope});
  const hydrate=async id=>mediaStore.getProductWithImages({scope:scoped(),productId:productId(id)});
  async function compensate(file){
    if(file?.created!==true)return false;
    try{await fileService.softDelete({fileId:fileId(file)})}catch{return false}return true
  }
  async function compensateIfUnreferenced(file){const linked=await mediaStore.getProductImageByFileId({scope:scoped(),fileId:fileId(file)});if(linked)return false;return compensate(file)}
  async function confirm(input,id){
    const objectKey=text(input.objectKey,'PRODUCT_IMAGE_OBJECT_KEY_REQUIRED');
    return fileService.confirmUpload({objectKey,requestKey:input.requestKey==null?undefined:text(input.requestKey,'PRODUCT_IMAGE_REQUEST_KEY_REQUIRED'),entityType:'products',entityId:id,variant:text(input.variant??'original','PRODUCT_IMAGE_VARIANT_REQUIRED'),originalFilename:String(input.originalFilename??'')})
  }

  async function attachUploadedImage(input={}){
    const id=productId(input.productId),file=await confirm(input,id);
    try{
      await mediaStore.transaction(async tx=>{
        for(const name of ['getProductForUpdate','listProductImagesForUpdate','getProductImageByFileIdForUpdate','attachProductImage'])callable(tx,name);
        const product=await tx.getProductForUpdate({scope:scoped(),productId:id});if(!product)failure('PRODUCT_NOT_FOUND');
        const existing=await tx.getProductImageByFileIdForUpdate({scope:scoped(),fileId:fileId(file)});
        if(existing){if(existing.productId!==id)failure('PRODUCT_IMAGE_FILE_ALREADY_LINKED');return existing}
        const current=await tx.listProductImagesForUpdate({scope:scoped(),productId:id});if(!Array.isArray(current))failure('PRODUCT_IMAGE_STORE_RESULT_INVALID');
        if(current.length>=imageLimit)failure('PRODUCT_IMAGE_LIMIT_REACHED',{maxImages:imageLimit});
        await tx.attachProductImage({scope:scoped(),productId:id,fileId:fileId(file),altText:altText(input.altText||product.name),position:current.length+1,isMain:current.length===0,variantId:input.variantId==null?null:text(input.variantId,'PRODUCT_VARIANT_ID_INVALID')});
      });
    }catch(error){
      const linked=await mediaStore.getProductImageByFileId({scope:scoped(),fileId:fileId(file)});
      if(linked?.productId===id)return hydrate(id);
      if(!linked)await compensate(file);
      throw error
    }
    return hydrate(id);
  }

  return Object.freeze({
    scope,
    maxImages:imageLimit,
    async createDraft(input={}){const draft=await catalogService.createProduct({...input,status:'draft'});return hydrate(draft.id)},
    async createDraftWithImage({product={},image}={}){
      const draft=await catalogService.createProduct({...product,status:'draft'});
      if(!image)return hydrate(draft.id);
      try{return await attachUploadedImage({...image,productId:draft.id})}catch(cause){const error=new Error('PRODUCT_MEDIA_ATTACH_FAILED',{cause});error.code='PRODUCT_MEDIA_ATTACH_FAILED';error.draftProductId=draft.id;error.retryable=true;throw error}
    },
    attachUploadedImage,
    async setMainImage(input={}){
      const id=productId(input.productId),target=imageId(input.imageId);
      await mediaStore.transaction(async tx=>{callable(tx,'getProductForUpdate');callable(tx,'setMainProductImage');if(!await tx.getProductForUpdate({scope:scoped(),productId:id}))failure('PRODUCT_NOT_FOUND');if(!await tx.setMainProductImage({scope:scoped(),productId:id,imageId:target}))failure('PRODUCT_IMAGE_NOT_FOUND')});
      return hydrate(id);
    },
    async reorderImages(input={}){
      const id=productId(input.productId),ids=input.imageIds;if(!Array.isArray(ids)||!ids.length)failure('PRODUCT_IMAGE_ORDER_REQUIRED');
      const normalized=ids.map(imageId);if(new Set(normalized).size!==normalized.length)failure('PRODUCT_IMAGE_ID_DUPLICATE');
      await mediaStore.transaction(async tx=>{callable(tx,'getProductForUpdate');callable(tx,'listProductImagesForUpdate');callable(tx,'reorderProductImages');if(!await tx.getProductForUpdate({scope:scoped(),productId:id}))failure('PRODUCT_NOT_FOUND');const current=await tx.listProductImagesForUpdate({scope:scoped(),productId:id});const currentIds=new Set(current.map(item=>String(item.id)));if(currentIds.size!==normalized.length||normalized.some(value=>!currentIds.has(value)))failure('PRODUCT_IMAGE_ORDER_SCOPE_MISMATCH');await tx.reorderProductImages({scope:scoped(),productId:id,items:normalized.map((value,index)=>({imageId:value,position:index+1}))})});
      return hydrate(id);
    },
    async replaceUploadedImage(input={}){
      const id=productId(input.productId),target=imageId(input.imageId),file=await confirm(input,id);let replacement;
      try{replacement=await mediaStore.transaction(async tx=>{callable(tx,'getProductForUpdate');callable(tx,'replaceProductImage');if(!await tx.getProductForUpdate({scope:scoped(),productId:id}))failure('PRODUCT_NOT_FOUND');const result=await tx.replaceProductImage({scope:scoped(),productId:id,imageId:target,newFileId:fileId(file),altText:input.altText===undefined?undefined:altText(input.altText)});if(!result)failure('PRODUCT_IMAGE_NOT_FOUND');return result})}catch(error){await compensateIfUnreferenced(file);throw error}
      let cleanupPending=false;try{callable(fileService,'replaceObject');const cleanup=await fileService.replaceObject({oldFileId:text(replacement.oldFileId,'PRODUCT_MEDIA_OLD_FILE_ID_REQUIRED'),newFileId:fileId(file)});cleanupPending=cleanup.cleanupPending===true}catch{cleanupPending=true}
      return Object.freeze({...await hydrate(id),cleanupPending});
    },
    async updateImageAltText(input={}){
      const id=productId(input.productId),target=imageId(input.imageId);
      await mediaStore.transaction(async tx=>{callable(tx,'getProductForUpdate');callable(tx,'updateProductImageAltText');if(!await tx.getProductForUpdate({scope:scoped(),productId:id}))failure('PRODUCT_NOT_FOUND');if(!await tx.updateProductImageAltText({scope:scoped(),productId:id,imageId:target,altText:altText(input.altText)}))failure('PRODUCT_IMAGE_NOT_FOUND')});
      return hydrate(id);
    },
    async removeImage(input={}){
      const id=productId(input.productId),target=imageId(input.imageId);let removed;
      removed=await mediaStore.transaction(async tx=>{callable(tx,'getProductForUpdate');callable(tx,'removeProductImage');if(!await tx.getProductForUpdate({scope:scoped(),productId:id}))failure('PRODUCT_NOT_FOUND');const result=await tx.removeProductImage({scope:scoped(),productId:id,imageId:target});if(!result)failure('PRODUCT_IMAGE_NOT_FOUND');return result.removed});
      let cleanupPending=false;try{await fileService.softDelete({fileId:text(removed.fileId,'PRODUCT_MEDIA_OLD_FILE_ID_REQUIRED')})}catch{cleanupPending=true}
      return Object.freeze({...await hydrate(id),cleanupPending});
    },
  });
}
