import test from 'node:test';
import assert from 'node:assert/strict';
import * as browser from '../src/browser.mjs';

function fixture({transferFails=false,attachFails=false}={}){
 const bytes=new Blob(['actual image bytes'],{type:'image/png'});
 const file=Object.assign(bytes,{name:'photo.png'});
 let object=null,images=[];const calls=[];
 const client=browser.createImageUploadClient({
  api:{
   async prepareUpload(input){calls.push(['prepare',input]);return{uploadId:'up-1',url:'https://storage.example/upload',headers:{'Content-Type':'image/png'}}},
   async attachImage(input){calls.push(['attach',input]);assert.equal(await object.text(),'actual image bytes');if(attachFails)throw Error('DB_UNAVAILABLE');images=[{id:'image-1',url:'https://storage.example/read'}];return{imageId:'image-1'}},
   async getEntity(input){calls.push(['read',input]);return{id:'product-1',images:structuredClone(images)}},
  },
  async fetchImpl(url,options){calls.push(['transfer',options]);assert.equal(options.body,file);object=options.body;return{ok:!transferFails,status:transferFails?403:200}},
 });
 return{client,file,calls,read:()=>({id:'product-1',images:structuredClone(images)})};
}
test('image save transfers original bytes, attaches, and reads persisted relation before success',async()=>{
 const f=fixture();const result=await f.client.saveImage({entityId:'product-1',file:f.file,requestKey:'upload-1'});
 assert.deepEqual(f.calls.map(([stage])=>stage),['prepare','transfer','attach','read']);
 assert.equal(result.imageId,'image-1');assert.deepEqual(result.entity,f.read());
 assert.equal(f.calls[2][1].uploadId,'up-1');
});
test('failed transfers and relation writes do not return saved or attempt later stages',async()=>{
 for(const mode of ['transferFails','attachFails']){
  const f=fixture({[mode]:true});
  await assert.rejects(()=>f.client.saveImage({entityId:'product-1',file:f.file,requestKey:'upload-1'}));
  assert.deepEqual(f.read().images,[]);
  assert.ok(!f.calls.some(([stage])=>stage==='read'));
  if(mode==='transferFails')assert.ok(!f.calls.some(([stage])=>stage==='attach'));
 }
});
test('metadata-only selection cannot masquerade as transferable bytes',async()=>{
 const f=fixture();
 await assert.rejects(()=>f.client.saveImage({entityId:'product-1',file:{name:'x.png',type:'image/png',size:10},requestKey:'upload-1'}),{code:'IMAGE_FILE_BYTES_REQUIRED'});
 assert.equal(f.calls.length,0);
});


test('a stale read or temporary preview URL never counts as saved',async()=>{
 for(const images of [[],[{id:'image-1',url:'blob:preview'}]]){
  const client=browser.createImageUploadClient({api:{
   async prepareUpload(){return{uploadId:'upload-1',url:'https://storage.example/upload'}},
   async attachImage(){return{imageId:'image-1'}},
   async getEntity(){return{id:'product-1',images}},
  },async fetchImpl(){return{ok:true}}});
  const file=Object.assign(new Blob(['bytes'],{type:'image/png'}),{name:'photo.png'});
  await assert.rejects(()=>client.saveImage({entityId:'product-1',file,requestKey:'same-upload'}),{code:'IMAGE_PERSISTENCE_NOT_CONFIRMED'});
 }
});
