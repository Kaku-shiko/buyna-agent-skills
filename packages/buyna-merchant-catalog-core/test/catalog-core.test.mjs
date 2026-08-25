import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_STATES,
  CATALOG_TRANSITIONS,
  createMerchantCatalogService,
} from '../src/catalog-core.mjs';

function fakeCore(seed={}){
  const calls=[];
  const repositories=new Map();
  const records=new Map(Object.entries(seed).map(([entity,items])=>[
    entity,
    new Map(items.map(item=>[item.id,{...item}])),
  ]));
  let generatedId=0;
  let lockTail=Promise.resolve();
  async function atomic(work){
    const snapshot=new Map([...records].map(([entity,items])=>[
      entity,
      new Map([...items].map(([id,item])=>[id,{...item}])),
    ]));
    try{return await work()}catch(error){
      records.clear();
      for(const [entity,items] of snapshot)records.set(entity,items);
      throw error;
    }
  }
  const core={
    repository(policy){
      calls.push(['repository',policy]);
      if(!repositories.has(policy.entity))repositories.set(policy.entity,{
        async list(input){
          calls.push(['list',policy.entity,input]);
          const items=[...(records.get(policy.entity)?.values()??[])].filter(item=>Object.entries(input?.filters??{}).every(([key,value])=>item[key]===value));
          const page=input?.page??1;
          const pageSize=input?.pageSize??Math.max(items.length,1);
          return{items:items.slice((page-1)*pageSize,page*pageSize),page,pageSize,total:items.length,totalPages:Math.ceil(items.length/pageSize)};
        },
        async create(data){
          calls.push(['create',policy.entity,data]);
          const id=generatedId++===0?'new':`new-${generatedId}`;
          if(!records.has(policy.entity))records.set(policy.entity,new Map());
          records.get(policy.entity).set(id,{id,...data});
          return{id,...data};
        },
        async getById(id){calls.push(['get',policy.entity,id]);return records.get(policy.entity)?.get(id)??null},
        async updateById(id,data){
          calls.push(['update',policy.entity,id,data]);
          const current=records.get(policy.entity)?.get(id);
          if(current)Object.assign(current,data);
          return{id,...current,...data};
        },
      });
      return repositories.get(policy.entity);
    },
    async transaction(work){
      calls.push(['transaction']);
      return atomic(()=>work(core));
    },
    async lockingTransaction(work){
      calls.push(['lockingTransaction','serializable']);
      const run=()=>atomic(()=>work({
        lockingRepository(policy){
          calls.push(['lockingRepository',policy]);
          const repository=core.repository(policy);
          return{
            ...repository,
            async getByIdForUpdate(id){calls.push(['getForUpdate',policy.entity,id]);return records.get(policy.entity)?.get(id)??null},
            async listAllForUpdate(input={}){
              calls.push(['listAllForUpdate',policy.entity,input]);
              return[...(records.get(policy.entity)?.values()??[])].filter(item=>Object.entries(input.filters??{}).every(([key,value])=>item[key]===value));
            },
          };
        },
      }));
      const result=lockTail.then(run,run);
      lockTail=result.catch(()=>{});
      return result;
    },
  };
  return{core,calls,records};
}

test('product listing uses only the fixed filters and sort contract',async()=>{
  const {core,calls}=fakeCore();
  const service=createMerchantCatalogService({dataCore:core});
  await service.listProducts({search:'tea',status:'active',categoryId:'c1',page:2,pageSize:10,sort:{field:'sort_order',direction:'asc'}});
  const policy=calls.find(call=>call[0]==='repository'&&call[1].entity==='products')[1];
  assert.deepEqual(policy.allowedFilters,['search','status','category_id','featured']);
  assert.deepEqual(policy.allowedSort,['sort_order','updated_at','created_at','name','price','stock']);
  assert.deepEqual(calls.at(-1),['list','products',{page:2,pageSize:10,filters:{search:'tea',status:'active',category_id:'c1'},sort:{field:'sort_order',direction:'asc'}}]);
});

