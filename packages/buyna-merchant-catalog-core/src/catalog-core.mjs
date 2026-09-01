function fail(code){const error=new Error(code);error.code=code;throw error}
function required(value,code){const text=String(value??'').trim();if(!text)fail(code);return text}
function optional(value){const text=String(value??'').trim();return text||undefined}
function compact(object){return Object.fromEntries(Object.entries(object).filter(([,value])=>value!==undefined&&value!==''))}
function nonNegative(value,code){const number=Number(value);if(!Number.isFinite(number)||number<0)fail(code);return number}
function stockQuantity(value,code){const number=Number(value);if(!Number.isSafeInteger(number)||number<0)fail(code);return number}
function own(object,key){return Object.prototype.hasOwnProperty.call(object??{},key)}
function method(owner,name,code){if(typeof owner?.[name]!=='function')fail(code)}

export const CATALOG_STATES=Object.freeze({
  DRAFT:'draft',
  ACTIVE:'active',
  ARCHIVED:'archived',
});

export const CATALOG_TRANSITIONS=Object.freeze({
  draft:Object.freeze(['active','archived']),
  active:Object.freeze(['draft','archived']),
  archived:Object.freeze([]),
});

const allowedStates=new Set(Object.values(CATALOG_STATES));
const deletionFields=Object.freeze(['deleted_at','deletedAt','archived_at','archivedAt','restored_at','restoredAt']);
const lifecycleWrites=['status','deleted_at','archived_at','restored_at'];

function status(value){
  const normalized=required(value,'CATALOG_STATUS_REQUIRED').toLowerCase();
  if(!allowedStates.has(normalized))fail('CATALOG_STATUS_NOT_ALLOWED');
  return normalized;
}

function rejectManagedWrites(input={}){
  if(own(input,'status'))fail('CATALOG_STATUS_WRITE_FORBIDDEN');
  if(deletionFields.some(field=>own(input,field)))fail('CATALOG_DELETION_WRITE_FORBIDDEN');
  if(own(input,'featured'))fail('CATALOG_FEATURED_WRITE_FORBIDDEN');
  if(own(input,'mainImageId')||own(input,'main_image_id'))fail('CATALOG_PRODUCT_MEDIA_WRITE_FORBIDDEN');
}

function rejectCreateManagedWrites(input={}){
  if(deletionFields.some(field=>own(input,field)))fail('CATALOG_DELETION_WRITE_FORBIDDEN');
  if(own(input,'featured'))fail('CATALOG_FEATURED_WRITE_FORBIDDEN');
  if(own(input,'mainImageId')||own(input,'main_image_id'))fail('CATALOG_PRODUCT_MEDIA_WRITE_FORBIDDEN');
}

function createStatus(value,fallback){
  const initial=status(value??fallback);
  if(initial===CATALOG_STATES.ARCHIVED)fail('CATALOG_INVALID_INITIAL_STATUS');
  return initial;
}

function timestamp(clock){
  const value=clock();
  if(!(value instanceof Date)||Number.isNaN(value.getTime()))fail('CATALOG_CLOCK_INVALID');
  return value.toISOString();
}

function transitionData(toStatus,clock,{restoring=false}={}){
  if(toStatus===CATALOG_STATES.ARCHIVED){
    const at=timestamp(clock);
    return{status:toStatus,deleted_at:at,archived_at:at};
  }
  if(restoring)return{status:toStatus,deleted_at:null,archived_at:null,restored_at:timestamp(clock)};
  return{status:toStatus};
}

function assertTransition(fromStatus,toStatus,{restoring=false}={}){
  const from=status(fromStatus);
  const to=status(toStatus);
  if(restoring){
    if(from!==CATALOG_STATES.ARCHIVED||to!==CATALOG_STATES.DRAFT)fail('CATALOG_INVALID_TRANSITION');
    return to;
  }
  if(!CATALOG_TRANSITIONS[from].includes(to))fail('CATALOG_INVALID_TRANSITION');
  return to;
}

function currencySet(values){
  if(!Array.isArray(values)||!values.length)fail('CATALOG_ALLOWED_CURRENCIES_REQUIRED');
  const normalized=values.map(value=>required(value,'CATALOG_CURRENCY_REQUIRED').toUpperCase());
  if(normalized.some(value=>!/^[A-Z]{3}$/.test(value))||new Set(normalized).size!==normalized.length)fail('CATALOG_ALLOWED_CURRENCIES_INVALID');
  return new Set(normalized);
}

