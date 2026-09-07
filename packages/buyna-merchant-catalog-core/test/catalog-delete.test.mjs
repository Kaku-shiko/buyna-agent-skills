import test from 'node:test';
import assert from 'node:assert/strict';
import {createMerchantCatalogService} from '../src/catalog-core.mjs';
import {createMerchantDataCore} from '../../buyna-postgres-merchant-core/src/merchant-core.mjs';

function fixture({children=false,blocked=false}={}){
 let rows=[
  {entity:'products',id:'p1',project_id:'p',seller_id:'s',status:'active'},
  {entity:'products',id:'other',project_id:'p',seller_id:'other',status:'active'},
  {entity:'categories',id:'c1',project_id:'p',seller_id:'s',status:'draft'},
  ...(children?[{entity:'product_variants',id:'v1',product_id:'p1',project_id:'p',seller_id:'s',status:'draft'}]:[]),
 ];
 const matches=(row,input)=>row.entity===input.entity&&row.project_id===input.scope.projectId&&row.seller_id===input.scope.sellerId;
 const adapter={
  async lockingTransaction(work){const before=structuredClone(rows);try{return await work(adapter)}catch(error){rows=before;throw error}},
  async getByIdForUpdate(input){return rows.find(row=>matches(row,input)&&row.id===input.id)??null},
  async listAllForUpdate(input){return{rows:rows.filter(row=>matches(row,input)&&Object.entries(input.filters).every(([k,v])=>row[k]===v))}},
  async deleteById(input){if(blocked)throw Object.assign(new Error('referenced'),{code:'RECORD_DELETE_REFERENCED'});const index=rows.findIndex(row=>matches(row,input)&&row.id===input.id);if(index<0)return null;return rows.splice(index,1)[0]},
 };
 const dataCore=createMerchantDataCore({adapter,projectId:'p',sellerId:'s'});
 return{catalog:createMerchantCatalogService({dataCore}),dataCore,rows:()=>rows};
}
test('delete removes product and category rather than writing archive status',async()=>{
 const f=fixture();
 assert.deepEqual(await f.catalog.deleteProduct({productId:'p1'}),{deleted:true,id:'p1'});
 assert.deepEqual(await f.catalog.deleteCategory({categoryId:'c1'}),{deleted:true,id:'c1'});
 assert.deepEqual(f.rows().map(row=>row.id),['other']);
});
test('delete rejects other merchants and preserves a referenced record',async()=>{
 const f=fixture({blocked:true});
 await assert.rejects(()=>f.catalog.deleteProduct({productId:'other'}),{code:'CATALOG_PRODUCT_NOT_FOUND'});
 await assert.rejects(()=>f.catalog.deleteProduct({productId:'p1'}),{code:'RECORD_DELETE_REFERENCED'});
 assert.equal(f.rows().find(row=>row.id==='p1').status,'active');
});
test('product deletion checks all variants, including drafts, without silently archiving',async()=>{
 const f=fixture({children:true});
 await assert.rejects(()=>f.catalog.deleteProduct({productId:'p1'}),{code:'CATALOG_PRODUCT_HAS_VARIANTS'});
 await f.catalog.deleteVariant({variantId:'v1'});
 await f.catalog.deleteProduct({productId:'p1'});
 assert.ok(!f.rows().some(row=>row.id==='p1'||row.id==='v1'));
});
test('generic repositories cannot delete without explicit policy and a transaction',async()=>{
 const {dataCore}=fixture();
 assert.equal(dataCore.repository({entity:'products'}).deleteById,undefined);
 await dataCore.lockingTransaction(async core=>{
  await assert.rejects(()=>core.lockingRepository({entity:'products'}).deleteById('p1'),{code:'DELETE_NOT_ALLOWED'});
 });
});