test('product writes normalize money, stock, visibility, and soft deletion',async()=>{
  const {core,calls}=fakeCore({products:[{id:'p1',status:'active',price:1200,currency:'JPY'}]});
  const service=createMerchantCatalogService({dataCore:core,clock:()=>new Date('2026-08-10T02:00:00.000Z')});
  await service.createProduct({name:' Tea ',price:1200,stock:3,currency:'jpy'});
  await service.setProductStock({productId:'p1',stock:0});
  await service.setProductVisibility({productId:'p1',visible:false});
  await service.archiveProduct({productId:'p1'});
  assert.deepEqual(calls.filter(call=>call[0]==='create'||call[0]==='update'),[
    ['create','products',{name:'Tea',price:1200,stock:3,currency:'JPY',status:'draft'}],
    ['update','products','p1',{stock:0}],
    ['update','products','p1',{status:'draft'}],
    ['update','products','p1',{status:'archived',deleted_at:'2026-08-10T02:00:00.000Z',archived_at:'2026-08-10T02:00:00.000Z'}],
  ]);
});

test('reordering is atomic and rejects duplicate product ids',async()=>{
  const {core,calls}=fakeCore({products:[{id:'p1'},{id:'p2'}]});
  const service=createMerchantCatalogService({dataCore:core});
  await service.reorderProducts({items:[{productId:'p2',sortOrder:1},{productId:'p1',sortOrder:2}]});
  assert.equal(calls.filter(call=>call[0]==='lockingTransaction').length,1);
  assert.deepEqual(calls.filter(call=>call[0]==='update'),[
    ['update','products','p2',{sort_order:1}],
    ['update','products','p1',{sort_order:2}],
  ]);
  await assert.rejects(()=>service.reorderProducts({items:[{productId:'p1',sortOrder:1},{productId:'p1',sortOrder:2}]}),/DUPLICATE_PRODUCT_ID/);
});

test('category management shares fixed list, visibility, and archive behavior',async()=>{
  const {core,calls}=fakeCore({categories:[{id:'c1',status:'draft',name:'Care',slug:'care'}]});
  const service=createMerchantCatalogService({dataCore:core,clock:()=>new Date('2026-08-10T03:00:00.000Z')});
  await service.listCategories({search:'care',status:'active'});
  await service.createCategory({name:' Care ',slug:'care'});
  await service.setCategoryVisibility({categoryId:'c1',visible:true});
  await service.archiveCategory({categoryId:'c1'});
  assert.deepEqual(calls.filter(call=>['list','create','update'].includes(call[0])),[
    ['list','categories',{page:undefined,pageSize:undefined,filters:{search:'care',status:'active'},sort:undefined}],
    ['create','categories',{name:'Care',slug:'care',status:'draft'}],
    ['update','categories','c1',{status:'active'}],
    ['update','categories','c1',{status:'archived',deleted_at:'2026-08-10T03:00:00.000Z',archived_at:'2026-08-10T03:00:00.000Z'}],
  ]);
});

test('SKU writes use the fixed variant policy and reject negative price or stock',async()=>{
  const {core,calls}=fakeCore({
    products:[{id:'p1',status:'active'}],
    product_variants:[{id:'v1',status:'active',product_id:'p1',sku_code:'SKU-OLD',price:100,currency:'JPY'}],
  });
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
  const {core,calls}=fakeCore({products:[{id:'p1',status:'draft',price:100,currency:'JPY'}]});
  const service=createMerchantCatalogService({dataCore:core});
  await service.updateProduct({productId:'p1',name:' New ',price:2000,stock:8,currency:'jpy'});
  await service.updateCategory({categoryId:'c1',name:' Care ',slug:'care'});
  assert.deepEqual(calls.filter(call=>call[0]==='update').slice(-2),[
    ['update','products','p1',{name:'New',price:2000,stock:8,currency:'JPY'}],
    ['update','categories','c1',{name:'Care',slug:'care'}],
  ]);
});