function assertSellableMoney(record,code,allowedCurrencies){
  if(!Number.isSafeInteger(record?.price)||record.price<0)fail(code);
  if(!allowedCurrencies.has(String(record?.currency??'').toUpperCase()))fail('CATALOG_CURRENCY_NOT_ALLOWED');
}

function normalizeOrder(items,{missingCode,idKey,duplicateCode}={}){
  if(!Array.isArray(items)||!items.length)fail(missingCode);
  const normalized=items.map(item=>({
    id:required(item?.[idKey],idKey==='productId'?'MISSING_PRODUCT_ID':'MISSING_CATEGORY_ID'),
    sortOrder:Number(item?.sortOrder),
  }));
  if(new Set(normalized.map(item=>item.id)).size!==normalized.length)fail(duplicateCode);
  if(normalized.some(item=>!Number.isSafeInteger(item.sortOrder)||item.sortOrder<1))fail('CATALOG_ORDER_POSITION_INVALID');
  if(new Set(normalized.map(item=>item.sortOrder)).size!==normalized.length)fail('CATALOG_ORDER_POSITION_DUPLICATE');
  return normalized;
}

const productPolicy=Object.freeze({
  entity:'products',
  allowedFilters:['search','status','category_id','featured'],
  allowedSort:['sort_order','updated_at','created_at','name','price','stock'],
  allowedWrite:['name','description','short_description','price','currency','stock','category_id','sort_order','featured',...lifecycleWrites],
});
const categoryPolicy=Object.freeze({
  entity:'categories',
  allowedFilters:['search','status'],
  allowedSort:['sort_order','name','updated_at','created_at'],
  allowedWrite:['name','slug','description','sort_order',...lifecycleWrites],
});
const variantPolicy=Object.freeze({
  entity:'product_variants',
  allowedFilters:['product_id','status','sku_code'],
  allowedSort:['sort_order','created_at','sku_code','price','stock_quantity'],
  allowedWrite:['product_id','sku_code','options','price','currency','stock_quantity','sort_order',...lifecycleWrites],
});

