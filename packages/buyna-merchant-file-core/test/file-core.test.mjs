import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildMerchantObjectKey,createMerchantFileService,scaffoldMerchantProject} from '../src/file-core.mjs';
import {parseSimpleYaml,validateResourceRecord} from '../../../skills/buyna-aws-data-layer/scripts/inspect-existing-resources.mjs';

test('object keys are generated only inside the server-owned project and seller prefix',()=>{
  const key=buildMerchantObjectKey({projectId:'shop-a',sellerId:'seller-a',entityType:'products',entityId:'product-1',variant:'original',objectId:'file-1',extension:'webp'});
  assert.equal(key,'projects/shop-a/sellers/seller-a/products/product-1/original/file-1.webp');
  assert.throws(()=>buildMerchantObjectKey({projectId:'../other',sellerId:'seller-a',entityType:'products',entityId:'p1',objectId:'f1',extension:'webp'}),/INVALID_PROJECT_ID/);
});

test('project scaffolder creates the fixed merchant layers without secrets or overwrites',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'buyna-files-'));
  const result=scaffoldMerchantProject({root,projectId:'shop-a',sellerId:'seller-a',merchantType:'product'});
  assert.equal(result.created,true);
  for(const relative of ['resources.yaml','merchant.config.json','frontend','backend/adapters','backend/routes','backend/services','backend/repositories','backend/migrations','tests','deployment'])assert.equal(fs.existsSync(path.join(result.projectPath,relative)),true,relative);
  const resource=parseSimpleYaml(fs.readFileSync(path.join(result.projectPath,'resources.yaml'),'utf8'));
  assert.equal(validateResourceRecord(resource).status,'blocked');
  assert.throws(()=>scaffoldMerchantProject({root,projectId:'shop-a',sellerId:'seller-a',merchantType:'product'}),/PROJECT_ALREADY_EXISTS/);
  fs.rmSync(root,{recursive:true,force:true});
});

test('upload confirmation verifies the owned S3 object before saving metadata',async()=>{
  const calls=[];
  const storage={async headObject({key}){calls.push(['head',key]);return{size:1200,contentType:'image/webp',etag:'etag-1'}}};
  const metadata={async confirmUpload(input){calls.push(['metadata',input.scope]);return{id:'file-1',...input}}};
  const service=createMerchantFileService({storage,metadata,projectId:'shop-a',sellerId:'seller-a',policy:{allowedMimeTypes:['image/webp'],maxBytes:5000}});
  const objectKey='projects/shop-a/sellers/seller-a/products/product-1/original/file-1.webp';

  const file=await service.confirmUpload({objectKey,entityType:'products',entityId:'product-1',variant:'original',originalFilename:'photo.webp'});

  assert.deepEqual(calls,[['head',objectKey],['metadata',{projectId:'shop-a',sellerId:'seller-a'}]]);
  assert.equal(file.size,1200);
  await assert.rejects(()=>service.confirmUpload({...file,objectKey:'projects/shop-a/sellers/seller-b/products/product-1/original/file-2.webp'}),/OBJECT_KEY_OUTSIDE_MERCHANT_SCOPE/);
});

test('replacement activates the confirmed new file before deleting the old object',async()=>{
  const calls=[];
  const oldFile={id:'old',objectKey:'projects/shop-a/sellers/seller-a/products/p1/original/old.webp',status:'active'};
  const newFile={id:'new',objectKey:'projects/shop-a/sellers/seller-a/products/p1/original/new.webp',status:'confirmed'};
  const metadata={
    async transaction(work){calls.push('transaction');return work({async getFileById({fileId}){return fileId==='old'?oldFile:newFile},async replaceFile(){calls.push('replace');return{oldFile,newFile:{...newFile,status:'active'}}}})},
    async markObjectDeleted(){calls.push('marked-deleted')},
    async markDeletionFailed(){calls.push('deletion-failed')},
  };
  const storage={async deleteObject({key}){calls.push(['delete',key])}};
  const service=createMerchantFileService({storage,metadata,projectId:'shop-a',sellerId:'seller-a'});

  const result=await service.replaceObject({oldFileId:'old',newFileId:'new'});

  assert.deepEqual(calls,['transaction','replace',['delete',oldFile.objectKey],'marked-deleted']);
  assert.equal(result.cleanupPending,false);
  assert.equal(result.file.status,'active');
});

test('soft deletion changes metadata without deleting the S3 object immediately',async()=>{
  let storageDeletes=0;
  const storage={async deleteObject(){storageDeletes+=1}};
  const metadata={async softDelete(input){return{id:input.fileId,status:'deleted',objectKey:'projects/shop-a/sellers/seller-a/products/p1/original/file.webp'}}};
  const service=createMerchantFileService({storage,metadata,projectId:'shop-a',sellerId:'seller-a'});

  const file=await service.softDelete({fileId:'file-1'});

  assert.equal(file.status,'deleted');
  assert.equal(storageDeletes,0);
});

test('orphan cleanup deletes only old unreferenced objects inside the merchant prefix',async()=>{
  const deleted=[];
  const old='2026-01-01T00:00:00.000Z';
  const candidates=[
    {id:'orphan',objectKey:'projects/shop-a/sellers/seller-a/products/p1/original/orphan.webp',createdAt:old},
    {id:'used',objectKey:'projects/shop-a/sellers/seller-a/products/p1/original/used.webp',createdAt:old},
    {id:'outside',objectKey:'projects/shop-a/sellers/seller-b/products/p1/original/outside.webp',createdAt:old},
  ];
  const metadata={
    async listCleanupCandidates(){return candidates},
    async isReferenced({fileId}){return fileId==='used'},
    async markObjectDeleted(){},
    async markCleanupFailed(){},
  };
  const storage={async deleteObject({key}){deleted.push(key)}};
  const service=createMerchantFileService({storage,metadata,projectId:'shop-a',sellerId:'seller-a',clock:()=>new Date('2026-08-10T00:00:00.000Z')});

  const result=await service.cleanupOrphans();

  assert.deepEqual(deleted,[candidates[0].objectKey]);
  assert.deepEqual(result,{checked:3,deleted:1,skipped:1,failed:1});
});