test('catalog states and transitions are immutable lifecycle contracts',()=>{
  assert.deepEqual(CATALOG_STATES,{DRAFT:'draft',ACTIVE:'active',ARCHIVED:'archived'});
  assert.deepEqual(CATALOG_TRANSITIONS,{
    draft:['active','archived'],
    active:['draft','archived'],
    archived:[],
  });
  assert.throws(()=>{CATALOG_STATES.ACTIVE='changed'},TypeError);
  assert.throws(()=>{CATALOG_TRANSITIONS.draft.push('changed')},TypeError);
});

test('product lifecycle is guarded, validates sellable data, and restores with timestamps',async()=>{
  const now='2026-08-11T01:02:03.000Z';
  const {core,calls}=fakeCore({
    products:[
      {id:'p1',status:'draft',price:1200,currency:'JPY',category_id:'c1'},
      {id:'p2',status:'draft',price:12.5,currency:'JPY'},
    ],
    categories:[{id:'c1',status:'active'}],
  });
  const service=createMerchantCatalogService({dataCore:core,clock:()=>new Date(now)});

  await service.transitionProduct({productId:'p1',toStatus:'active'});
  await service.transitionProduct({productId:'p1',toStatus:'archived'});
  await service.restoreProduct({productId:'p1'});

  assert.deepEqual(calls.filter(call=>call[0]==='update'&&call[1]==='products'),[
    ['update','products','p1',{status:'active'}],
    ['update','products','p1',{status:'archived',deleted_at:now,archived_at:now}],
    ['update','products','p1',{status:'draft',deleted_at:null,archived_at:null,restored_at:now}],
  ]);
  await assert.rejects(
    ()=>service.transitionProduct({productId:'p1',toStatus:'draft'}),
    error=>error.code==='CATALOG_INVALID_TRANSITION',
  );
  await assert.rejects(
    ()=>service.transitionProduct({productId:'p2',toStatus:'active'}),
    error=>error.code==='CATALOG_PRODUCT_NOT_SELLABLE',
  );
});

test('active products require an active scoped category and active variants require an active product and SKU',async()=>{
  const {core}=fakeCore({
    products:[
      {id:'p1',status:'draft',price:100,currency:'JPY',category_id:'missing'},
      {id:'p2',status:'draft',price:100,currency:'JPY',category_id:'c2'},
      {id:'p3',status:'draft',price:100,currency:'JPY'},
    ],
    categories:[{id:'c2',status:'archived'}],
    product_variants:[
      {id:'v1',status:'draft',product_id:'p3',sku_code:'SKU-1',price:100,currency:'JPY'},
      {id:'v2',status:'draft',product_id:'p3',sku_code:'',price:100,currency:'JPY'},
      {id:'v3',status:'draft',product_id:'p3',sku_code:'DUPLICATE',price:100,currency:'JPY'},
      {id:'v4',status:'archived',product_id:'p3',sku_code:'DUPLICATE',price:100,currency:'JPY'},
    ],
  });
  const service=createMerchantCatalogService({dataCore:core});

  await assert.rejects(()=>service.transitionProduct({productId:'p1',toStatus:'active'}),error=>error.code==='CATALOG_CATEGORY_NOT_FOUND');
  await assert.rejects(()=>service.transitionProduct({productId:'p2',toStatus:'active'}),error=>error.code==='CATALOG_CATEGORY_NOT_ACTIVE');
  await assert.rejects(()=>service.transitionVariant({variantId:'v1',toStatus:'active'}),error=>error.code==='CATALOG_PRODUCT_NOT_ACTIVE');
  await service.transitionProduct({productId:'p3',toStatus:'active'});
  await assert.rejects(()=>service.transitionVariant({variantId:'v2',toStatus:'active'}),error=>error.code==='CATALOG_SKU_REQUIRED');
  await assert.rejects(()=>service.transitionVariant({variantId:'v3',toStatus:'active'}),error=>error.code==='CATALOG_SKU_DUPLICATE');
  await service.transitionVariant({variantId:'v1',toStatus:'active'});
});

