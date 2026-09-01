import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductMediaService} from '../src/catalog-core.mjs';

function fixture({images=[],maxImages=4}={}){
  const calls=[];
  let rows=images.map(item=>({...item}));
  const product={id:'product-1',name:'Tea',status:'draft'};
  const catalogService={async createProduct(input){calls.push(['createProduct',input]);return product}};
  const fileService={
    scope:Object.freeze({projectId:'project-a',sellerId:'seller-a'}),
    async confirmUpload(input){calls.push(['confirmUpload',input]);return{id:`file-${rows.length+1}`,objectKey:input.objectKey,status:'confirmed',created:true}},
    async softDelete(input){calls.push(['softDelete',input]);return{id:input.fileId,objectKey:'owned'}},
    async replaceObject(input){calls.push(['replaceObject',input]);return{file:{id:input.newFileId,status:'active'},cleanupPending:false}},
  };
  const mediaStore={
    async transaction(work){calls.push(['transaction']);return work({
      async getProductForUpdate(input){calls.push(['getProductForUpdate',input]);return product},
      async listProductImagesForUpdate(input){calls.push(['listProductImagesForUpdate',input]);return rows.map(item=>({...item}))},
      async getProductImageByFileIdForUpdate(input){calls.push(['getProductImageByFileIdForUpdate',input]);return rows.find(item=>item.fileId===input.fileId)??null},
      async attachProductImage(input){calls.push(['attachProductImage',input]);const row={id:`image-${rows.length+1}`,...input};rows.push(row);return row},
      async replaceProductImage(input){calls.push(['replaceProductImage',input]);const index=rows.findIndex(row=>row.id===input.imageId);if(index<0)return null;const previous=rows[index];rows[index]={...previous,fileId:input.newFileId,altText:input.altText??previous.altText};return{image:rows[index],oldFileId:previous.fileId}},
      async setMainProductImage(input){calls.push(['setMainProductImage',input]);if(!rows.some(row=>row.id===input.imageId))return null;rows=rows.map(row=>({...row,isMain:row.id===input.imageId}));return rows.find(row=>row.id===input.imageId)},
      async reorderProductImages(input){calls.push(['reorderProductImages',input]);const positions=new Map(input.items.map(item=>[item.imageId,item.position]));rows=rows.map(row=>({...row,position:positions.get(row.id)}));return rows},
      async removeProductImage(input){calls.push(['removeProductImage',input]);const index=rows.findIndex(row=>row.id===input.imageId);if(index<0)return null;const [removed]=rows.splice(index,1);if(removed.isMain&&rows[0])rows[0]={...rows[0],isMain:true};return{removed,nextMain:rows.find(row=>row.isMain)??null}},
    })},
    async getProductImageByFileId(input){calls.push(['getProductImageByFileId',input]);return rows.find(item=>item.fileId===input.fileId)??null},
    async getProductWithImages(input){calls.push(['getProductWithImages',input]);return{...product,images:rows.map(item=>({...item})),mainImage:rows.find(row=>row.isMain)??null}},
  };
  return{service:createProductMediaService({projectId:'project-a',sellerId:'seller-a',catalogService,fileService,mediaStore,maxImages}),calls,getRows:()=>rows};
}

const upload={objectKey:'projects/project-a/sellers/seller-a/products/product-1/original/photo.webp',originalFilename:'photo.webp',altText:'Tea front'};

test('draft creation preserves the product and attaches first upload as main image',async()=>{
  const {service,calls}=fixture();
  const result=await service.createDraftWithImage({product:{name:'Tea',description:'Long',shortDescription:'Short',sortOrder:3},image:upload});
  assert.equal(result.mainImage.fileId,'file-1');
  assert.equal(result.images[0].position,1);
  assert.equal(result.images[0].isMain,true);
  assert.deepEqual(calls[0],['createProduct',{name:'Tea',description:'Long',shortDescription:'Short',sortOrder:3,status:'draft'}]);
});

test('subsequent upload is ordered, variant-aware, and never steals main status',async()=>{
  const {service}=fixture({images:[{id:'image-1',fileId:'old',position:1,isMain:true,altText:'front',variantId:null}]});
  const result=await service.attachUploadedImage({productId:'product-1',...upload,variantId:'sku-red'});
  assert.equal(result.images[1].position,2);
  assert.equal(result.images[1].isMain,false);
  assert.equal(result.images[1].variantId,'sku-red');
});

test('attach failure compensates the confirmed file and preserves retryable draft',async()=>{
  let compensated=null;
  const broken=createProductMediaService({
    projectId:'project-a',sellerId:'seller-a',
    catalogService:{async createProduct(){return{id:'product-1',status:'draft'}}},
    fileService:{scope:{projectId:'project-a',sellerId:'seller-a'},async confirmUpload(){return{id:'file-new',created:true}},async softDelete({fileId}){compensated=fileId}},
    mediaStore:{async transaction(){throw Object.assign(new Error('db down'),{code:'DB_DOWN'})},async getProductImageByFileId(){return null},async getProductWithImages(){return null}},
  });
  await assert.rejects(()=>broken.createDraftWithImage({product:{name:'Tea'},image:upload}),error=>error.code==='PRODUCT_MEDIA_ATTACH_FAILED'&&error.draftProductId==='product-1'&&error.retryable===true);
  assert.equal(compensated,'file-new');
});