export function createMerchantCatalogService({dataCore,clock=()=>new Date(),featuredLimit=6,allowedCurrencies=['JPY']}={}){
  if(typeof dataCore?.repository!=='function')fail('MISSING_MERCHANT_DATA_CORE');
  method(dataCore,'lockingTransaction','MISSING_CATALOG_LOCKING_TRANSACTION');
  if(!Number.isSafeInteger(featuredLimit)||featuredLimit<0)fail('CATALOG_FEATURED_LIMIT_INVALID');
  const currencies=currencySet(allowedCurrencies);
  const products=dataCore.repository(productPolicy);
  const categories=dataCore.repository(categoryPolicy);
  const variants=dataCore.repository(variantPolicy);

  function lockingRepository(transactionCore,policy){
    method(transactionCore,'lockingRepository','MISSING_CATALOG_LOCKING_REPOSITORY');
    const repository=transactionCore.lockingRepository(policy);
    method(repository,'getByIdForUpdate','MISSING_CATALOG_LOCKED_GET');
    method(repository,'listAllForUpdate','MISSING_CATALOG_LOCKED_LIST');
    method(repository,'updateById','MISSING_CATALOG_LOCKED_UPDATE');
    method(repository,'create','MISSING_CATALOG_LOCKED_CREATE');
    return repository;
  }

  async function withLocks(work){return dataCore.lockingTransaction(work)}

  async function assertActiveCategory(transactionCore,categoryId){
    if(!categoryId)return;
    const category=await lockingRepository(transactionCore,categoryPolicy).getByIdForUpdate(categoryId);
    if(!category)fail('CATALOG_CATEGORY_NOT_FOUND');
    if(category.status!==CATALOG_STATES.ACTIVE)fail('CATALOG_CATEGORY_NOT_ACTIVE');
  }

  async function assertNoActiveProducts(transactionCore,categoryId){
    const active=await lockingRepository(transactionCore,productPolicy).listAllForUpdate({filters:{status:CATALOG_STATES.ACTIVE,category_id:categoryId}});
    if(active.length)fail('CATALOG_CATEGORY_HAS_ACTIVE_PRODUCTS');
  }

  async function assertNoActiveVariants(transactionCore,productId){
    const active=await lockingRepository(transactionCore,variantPolicy).listAllForUpdate({filters:{product_id:productId,status:CATALOG_STATES.ACTIVE}});
    if(active.length)fail('CATALOG_PRODUCT_HAS_ACTIVE_VARIANTS');
  }

  function assertActiveProductCandidate(record){assertSellableMoney(record,'CATALOG_PRODUCT_NOT_SELLABLE',currencies)}

  async function assertActiveVariantCandidate(transactionCore,repository,record,{excludeId}={}){
    if(!String(record?.sku_code??'').trim())fail('CATALOG_SKU_REQUIRED');
    assertSellableMoney(record,'CATALOG_VARIANT_NOT_SELLABLE',currencies);
    const matchingSku=await repository.listAllForUpdate({filters:{sku_code:record.sku_code}});
    if(matchingSku.some(item=>item.id!==excludeId))fail('CATALOG_SKU_DUPLICATE');
    const product=await lockingRepository(transactionCore,productPolicy).getByIdForUpdate(required(record.product_id,'MISSING_PRODUCT_ID'));
    if(!product)fail('CATALOG_PRODUCT_NOT_FOUND');
    if(product.status!==CATALOG_STATES.ACTIVE)fail('CATALOG_PRODUCT_NOT_ACTIVE');
  }

  async function transitionProduct({productId,toStatus}={},options={}){
    const id=required(productId,'MISSING_PRODUCT_ID');
    return withLocks(async transactionCore=>{
      const repository=lockingRepository(transactionCore,productPolicy);
      const product=await repository.getByIdForUpdate(id);
      if(!product)fail('CATALOG_PRODUCT_NOT_FOUND');
      const to=assertTransition(product.status,toStatus,options);
      if(to===CATALOG_STATES.ACTIVE){
        assertActiveProductCandidate(product);
        await assertActiveCategory(transactionCore,product.category_id);
      }
      if(product.status===CATALOG_STATES.ACTIVE&&to!==CATALOG_STATES.ACTIVE)await assertNoActiveVariants(transactionCore,id);
      return repository.updateById(id,transitionData(to,clock,options));
    });
  }

  async function transitionCategory({categoryId,toStatus}={},options={}){
    const id=required(categoryId,'MISSING_CATEGORY_ID');
    return withLocks(async transactionCore=>{
      const repository=lockingRepository(transactionCore,categoryPolicy);
      const category=await repository.getByIdForUpdate(id);
      if(!category)fail('CATALOG_CATEGORY_NOT_FOUND');
      const to=assertTransition(category.status,toStatus,options);
      if(category.status===CATALOG_STATES.ACTIVE&&to!==CATALOG_STATES.ACTIVE)await assertNoActiveProducts(transactionCore,id);
      return repository.updateById(id,transitionData(to,clock,options));
    });
  }

  async function transitionVariant({variantId,toStatus}={},options={}){
    const id=required(variantId,'MISSING_VARIANT_ID');
    return withLocks(async transactionCore=>{
      const repository=lockingRepository(transactionCore,variantPolicy);
      const variant=await repository.getByIdForUpdate(id);
      if(!variant)fail('CATALOG_VARIANT_NOT_FOUND');
      const restoring=variant.status===CATALOG_STATES.ARCHIVED&&toStatus===CATALOG_STATES.DRAFT;
      const transitionOptions={...options,restoring:options.restoring??restoring};
      const to=assertTransition(variant.status,toStatus,transitionOptions);
      if(to===CATALOG_STATES.ACTIVE)await assertActiveVariantCandidate(transactionCore,repository,variant,{excludeId:id});
      return repository.updateById(id,transitionData(to,clock,transitionOptions));
    });
  }

  async function reorder({items,policy,missingCode,idKey,duplicateCode,scopeCode}={}){
    const normalized=normalizeOrder(items,{missingCode,idKey,duplicateCode});
    return withLocks(async transactionCore=>{
      const repository=lockingRepository(transactionCore,policy);
      const scoped=await repository.listAllForUpdate({filters:{}});
      const scopedIds=new Set(scoped.map(record=>record.id));
      if(normalized.length!==scoped.length||normalized.some(item=>!scopedIds.has(item.id)))fail(scopeCode);
      const canonical=[...normalized].map(item=>item.sortOrder).sort((a,b)=>a-b);
      if(canonical.some((position,index)=>position!==index+1))fail('CATALOG_ORDER_POSITION_INVALID');
      const updated=[];
      for(const item of normalized)updated.push(await repository.updateById(item.id,{sort_order:item.sortOrder}));
      return updated;
    });
  }

  return{
    async listProducts(input={}){
      return products.list({page:input.page,pageSize:input.pageSize,filters:compact({search:optional(input.search),status:optional(input.status),category_id:optional(input.categoryId)}),sort:input.sort});
    },
    async createProduct(input={}){
      rejectCreateManagedWrites(input);
      const data={
        name:required(input.name,'MISSING_PRODUCT_NAME'),
        price:nonNegative(input.price,'INVALID_PRODUCT_PRICE'),
        stock:stockQuantity(input.stock??0,'INVALID_PRODUCT_STOCK'),
        currency:required(input.currency??'JPY','MISSING_CURRENCY').toUpperCase(),
        status:createStatus(input.status,CATALOG_STATES.DRAFT),
        ...compact({description:input.description,short_description:input.shortDescription,category_id:input.categoryId,sort_order:input.sortOrder===undefined?undefined:stockQuantity(input.sortOrder,'CATALOG_SORT_ORDER_INVALID')}),
      };
      if(data.status!==CATALOG_STATES.ACTIVE)return products.create(data);
      return withLocks(async transactionCore=>{
        const repository=lockingRepository(transactionCore,productPolicy);
        assertActiveProductCandidate(data);
        await assertActiveCategory(transactionCore,data.category_id);
        return repository.create(data);
      });
    },
    async updateProduct(input={}){
      rejectManagedWrites(input);
      const id=required(input.productId,'MISSING_PRODUCT_ID');
      const data=compact({
        name:input.name===undefined?undefined:required(input.name,'MISSING_PRODUCT_NAME'),
        description:input.description,
        short_description:input.shortDescription,
        price:input.price===undefined?undefined:nonNegative(input.price,'INVALID_PRODUCT_PRICE'),
        currency:input.currency===undefined?undefined:required(input.currency,'MISSING_CURRENCY').toUpperCase(),
        stock:input.stock===undefined?undefined:stockQuantity(input.stock,'INVALID_PRODUCT_STOCK'),
        category_id:input.categoryId,
      });
      return withLocks(async transactionCore=>{
        const repository=lockingRepository(transactionCore,productPolicy);
        const current=await repository.getByIdForUpdate(id);
        if(!current)fail('CATALOG_PRODUCT_NOT_FOUND');
        const candidate={...current,...data};
        if(candidate.status===CATALOG_STATES.ACTIVE){
          assertActiveProductCandidate(candidate);
          await assertActiveCategory(transactionCore,candidate.category_id);
        }
        return repository.updateById(id,data);
      });
    },
    async setProductStock({productId,stock}={}){
      return products.updateById(required(productId,'MISSING_PRODUCT_ID'),{stock:stockQuantity(stock,'INVALID_PRODUCT_STOCK')});
    },
    async setProductVisibility({productId,visible}={}){
      if(typeof visible!=='boolean')fail('INVALID_PRODUCT_VISIBILITY');
      return transitionProduct({productId,toStatus:visible?CATALOG_STATES.ACTIVE:CATALOG_STATES.DRAFT});
    },
    async archiveProduct({productId}={}){return transitionProduct({productId,toStatus:CATALOG_STATES.ARCHIVED})},
    transitionProduct,
    async restoreProduct({productId}={}){return transitionProduct({productId,toStatus:CATALOG_STATES.DRAFT},{restoring:true})},
    async reorderProducts({items}={}){
      return reorder({items,policy:productPolicy,missingCode:'MISSING_PRODUCT_ORDER',idKey:'productId',duplicateCode:'DUPLICATE_PRODUCT_ID',scopeCode:'CATALOG_PRODUCT_ORDER_SCOPE_MISMATCH'});
    },
    async setFeaturedProducts({productIds}={}){
      if(!Array.isArray(productIds))fail('MISSING_FEATURED_PRODUCTS');
      const ids=productIds.map(id=>required(id,'MISSING_PRODUCT_ID'));
      if(new Set(ids).size!==ids.length)fail('DUPLICATE_PRODUCT_ID');
      if(ids.length>featuredLimit)fail('CATALOG_FEATURED_LIMIT_EXCEEDED');
      return withLocks(async transactionCore=>{
        const repository=lockingRepository(transactionCore,productPolicy);
        const scoped=await repository.listAllForUpdate({filters:{}});
        const byId=new Map(scoped.map(product=>[product.id,product]));
        for(const id of ids){
          const product=byId.get(id);
          if(!product)fail('CATALOG_PRODUCT_NOT_FOUND');
          if(product.status!==CATALOG_STATES.ACTIVE)fail('CATALOG_FEATURED_PRODUCT_NOT_ACTIVE');
        }
        const selectedSet=new Set(ids);
        const updates=[];
        for(const product of scoped){
          const next=selectedSet.has(product.id);
          if(Boolean(product.featured)!==next)updates.push(await repository.updateById(product.id,{featured:next}));
        }
        return updates;
      });
    },
    async listCategories(input={}){
      return categories.list({page:input.page,pageSize:input.pageSize,filters:compact({search:optional(input.search),status:optional(input.status)}),sort:input.sort});
    },
    async createCategory(input={}){
      rejectCreateManagedWrites(input);
      return categories.create({name:required(input.name,'MISSING_CATEGORY_NAME'),slug:required(input.slug,'MISSING_CATEGORY_SLUG'),status:createStatus(input.status,CATALOG_STATES.DRAFT)});
    },
    async updateCategory(input={}){
      rejectManagedWrites(input);
      const data=compact({name:input.name===undefined?undefined:required(input.name,'MISSING_CATEGORY_NAME'),slug:input.slug===undefined?undefined:required(input.slug,'MISSING_CATEGORY_SLUG'),description:input.description});
      return categories.updateById(required(input.categoryId,'MISSING_CATEGORY_ID'),data);
    },
    async setCategoryVisibility({categoryId,visible}={}){
      if(typeof visible!=='boolean')fail('INVALID_CATEGORY_VISIBILITY');
      return transitionCategory({categoryId,toStatus:visible?CATALOG_STATES.ACTIVE:CATALOG_STATES.DRAFT});
    },
    async archiveCategory({categoryId}={}){return transitionCategory({categoryId,toStatus:CATALOG_STATES.ARCHIVED})},
    transitionCategory,
    async restoreCategory({categoryId}={}){return transitionCategory({categoryId,toStatus:CATALOG_STATES.DRAFT},{restoring:true})},
    async reorderCategories({items}={}){
      return reorder({items,policy:categoryPolicy,missingCode:'MISSING_CATEGORY_ORDER',idKey:'categoryId',duplicateCode:'DUPLICATE_CATEGORY_ID',scopeCode:'CATALOG_CATEGORY_ORDER_SCOPE_MISMATCH'});
    },
    async createVariant(input={}){
      rejectCreateManagedWrites(input);
      const data={
        product_id:required(input.productId,'MISSING_PRODUCT_ID'),
        sku_code:required(input.skuCode,'MISSING_SKU_CODE'),
        options:input.options??{},
        price:nonNegative(input.price,'INVALID_VARIANT_PRICE'),
        stock_quantity:stockQuantity(input.stock??0,'INVALID_VARIANT_STOCK'),
        currency:required(input.currency??'JPY','MISSING_CURRENCY').toUpperCase(),
        status:createStatus(input.status,CATALOG_STATES.ACTIVE),
      };
      if(data.status!==CATALOG_STATES.ACTIVE)return variants.create(data);
      return withLocks(async transactionCore=>{
        const repository=lockingRepository(transactionCore,variantPolicy);
        await assertActiveVariantCandidate(transactionCore,repository,data);
        return repository.create(data);
      });
    },
    async updateVariant(input={}){
      rejectManagedWrites(input);
      if(own(input,'productId')||own(input,'skuCode'))fail('CATALOG_VARIANT_IDENTITY_IMMUTABLE');
      const id=required(input.variantId,'MISSING_VARIANT_ID');
      const data=compact({
        price:input.price===undefined?undefined:nonNegative(input.price,'INVALID_VARIANT_PRICE'),
        currency:input.currency===undefined?undefined:required(input.currency,'MISSING_CURRENCY').toUpperCase(),
        stock_quantity:input.stock===undefined?undefined:stockQuantity(input.stock,'INVALID_VARIANT_STOCK'),
        options:input.options,
      });
      return withLocks(async transactionCore=>{
        const repository=lockingRepository(transactionCore,variantPolicy);
        const current=await repository.getByIdForUpdate(id);
        if(!current)fail('CATALOG_VARIANT_NOT_FOUND');
        const candidate={...current,...data};
        if(candidate.status===CATALOG_STATES.ACTIVE)await assertActiveVariantCandidate(transactionCore,repository,candidate,{excludeId:id});
        return repository.updateById(id,data);
      });
    },
    transitionVariant,
  };
}

export {productPolicy as PRODUCT_POLICY,categoryPolicy as CATEGORY_POLICY,variantPolicy as VARIANT_POLICY};
export {createProductMediaService} from './product-media-core.mjs';