test('category and variant lifecycle reject illegal transitions and support restoration',async()=>{
  const now='2026-08-11T04:00:00.000Z';
  const {core,calls}=fakeCore({
    categories:[{id:'c1',status:'draft'}],
    products:[{id:'p1',status:'active',price:100,currency:'JPY'}],
    product_variants:[{id:'v1',status:'active',product_id:'p1',sku_code:'SKU-1',price:100,currency:'JPY'}],
  });
  const service=createMerchantCatalogService({dataCore:core,clock:()=>new Date(now)});

  await service.transitionCategory({categoryId:'c1',toStatus:'active'});
  await service.transitionCategory({categoryId:'c1',toStatus:'archived'});
  await service.restoreCategory({categoryId:'c1'});
  await service.transitionVariant({variantId:'v1',toStatus:'archived'});
  await service.transitionVariant({variantId:'v1',toStatus:'draft'});

  assert.deepEqual(calls.filter(call=>call[0]==='update').slice(-5),[
    ['update','categories','c1',{status:'active'}],
    ['update','categories','c1',{status:'archived',deleted_at:now,archived_at:now}],
    ['update','categories','c1',{status:'draft',deleted_at:null,archived_at:null,restored_at:now}],
    ['update','product_variants','v1',{status:'archived',deleted_at:now,archived_at:now}],
    ['update','product_variants','v1',{status:'draft',deleted_at:null,archived_at:null,restored_at:now}],
  ]);
  await assert.rejects(()=>service.restoreCategory({categoryId:'c1'}),error=>error.code==='CATALOG_INVALID_TRANSITION');
});

test('direct status and deletion timestamp writes are rejected instead of silently accepted',async()=>{
  const {core}=fakeCore();
  const service=createMerchantCatalogService({dataCore:core});

  await assert.rejects(()=>service.createProduct({name:'Tea',price:100,status:'unknown'}),error=>error.code==='CATALOG_STATUS_NOT_ALLOWED');
  await assert.rejects(()=>service.createProduct({name:'Tea',price:100,status:'archived'}),error=>error.code==='CATALOG_INVALID_INITIAL_STATUS');
  await assert.rejects(()=>service.updateProduct({productId:'p1',status:'active'}),error=>error.code==='CATALOG_STATUS_WRITE_FORBIDDEN');
  await assert.rejects(()=>service.updateProduct({productId:'p1',deleted_at:'2026-01-01'}),error=>error.code==='CATALOG_DELETION_WRITE_FORBIDDEN');
  await assert.rejects(()=>service.updateCategory({categoryId:'c1',deletedAt:'2026-01-01'}),error=>error.code==='CATALOG_DELETION_WRITE_FORBIDDEN');
  await assert.rejects(()=>service.updateVariant({variantId:'v1',status:'archived'}),error=>error.code==='CATALOG_STATUS_WRITE_FORBIDDEN');
});

test('direct featured writes cannot bypass the guarded featured-set operation',async()=>{
  const {core}=fakeCore({products:[{id:'p1',status:'active',price:100,currency:'JPY'}]});
  const service=createMerchantCatalogService({dataCore:core});
  await assert.rejects(()=>service.createProduct({name:'Tea',price:100,featured:true}),error=>error.code==='CATALOG_FEATURED_WRITE_FORBIDDEN');
  await assert.rejects(()=>service.updateProduct({productId:'p1',featured:true}),error=>error.code==='CATALOG_FEATURED_WRITE_FORBIDDEN');
});

test('active product creation applies sellable money, closed currency, and active category guards',async()=>{
  const {core,calls}=fakeCore({categories:[
    {id:'c1',status:'active'},
    {id:'c2',status:'draft'},
  ]});
  const service=createMerchantCatalogService({dataCore:core,allowedCurrencies:['JPY']});

  await assert.rejects(()=>service.createProduct({name:'Bad',price:12.5,currency:'JPY',status:'active'}),error=>error.code==='CATALOG_PRODUCT_NOT_SELLABLE');
  await assert.rejects(()=>service.createProduct({name:'Bad',price:100,currency:'USD',status:'active'}),error=>error.code==='CATALOG_CURRENCY_NOT_ALLOWED');
  await assert.rejects(()=>service.createProduct({name:'Bad',price:100,currency:'JPY',categoryId:'missing',status:'active'}),error=>error.code==='CATALOG_CATEGORY_NOT_FOUND');
  await assert.rejects(()=>service.createProduct({name:'Bad',price:100,currency:'JPY',categoryId:'c2',status:'active'}),error=>error.code==='CATALOG_CATEGORY_NOT_ACTIVE');
  await service.createProduct({name:'Good',price:100,currency:'JPY',categoryId:'c1',status:'active'});
  assert.ok(calls.some(call=>call[0]==='lockingTransaction'));
  assert.ok(calls.some(call=>call[0]==='create'&&call[1]==='products'&&call[2].category_id==='c1'));
});

