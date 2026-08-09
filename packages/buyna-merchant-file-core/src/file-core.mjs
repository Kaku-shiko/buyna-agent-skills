import fs from 'node:fs';
import path from 'node:path';

function fail(code){const error=new Error(code);error.code=code;throw error}
function segment(value,code){const text=String(value??'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(text))fail(code);return text}
function method(owner,name){if(typeof owner?.[name]!=='function')fail(`MISSING_ADAPTER_${name.toUpperCase()}`)}

export function buildMerchantObjectKey(input={}){
  const projectId=segment(input.projectId,'INVALID_PROJECT_ID');
  const sellerId=segment(input.sellerId,'INVALID_SELLER_ID');
  const entityType=segment(input.entityType,'INVALID_ENTITY_TYPE');
  const entityId=segment(input.entityId,'INVALID_ENTITY_ID');
  const variant=segment(input.variant??'original','INVALID_VARIANT');
  const objectId=segment(input.objectId,'INVALID_OBJECT_ID');
  const extension=String(input.extension??'').trim().toLowerCase().replace(/^\./,'');
  if(!/^[a-z0-9]{1,10}$/.test(extension))fail('INVALID_EXTENSION');
  return`projects/${projectId}/sellers/${sellerId}/${entityType}/${entityId}/${variant}/${objectId}.${extension}`;
}

export function scaffoldMerchantProject({root,projectId,sellerId,merchantType}={}){
  const safeProject=segment(projectId,'INVALID_PROJECT_ID'),safeSeller=segment(sellerId,'INVALID_SELLER_ID');
  if(!['product','service','mixed'].includes(merchantType))fail('INVALID_MERCHANT_TYPE');
  const rootPath=path.resolve(String(root??''));
  if(!root||rootPath===path.parse(rootPath).root)fail('INVALID_PROJECT_ROOT');
  const projectPath=path.resolve(rootPath,'projects',safeProject);
  if(!projectPath.startsWith(`${rootPath}${path.sep}`))fail('PROJECT_PATH_OUTSIDE_ROOT');
  if(fs.existsSync(projectPath))fail('PROJECT_ALREADY_EXISTS');
  for(const directory of ['frontend','backend/adapters','backend/routes','backend/services','backend/repositories','backend/migrations','tests','deployment'])fs.mkdirSync(path.join(projectPath,directory),{recursive:true});
  fs.writeFileSync(path.join(projectPath,'merchant.config.json'),`${JSON.stringify({projectId:safeProject,sellerId:safeSeller,merchantType},null,2)}\n`,'utf8');
  fs.writeFileSync(path.join(projectPath,'resources.yaml'),`project: {id: ${safeProject}, seller_id: ${safeSeller}}\ndatabase:\n  mode: existing\n  engine: postgresql\n  connection_source: DATABASE_URL\n  name: ""\n  schema: ""\n  allow_create_database: false\nstorage:\n  mode: existing\n  bucket_source: AWS_STORAGE_BUCKET_NAME\n  region: ""\n  prefix: projects/${safeProject}/\n  allow_create_bucket: false\ndeployment:\n  instance_ip: 35.73.127.215\n  allow_create_instance: false\n`,'utf8');
  return{created:true,projectPath};
}

export function createMerchantFileService({storage,metadata,projectId,sellerId,policy={},clock=()=>new Date()}={}){
  const scope={projectId:segment(projectId,'INVALID_PROJECT_ID'),sellerId:segment(sellerId,'INVALID_SELLER_ID')};
  const prefix=`projects/${scope.projectId}/sellers/${scope.sellerId}/`;
  const allowedMimeTypes=policy.allowedMimeTypes??['image/jpeg','image/png','image/webp'];
  const maxBytes=Number(policy.maxBytes??5*1024*1024);
  function ownedKey(key){const value=String(key??'');if(!value.startsWith(prefix)||value.includes('..'))fail('OBJECT_KEY_OUTSIDE_MERCHANT_SCOPE');return value}
  return{
    scope:Object.freeze({...scope}),
    async confirmUpload(input={}){
      method(storage,'headObject');method(metadata,'confirmUpload');
      const objectKey=ownedKey(input.objectKey);
      const object=await storage.headObject({key:objectKey});
      if(!object)fail('UPLOADED_OBJECT_NOT_FOUND');
      if(!allowedMimeTypes.includes(object.contentType))fail('FILE_TYPE_NOT_ALLOWED');
      if(!Number.isFinite(object.size)||object.size<=0||object.size>maxBytes)fail('FILE_SIZE_NOT_ALLOWED');
      return metadata.confirmUpload({scope:{...scope},objectKey,entityType:segment(input.entityType,'INVALID_ENTITY_TYPE'),entityId:segment(input.entityId,'INVALID_ENTITY_ID'),variant:segment(input.variant??'original','INVALID_VARIANT'),originalFilename:String(input.originalFilename??''),contentType:object.contentType,size:object.size,etag:object.etag??null,status:'confirmed'});
    },
    async replaceObject(input={}){
      method(metadata,'transaction');method(storage,'deleteObject');method(metadata,'markObjectDeleted');method(metadata,'markDeletionFailed');
      const replacement=await metadata.transaction(async tx=>{
        method(tx,'getFileById');method(tx,'replaceFile');
        const oldFile=await tx.getFileById({scope:{...scope},fileId:segment(input.oldFileId,'INVALID_OLD_FILE_ID')});
        const newFile=await tx.getFileById({scope:{...scope},fileId:segment(input.newFileId,'INVALID_NEW_FILE_ID')});
        if(!oldFile||!newFile)fail('FILE_NOT_FOUND');
        ownedKey(oldFile.objectKey);ownedKey(newFile.objectKey);
        if(newFile.status!=='confirmed')fail('NEW_FILE_NOT_CONFIRMED');
        return tx.replaceFile({scope:{...scope},oldFileId:oldFile.id,newFileId:newFile.id});
      });
      try{
        await storage.deleteObject({key:ownedKey(replacement.oldFile.objectKey)});
        await metadata.markObjectDeleted({scope:{...scope},fileId:replacement.oldFile.id});
        return{file:replacement.newFile,cleanupPending:false};
      }catch(error){
        await metadata.markDeletionFailed({scope:{...scope},fileId:replacement.oldFile.id,code:error.code||'OBJECT_DELETE_FAILED'});
        return{file:replacement.newFile,cleanupPending:true};
      }
    },
    async softDelete(input={}){
      method(metadata,'softDelete');
      const file=await metadata.softDelete({scope:{...scope},fileId:segment(input.fileId,'INVALID_FILE_ID')});
      if(!file)fail('FILE_NOT_FOUND');
      ownedKey(file.objectKey);
      return file;
    },
    async cleanupOrphans(input={}){
      method(metadata,'listCleanupCandidates');method(metadata,'isReferenced');method(metadata,'markObjectDeleted');method(metadata,'markCleanupFailed');method(storage,'deleteObject');
      const limit=Math.min(Math.max(Number(input.limit)||50,1),100);
      const minAgeMs=Math.max(Number(policy.minCleanupAgeMs)||72*60*60*1000,24*60*60*1000);
      const cutoff=new Date(clock().getTime()-minAgeMs);
      const candidates=await metadata.listCleanupCandidates({scope:{...scope},olderThan:cutoff.toISOString(),limit});
      const summary={checked:candidates.length,deleted:0,skipped:0,failed:0};
      for(const file of candidates){
        try{
          const createdAt=new Date(file.createdAt);
          if(!Number.isFinite(createdAt.getTime())||createdAt>cutoff){summary.skipped+=1;continue}
          const objectKey=ownedKey(file.objectKey);
          if(await metadata.isReferenced({scope:{...scope},fileId:file.id,objectKey})){summary.skipped+=1;continue}
          await storage.deleteObject({key:objectKey});
          await metadata.markObjectDeleted({scope:{...scope},fileId:file.id});
          summary.deleted+=1;
        }catch(error){
          summary.failed+=1;
          await metadata.markCleanupFailed({scope:{...scope},fileId:file.id,code:error.code||'ORPHAN_CLEANUP_FAILED'});
        }
      }
      return summary;
    },
  };
}
