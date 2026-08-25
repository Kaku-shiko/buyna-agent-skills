import test from 'node:test';
import assert from 'node:assert/strict';
import {createMerchantCatalogService} from '../src/catalog-core.mjs';
import {createMerchantDataCore} from '../../buyna-postgres-merchant-core/src/merchant-core.mjs';
import {createNodePostgresAdapter} from '../../buyna-postgres-merchant-core/adapters/node-postgres.mjs';

test('official postgres dataCore composes unlocked reads and draft creates with locked catalog mutations',async()=>{
  const calls=[];
  const product={id:'p1',project_id:'project-a',seller_id:'seller-a',name:'Tea',price:100,currency:'JPY',stock:1,status:'draft',featured:false,sort_order:1};
  function execute(text,values,source){
    calls.push({text,values,source});
    if(text.startsWith('SELECT')&&text.includes('COUNT(*) OVER()'))return{rows:[{...product,total_count:'1'}]};
    if(text.startsWith('SELECT')&&text.includes('FOR UPDATE'))return{rows:[{...product}]};
    if(text.startsWith('INSERT'))return{rows:[{id:'draft-created'}]};
    if(text.startsWith('UPDATE')){
      if(text.includes('"status" ='))product.status=values[0];
      if(text.includes('"featured" ='))product.featured=values[0];
      if(text.includes('"sort_order" ='))product.sort_order=values[0];
      return{rows:[{...product}]};
    }
    return{rows:[]};
  }
  const connection={async query(text,values){return execute(text,values,'connection')},release(){calls.push({text:'release',source:'connection'})}};
  const pool={async query(text,values){return execute(text,values,'pool')},async connect(){calls.push({text:'connect',source:'pool'});return connection}};
  const entities={products:{
    table:'products',
    filters:{search:'name',status:'status',category_id:'category_id',featured:'featured'},
    sort:{sort_order:'sort_order',updated_at:'updated_at',created_at:'created_at',name:'name',price:'price',stock:'stock'},
    write:{name:'name',description:'description',short_description:'short_description',price:'price',currency:'currency',stock:'stock',category_id:'category_id',main_image_id:'main_image_id',sort_order:'sort_order',featured:'featured',status:'status',deleted_at:'deleted_at',archived_at:'archived_at',restored_at:'restored_at'},
  },categories:{table:'categories',filters:{search:'name',status:'status'},sort:{sort_order:'sort_order',name:'name',updated_at:'updated_at',created_at:'created_at'},write:{name:'name',slug:'slug',description:'description',sort_order:'sort_order',status:'status',deleted_at:'deleted_at',archived_at:'archived_at',restored_at:'restored_at'}},product_variants:{table:'product_variants',filters:{product_id:'product_id',status:'status',sku_code:'sku_code'},sort:{sort_order:'sort_order',created_at:'created_at',sku_code:'sku_code',price:'price',stock_quantity:'stock_quantity'},write:{product_id:'product_id',sku_code:'sku_code',options:'options',price:'price',currency:'currency',stock_quantity:'stock_quantity',sort_order:'sort_order',status:'status',deleted_at:'deleted_at',archived_at:'archived_at',restored_at:'restored_at'}}};
  const adapter=createNodePostgresAdapter({pool,entities});
  const dataCore=createMerchantDataCore({adapter,projectId:'project-a',sellerId:'seller-a'});
  const catalog=createMerchantCatalogService({dataCore,featuredLimit:1});

  const listed=await catalog.listProducts({status:'draft'});
  const draft=await catalog.createProduct({name:'Coffee',price:200,currency:'JPY'});
  await catalog.transitionProduct({productId:'p1',toStatus:'active'});
  await catalog.setFeaturedProducts({productIds:['p1']});
  await catalog.reorderProducts({items:[{productId:'p1',sortOrder:1}]});

  assert.equal(listed.items[0].id,'p1');
  assert.equal(draft.id,'draft-created');
  assert.equal(product.status,'active');
  assert.equal(product.featured,true);
  assert.equal(calls.filter(call=>call.text==='BEGIN ISOLATION LEVEL SERIALIZABLE').length,3);
  assert.ok(calls.filter(call=>call.text.includes?.('FOR UPDATE')).every(call=>call.source==='connection'));
  assert.ok(calls.filter(call=>call.text.includes?.('FOR UPDATE')).every(call=>call.values.includes('project-a')&&call.values.includes('seller-a')));
  assert.equal(calls.filter(call=>call.text==='COMMIT').length,3);
  assert.equal(calls.filter(call=>call.text==='release').length,3);
});