test('editing an active product revalidates merged price, currency, and category state',async()=>{
  const {core}=fakeCore({
    products:[{id:'p1',status:'active',price:100,currency:'JPY',category_id:'c1'}],
    categories:[{id:'c1',status:'active'},{id:'c2',status:'draft'}],
  });
  const service=createMerchantCatalogService({dataCore:core,allowedCurrencies:['JPY']});

  await assert.rejects(()=>service.updateProduct({productId:'p1',price:10.5}),error=>error.code==='CATALOG_PRODUCT_NOT_SELLABLE');
  await assert.rejects(()=>service.updateProduct({productId:'p1',currency:'USD'}),error=>error.code==='CATALOG_CURRENCY_NOT_ALLOWED');
  await assert.rejects(()=>service.updateProduct({productId:'p1',categoryId:'c2'}),error=>error.code==='CATALOG_CATEGORY_NOT_ACTIVE');
  await service.updateProduct({productId:'p1',price:200,currency:'JPY',categoryId:'c1'});
});

test('default-active variant creation and active edits enforce parent, SKU, money, and identity guards',async()=>{
  const {core}=fakeCore({
    products:[{id:'p1',status:'active'},{id:'p2',status:'draft'}],
    product_variants:[
      {id:'v1',status:'active',product_id:'p1',sku_code:'TAKEN',price:100,currency:'JPY'},
      {id:'v2',status:'active',product_id:'p1',sku_code:'EDIT',price:100,currency:'JPY'},
    ],
  });
  const service=createMerchantCatalogService({dataCore:core,allowedCurrencies:['JPY']});

  await assert.rejects(()=>service.createVariant({productId:'p2',skuCode:'NEW',price:100,currency:'JPY'}),error=>error.code==='CATALOG_PRODUCT_NOT_ACTIVE');
  await assert.rejects(()=>service.createVariant({productId:'p1',skuCode:'TAKEN',price:100,currency:'JPY'}),error=>error.code==='CATALOG_SKU_DUPLICATE');
  await assert.rejects(()=>service.createVariant({productId:'p1',skuCode:'NEW',price:10.5,currency:'JPY'}),error=>error.code==='CATALOG_VARIANT_NOT_SELLABLE');
  await assert.rejects(()=>service.createVariant({productId:'p1',skuCode:'NEW',price:100,currency:'USD'}),error=>error.code==='CATALOG_CURRENCY_NOT_ALLOWED');
  await assert.rejects(()=>service.updateVariant({variantId:'v2',price:10.5}),error=>error.code==='CATALOG_VARIANT_NOT_SELLABLE');
  await assert.rejects(()=>service.updateVariant({variantId:'v2',currency:'USD'}),error=>error.code==='CATALOG_CURRENCY_NOT_ALLOWED');
  await assert.rejects(()=>service.updateVariant({variantId:'v2',skuCode:'OTHER'}),error=>error.code==='CATALOG_VARIANT_IDENTITY_IMMUTABLE');
  await assert.rejects(()=>service.updateVariant({variantId:'v2',productId:'p2'}),error=>error.code==='CATALOG_VARIANT_IDENTITY_IMMUTABLE');
  await service.createVariant({productId:'p1',skuCode:'NEW',price:100,currency:'JPY'});
  await service.updateVariant({variantId:'v2',price:200,currency:'JPY'});
});

