import test from 'node:test';
import assert from 'node:assert/strict';
import {createMerchantCatalogService} from '../src/catalog-core.mjs';

function fakeCore(){
  const calls=[];
  const repositories=new Map();
  const core={
    repository(policy){
      calls.push(['repository',policy]);
      if(!repositories.has(policy.entity))repositories.set(policy.entity,{
        async list(input){calls.push(['list',policy.entity,input]);return{items:[],total:0}},
        async create(data){calls.push(['create',policy.entity,data]);return{id:'new',...data}},
        async updateById(id,data){calls.push(['update',policy.entity,id,data]);return{id,...data}},
      });
      return repositories.get(policy.entity);
    },
    async transaction(work){calls.push(['transaction']);return work(core)},
  };
  return{core,calls};
}

test('product listing uses only the fixed filters and sort contract',async()=>{
  const {core,calls}=fakeCore();
  const service=createMerchantCatalogService({dataCore:core});
  await service.listProducts({search:'tea',status:'active',categoryId:'c1',page:2,pageSize:10,sort:{field:'sort_order',direction:'asc'}});
  const policy=calls.find(call=>call[0]==='repository'&&call[1].entity==='products')[1];
  assert.deepEqual(policy.allowedFilters,['search','status','category_id']);
  assert.deepEqual(policy.allowedSort,['sort_order','updated_at','created_at','name','price','stock']);
  assert.deepEqual(calls.at(-1),['list','products',{page:2,pageSize:10,filters:{search:'tea',status:'active',category_id:'c1'},sort:{field:'sort_order',direction:'asc'}}]);
});

test('product writes normalize money, stock, visibility, and soft deletion',async()=>{
  const {core,calls}=fakeCore();
  const service=createMerchantCatalogService({dataCore:core,clock:()=>new Date('2026-08-10T02:00:00.000Z')});
  await service.createProduct({name:' Tea ',price:1200,stock:3,currency:'jpy'});
  await service.setProductStock({productId:'p1',stock:0});
  await service.setProductVisibility({productId:'p1',visible:false});
  await service.archiveProduct({productId:'p1'});
  assert.deepEqual(calls.filter(call=>call[0]==='create'||call[0]==='update'),[
    ['create','products',{name:'Tea',price:1200,stock:3,currency:'JPY',status:'draft'}],
    ['update','products','p1',{stock:0}],
    ['update','products','p1',{status:'draft'}],
    ['update','products','p1',{status:'archived',deleted_at:'2026-08-10T02:00:00.000Z'}],
  ]);
});

test('reordering is atomic and rejects duplicate product ids',async()=>{
  const {core,calls}=fakeCore();
  const service=createMerchantCatalogService({dataCore:core});
  await service.reorderProducts({items:[{productId:'p2',sortOrder:1},{productId:'p1',sortOrder:2}]});
  assert.equal(calls.filter(call=>call[0]==='transaction').length,1);
  assert.deepEqual(calls.filter(call=>call[0]==='update'),[
    ['update','products','p2',{sort_order:1}],
    ['update','products','p1',{sort_order:2}],
  ]);
  await assert.rejects(()=>service.reorderProducts({items:[{productId:'p1',sortOrder:1},{productId:'p1',sortOrder:2}]}),/DUPLICATE_PRODUCT_ID/);
});

test('category management shares fixed list, visibility, and archive behavior',async()=>{
  const {core,calls}=fakeCore();
  const service=createMerchantCatalogService({dataCore:core,clock:()=>new Date('2026-08-10T03:00:00.000Z')});
  await service.listCategories({search:'care',status:'active'});
  await service.createCategory({name:' Care ',slug:'care'});
  await service.setCategoryVisibility({categoryId:'c1',visible:true});
  await service.archiveCategory({categoryId:'c1'});
  assert.deepEqual(calls.filter(call=>['list','create','update'].includes(call[0])),[
    ['list','categories',{page:undefined,pageSize:undefined,filters:{search:'care',status:'active'},sort:undefined}],
    ['create','categories',{name:'Care',slug:'care',status:'draft'}],
    ['update','categories','c1',{status:'active'}],
    ['update','categories','c1',{status:'archived',deleted_at:'2026-08-10T03:00:00.000Z'}],
  ]);
});

test('SKU writes use the fixed variant policy and reject negative price or stock',async()=>{
  const {core,calls}=fakeCore();
  const service=createMerchantCatalogService({dataCore:core});
  await service.createVariant({productId:'p1',skuCode:'SKU-1',options:{size:'M'},price:1500,stock:4,currency:'jpy'});
  await service.updateVariant({variantId:'v1',price:1600,stock:2});
  assert.deepEqual(calls.filter(call=>call[0]==='create'||call[0]==='update').slice(-2),[
    ['create','product_variants',{product_id:'p1',sku_code:'SKU-1',options:{size:'M'},price:1500,stock_quantity:4,currency:'JPY',status:'active'}],
    ['update','product_variants','v1',{price:1600,stock_quantity:2}],
  ]);
  await assert.rejects(()=>service.createVariant({productId:'p1',skuCode:'bad',price:-1,stock:1}),/INVALID_VARIANT_PRICE/);
});

test('product and category edits map only approved normalized fields',async()=>{
  const {core,calls}=fakeCore();
  const service=createMerchantCatalogService({dataCore:core});
  await service.updateProduct({productId:'p1',name:' New ',price:2000,stock:8,currency:'jpy',featured:true});
  await service.updateCategory({categoryId:'c1',name:' Care ',slug:'care'});
  assert.deepEqual(calls.filter(call=>call[0]==='update').slice(-2),[
    ['update','products','p1',{name:'New',price:2000,stock:8,currency:'JPY',featured:true}],
    ['update','categories','c1',{name:'Care',slug:'care'}],
  ]);
});