test('draft without an image returns the same hydrated product shape',async()=>{
  const {service}=fixture();
  const result=await service.createDraft({name:'Tea'});
  assert.deepEqual(result.images,[]);
  assert.equal(result.mainImage,null);
});

test('replayed or concurrent upload reuses the existing relation and never deletes its file',async()=>{
  const calls=[];
  const existing={id:'image-1',productId:'product-1',fileId:'file-shared',position:1,isMain:true};
  const service=createProductMediaService({
    projectId:'project-a',sellerId:'seller-a',
    catalogService:{async createProduct(){return{id:'product-1'}}},
    fileService:{scope:{projectId:'project-a',sellerId:'seller-a'},async confirmUpload(){return{id:'file-shared',created:false}},async softDelete(input){calls.push(['softDelete',input])}},
    mediaStore:{
      async transaction(work){return work({async getProductForUpdate(){return{id:'product-1',name:'Tea'}},async getProductImageByFileIdForUpdate(){return existing},async listProductImagesForUpdate(){throw new Error('must not list')},async attachProductImage(){throw new Error('must not attach')}})},
      async getProductImageByFileId(){return existing},
      async getProductWithImages(){return{id:'product-1',images:[existing],mainImage:existing}},
    },
  });
  const result=await service.attachUploadedImage({productId:'product-1',...upload,requestKey:'upload-1'});
  assert.equal(result.mainImage.fileId,'file-shared');
  assert.equal(calls.length,0);
});

test('a relation won by another transaction is hydrated after unique conflict without compensation',async()=>{
  let linked=null,deleted=0;
  const relation={id:'image-1',productId:'product-1',fileId:'file-shared',position:1,isMain:true};
  const service=createProductMediaService({
    projectId:'project-a',sellerId:'seller-a',catalogService:{async createProduct(){return{id:'product-1'}}},
    fileService:{scope:{projectId:'project-a',sellerId:'seller-a'},async confirmUpload(){return{id:'file-shared',created:true}},async softDelete(){deleted+=1}},
    mediaStore:{
      async transaction(work){await work({async getProductForUpdate(){return{id:'product-1'}},async getProductImageByFileIdForUpdate(){return null},async listProductImagesForUpdate(){return[]},async attachProductImage(){linked=relation;throw Object.assign(new Error('unique'),{code:'UNIQUE_FILE_ID'})}})},
      async getProductImageByFileId(){return linked},
      async getProductWithImages(){return{id:'product-1',images:[relation],mainImage:relation}},
    },
  });
  const result=await service.attachUploadedImage({productId:'product-1',...upload});
  assert.equal(result.mainImage.fileId,'file-shared');assert.equal(deleted,0);
});

test('image limit is enforced atomically and confirmed overflow is soft-deleted',async()=>{
  const {service,calls}=fixture({maxImages:1,images:[{id:'image-1',fileId:'old',position:1,isMain:true}]});
  await assert.rejects(()=>service.attachUploadedImage({productId:'product-1',...upload}),error=>error.code==='PRODUCT_IMAGE_LIMIT_REACHED'&&error.maxImages===1);
  assert.ok(calls.some(call=>call[0]==='softDelete'));
});

test('main, reorder, replace, and remove are transactional product-image operations',async()=>{
  const initial=[{id:'image-1',fileId:'file-old',position:1,isMain:true,altText:'front'},{id:'image-2',fileId:'file-2',position:2,isMain:false,altText:'side'}];
  const {service,getRows}=fixture({images:initial});
  await service.setMainImage({productId:'product-1',imageId:'image-2'});
  assert.equal(getRows().find(row=>row.isMain).id,'image-2');
  await service.reorderImages({productId:'product-1',imageIds:['image-2','image-1']});
  assert.deepEqual([...getRows()].sort((a,b)=>a.position-b.position).map(row=>[row.id,row.position]),[['image-2',1],['image-1',2]]);
  const replaced=await service.replaceUploadedImage({productId:'product-1',imageId:'image-1',...upload});
  assert.equal(replaced.cleanupPending,false);
  await service.removeImage({productId:'product-1',imageId:'image-2'});
  assert.equal(getRows().length,1);
  assert.equal(getRows()[0].isMain,true);
});

test('reorder requires the exact current image set',async()=>{
  const {service}=fixture({images:[{id:'image-1',fileId:'f1',position:1,isMain:true},{id:'image-2',fileId:'f2',position:2,isMain:false}]});
  await assert.rejects(()=>service.reorderImages({productId:'product-1',imageIds:['image-1']}),error=>error.code==='PRODUCT_IMAGE_ORDER_SCOPE_MISMATCH');
  await assert.rejects(()=>service.reorderImages({productId:'product-1',imageIds:['image-1','image-1']}),error=>error.code==='PRODUCT_IMAGE_ID_DUPLICATE');
});