test('featured products enforce the configured limit, scope, active status, and atomic replacement',async()=>{
  const {core,calls}=fakeCore({products:[
    {id:'p1',status:'active',featured:true,price:100,currency:'JPY'},
    {id:'p2',status:'active',featured:false,price:100,currency:'JPY'},
    {id:'p3',status:'draft',featured:false,price:100,currency:'JPY'},
  ]});
  const service=createMerchantCatalogService({dataCore:core,featuredLimit:2});

  const result=await service.setFeaturedProducts({productIds:['p2']});
  assert.deepEqual(result.map(item=>item.id),['p1','p2']);
  assert.equal(calls.filter(call=>call[0]==='lockingTransaction').length,1);
  assert.deepEqual(calls.filter(call=>call[0]==='update').slice(-2),[
    ['update','products','p1',{featured:false}],
    ['update','products','p2',{featured:true}],
  ]);
  await assert.rejects(()=>service.setFeaturedProducts({productIds:['p1','p2','p3']}),error=>error.code==='CATALOG_FEATURED_LIMIT_EXCEEDED');
  await assert.rejects(()=>service.setFeaturedProducts({productIds:['p2','p2']}),error=>error.code==='DUPLICATE_PRODUCT_ID');
  await assert.rejects(()=>service.setFeaturedProducts({productIds:['outside']}),error=>error.code==='CATALOG_PRODUCT_NOT_FOUND');
  await assert.rejects(()=>service.setFeaturedProducts({productIds:['p3']}),error=>error.code==='CATALOG_FEATURED_PRODUCT_NOT_ACTIVE');
});

test('product and category ordering validate all scoped records before transactional writes',async()=>{
  const {core,calls}=fakeCore({
    products:[{id:'p1',status:'active'},{id:'p2',status:'draft'}],
    categories:[{id:'c1',status:'active'},{id:'c2',status:'draft'}],
  });
  const service=createMerchantCatalogService({dataCore:core});

  await service.reorderProducts({items:[{productId:'p2',sortOrder:1},{productId:'p1',sortOrder:2}]});
  await service.reorderCategories({items:[{categoryId:'c2',sortOrder:1},{categoryId:'c1',sortOrder:2}]});
  assert.equal(calls.filter(call=>call[0]==='listAllForUpdate').length,2);
  await assert.rejects(()=>service.reorderProducts({items:[{productId:'outside',sortOrder:1}]}),error=>error.code==='CATALOG_PRODUCT_ORDER_SCOPE_MISMATCH');
  await assert.rejects(()=>service.reorderCategories({items:[{categoryId:'c1',sortOrder:1},{categoryId:'c1',sortOrder:2}]}),error=>error.code==='DUPLICATE_CATEGORY_ID');
});

test('ordering requires the complete scoped set and canonical unique positions',async()=>{
  const {core}=fakeCore({
    products:[{id:'p1'},{id:'p2'},{id:'p3'}],
    categories:[{id:'c1'},{id:'c2'}],
  });
  const service=createMerchantCatalogService({dataCore:core});

  await assert.rejects(()=>service.reorderProducts({items:[{productId:'p1',sortOrder:1},{productId:'p2',sortOrder:2}]}),error=>error.code==='CATALOG_PRODUCT_ORDER_SCOPE_MISMATCH');
  await assert.rejects(()=>service.reorderProducts({items:[{productId:'p1',sortOrder:1},{productId:'p2',sortOrder:2},{productId:'outside',sortOrder:3}]}),error=>error.code==='CATALOG_PRODUCT_ORDER_SCOPE_MISMATCH');
  await assert.rejects(()=>service.reorderProducts({items:[{productId:'p1',sortOrder:1},{productId:'p2',sortOrder:1},{productId:'p3',sortOrder:3}]}),error=>error.code==='CATALOG_ORDER_POSITION_DUPLICATE');
  await assert.rejects(()=>service.reorderProducts({items:[{productId:'p1',sortOrder:1},{productId:'p2',sortOrder:2},{productId:'p3',sortOrder:4}]}),error=>error.code==='CATALOG_ORDER_POSITION_INVALID');
  await assert.rejects(()=>service.reorderCategories({items:[{categoryId:'c1',sortOrder:1}]}),error=>error.code==='CATALOG_CATEGORY_ORDER_SCOPE_MISMATCH');
  await service.reorderProducts({items:[{productId:'p2',sortOrder:1},{productId:'p3',sortOrder:2},{productId:'p1',sortOrder:3}]});
});

test('a failed atomic catalog update rejects without reporting partial success',async()=>{
  const {core,records}=fakeCore({products:[
    {id:'p1',status:'active',featured:true},
    {id:'p2',status:'active',featured:false},
  ]});
  const originalTransaction=core.lockingTransaction;
  core.lockingTransaction=async work=>originalTransaction.call(core,async tx=>{
    const originalLockingRepository=tx.lockingRepository;
    tx.lockingRepository=policy=>{
      const repository=originalLockingRepository(policy);
      const originalUpdate=repository.updateById;
      return{...repository,async updateById(id,data){
        if(id==='p2')throw Object.assign(new Error('ADAPTER_WRITE_FAILED'),{code:'ADAPTER_WRITE_FAILED'});
        return originalUpdate.call(repository,id,data);
      }};
    };
    return work(tx);
  });
  const service=createMerchantCatalogService({dataCore:core});
  await assert.rejects(()=>service.setFeaturedProducts({productIds:['p2']}),error=>error.code==='ADAPTER_WRITE_FAILED');
  assert.equal(records.get('products').get('p1').featured,true);
  assert.equal(records.get('products').get('p2').featured,false);
});

test('featured replacement clears every prior page before selecting the new set',async()=>{
  const products=Array.from({length:101},(_,index)=>({
    id:`old-${index+1}`,
    status:'active',
    featured:true,
  }));
  products.push({id:'new',status:'active',featured:false});
  const {core,records}=fakeCore({products});
  const service=createMerchantCatalogService({dataCore:core,featuredLimit:1});

  await service.setFeaturedProducts({productIds:['new']});

  assert.equal(records.get('products').get('old-1').featured,false);
  assert.equal(records.get('products').get('old-101').featured,false);
  assert.equal(records.get('products').get('new').featured,true);
});

test('catalog refuses a dataCore that cannot promise locked serializable reads',()=>{
  assert.throws(
    ()=>createMerchantCatalogService({dataCore:{repository(){return{}}}}),
    error=>error.code==='MISSING_CATALOG_LOCKING_TRANSACTION',
  );
});

test('lifecycle, featured, and ordering paths use only explicit locked reads',async()=>{
  const {core,calls}=fakeCore({
    products:[{id:'p1',status:'draft',price:100,currency:'JPY',featured:false}],
    categories:[{id:'c1',status:'draft'}],
  });
  const service=createMerchantCatalogService({dataCore:core});
  await service.transitionProduct({productId:'p1',toStatus:'active'});
  await service.setFeaturedProducts({productIds:['p1']});
  await service.reorderProducts({items:[{productId:'p1',sortOrder:1}]});
  assert.equal(calls.filter(call=>call[0]==='get').length,0);
  assert.equal(calls.filter(call=>call[0]==='list').length,0);
  assert.ok(calls.filter(call=>call[0]==='getForUpdate').length>=1);
  assert.ok(calls.filter(call=>call[0]==='listAllForUpdate').length>=2);
});

test('concurrent featured replacements serialize and leave exactly one complete selection',async()=>{
  const {core,records,calls}=fakeCore({products:[
    {id:'p1',status:'active',featured:false,price:100,currency:'JPY'},
    {id:'p2',status:'active',featured:false,price:100,currency:'JPY'},
  ]});
  const service=createMerchantCatalogService({dataCore:core,featuredLimit:1});
  await Promise.all([
    service.setFeaturedProducts({productIds:['p1']}),
    service.setFeaturedProducts({productIds:['p2']}),
  ]);
  assert.equal(records.get('products').get('p1').featured,false);
  assert.equal(records.get('products').get('p2').featured,true);
  assert.equal(calls.filter(call=>call[0]==='lockingTransaction').length,2);
});
