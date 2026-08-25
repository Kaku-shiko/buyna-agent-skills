function fail(code){const error=new Error(code);error.code=code;throw error}
function required(value,code){const text=String(value??'').trim();if(!text)fail(code);return text}
function optional(value){const text=String(value??'').trim();return text||undefined}
function compact(object){return Object.fromEntries(Object.entries(object).filter(([,value])=>value!==undefined&&value!==''))}
function nonNegative(value,code){const number=Number(value);if(!Number.isFinite(number)||number<0)fail(code);return number}
function own(object,key){return Object.prototype.hasOwnProperty.call(object??{},key)}

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

function status(value){
  const normalized=required(value,'CATALOG_STATUS_REQUIRED').toLowerCase();
  if(!allowedStates.has(normalized))fail('CATALOG_STATUS_NOT_ALLOWED');
  return normalized;
}

function rejectManagedWrites(input={}){
  if(own(input,'status'))fail('CATALOG_STATUS_WRITE_FORBIDDEN');
  if(deletionFields.some(field=>own(input,field)))fail('CATALOG_DELETION_WRITE_FORBIDDEN');
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
  if(restoring){
    return{status:toStatus,deleted_at:null,archived_at:null,restored_at:timestamp(clock)};
  }
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

function assertSellableMoney(record,code){
  if(!Number.isSafeInteger(record?.price)||record.price<0||!/^[A-Z]{3}$/.test(String(record?.currency??'')))fail(code);
}

function normalizeOrder(items,{missingCode,idKey,duplicateCode}={}){
  if(!Array.isArray(items)||!items.length)fail(missingCode);
  const normalized=items.map(item=>({
    id:required(item?.[idKey],idKey==='productId'?'MISSING_PRODUCT_ID':'MISSING_CATEGORY_ID'),
    sortOrder:nonNegative(item?.sortOrder,'INVALID_SORT_ORDER'),
  }));
  if(new Set(normalized.map(item=>item.id)).size!==normalized.length)fail(duplicateCode);
  return normalized;
}

const lifecycleWrites=['status','deleted_at','archived_at','restored_at'];
const productPolicy=Object.freeze({
  entity:'products',
  allowedFilters:['search','status','category_id','featured'],
  allowedSort:['sort_order','updated_at','created_at','name','price','stock'],
  allowedWrite:['name','description','short_description','price','currency','stock','category_id','main_image_id','sort_order','featured',...lifecycleWrites],
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

export function createMerchantCatalogService({dataCore,clock=()=>new Date(),featuredLimit=6}={}){
  if(typeof dataCore?.repository!=='function')fail('MISSING_MERCHANT_DATA_CORE');
  if(!Number.isSafeInteger(featuredLimit)||featuredLimit<0)fail('CATALOG_FEATURED_LIMIT_INVALID');
  const products=dataCore.repository(productPolicy);
  const categories=dataCore.repository(categoryPolicy);
  const variants=dataCore.repository(variantPolicy);

  async function transitionProduct({productId,toStatus}={},options={}){
    const id=required(productId,'MISSING_PRODUCT_ID');
    if(typeof dataCore.transaction!=='function')fail('MISSING_TRANSACTION');
    return dataCore.transaction(async transactionCore=>{
      const productRepository=transactionCore.repository(productPolicy);
      const product=await productRepository.getById(id);
      if(!product)fail('CATALOG_PRODUCT_NOT_FOUND');
      const to=assertTransition(product.status,toStatus,options);
      if(to===CATALOG_STATES.ACTIVE){
        assertSellableMoney(product,'CATALOG_PRODUCT_NOT_SELLABLE');
        if(product.category_id){
          const category=await transactionCore.repository(categoryPolicy).getById(product.category_id);
          if(!category)fail('CATALOG_CATEGORY_NOT_FOUND');
          if(category.status!==CATALOG_STATES.ACTIVE)fail('CATALOG_CATEGORY_NOT_ACTIVE');
        }
      }
      return productRepository.updateById(id,transitionData(to,clock,options));
    });
  }

  async function transitionCategory({categoryId,toStatus}={},options={}){
    const id=required(categoryId,'MISSING_CATEGORY_ID');
    if(typeof dataCore.transaction!=='function')fail('MISSING_TRANSACTION');
    return dataCore.transaction(async transactionCore=>{
      const repository=transactionCore.repository(categoryPolicy);
      const category=await repository.getById(id);
      if(!category)fail('CATALOG_CATEGORY_NOT_FOUND');
      const to=assertTransition(category.status,toStatus,options);
      return repository.updateById(id,transitionData(to,clock,options));
    });
  }

  async function transitionVariant({variantId,toStatus}={},options={}){
    const id=required(variantId,'MISSING_VARIANT_ID');
    if(typeof dataCore.transaction!=='function')fail('MISSING_TRANSACTION');
    return dataCore.transaction(async transactionCore=>{
      const repository=transactionCore.repository(variantPolicy);
      const variant=await repository.getById(id);
      if(!variant)fail('CATALOG_VARIANT_NOT_FOUND');
      const restoring=variant.status===CATALOG_STATES.ARCHIVED&&toStatus===CATALOG_STATES.DRAFT;
      const transitionOptions={...options,restoring:options.restoring??restoring};
      const to=assertTransition(variant.status,toStatus,transitionOptions);
      if(to===CATALOG_STATES.ACTIVE){
        if(!String(variant.sku_code??'').trim())fail('CATALOG_SKU_REQUIRED');
        assertSellableMoney(variant,'CATALOG_VARIANT_NOT_SELLABLE');
        const matchingSku=await repository.list({filters:{sku_code:variant.sku_code},pageSize:2});
        if((matchingSku.items??[]).some(item=>item.id!==id))fail('CATALOG_SKU_DUPLICATE');
        const product=await transactionCore.repository(productPolicy).getById(required(variant.product_id,'MISSING_PRODUCT_ID'));
        if(!product)fail('CATALOG_PRODUCT_NOT_FOUND');
        if(product.status!==CATALOG_STATES.ACTIVE)fail('CATALOG_PRODUCT_NOT_ACTIVE');
      }
      return repository.updateById(id,transitionData(to,clock,transitionOptions));
    });
  }

  async function reorder({items,policy,missingCode,idKey,duplicateCode,notFoundCode}={}){
    const normalized=normalizeOrder(items,{missingCode,idKey,duplicateCode});
    if(typeof dataCore.transaction!=='function')fail('MISSING_TRANSACTION');
    return dataCore.transaction(async transactionCore=>{
      const repository=transactionCore.repository(policy);
      for(const item of normalized){
        const record=await repository.getById(item.id);
        if(!record)fail(notFoundCode);
      }
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
      if(deletionFields.some(field=>own(input,field)))fail('CATALOG_DELETION_WRITE_FORBIDDEN');
      return products.create({name:required(input.name,'MISSING_PRODUCT_NAME'),price:nonNegative(input.price,'INVALID_PRODUCT_PRICE'),stock:nonNegative(input.stock??0,'INVALID_PRODUCT_STOCK'),currency:required(input.currency??'JPY','MISSING_CURRENCY').toUpperCase(),status:createStatus(input.status,CATALOG_STATES.DRAFT)});
    },
    async updateProduct(input={}){
      rejectManagedWrites(input);
      const data=compact({name:input.name===undefined?undefined:required(input.name,'MISSING_PRODUCT_NAME'),description:input.description,short_description:input.shortDescription,price:input.price===undefined?undefined:nonNegative(input.price,'INVALID_PRODUCT_PRICE'),currency:input.currency===undefined?undefined:required(input.currency,'MISSING_CURRENCY').toUpperCase(),stock:input.stock===undefined?undefined:nonNegative(input.stock,'INVALID_PRODUCT_STOCK'),category_id:input.categoryId,featured:input.featured});
      return products.updateById(required(input.productId,'MISSING_PRODUCT_ID'),data);
    },
    async setProductStock({productId,stock}={}){
      return products.updateById(required(productId,'MISSING_PRODUCT_ID'),{stock:nonNegative(stock,'INVALID_PRODUCT_STOCK')});
    },
    async setProductVisibility({productId,visible}={}){
      if(typeof visible!=='boolean')fail('INVALID_PRODUCT_VISIBILITY');
      return transitionProduct({productId,toStatus:visible?CATALOG_STATES.ACTIVE:CATALOG_STATES.DRAFT});
    },
    async archiveProduct({productId}={}){
      return transitionProduct({productId,toStatus:CATALOG_STATES.ARCHIVED});
    },
    transitionProduct,
    async restoreProduct({productId}={}){
      return transitionProduct({productId,toStatus:CATALOG_STATES.DRAFT},{restoring:true});
    },
    async reorderProducts({items}={}){
      return reorder({items,policy:productPolicy,missingCode:'MISSING_PRODUCT_ORDER',idKey:'productId',duplicateCode:'DUPLICATE_PRODUCT_ID',notFoundCode:'CATALOG_PRODUCT_NOT_FOUND'});
    },
    async setFeaturedProducts({productIds}={}){
      if(!Array.isArray(productIds))fail('MISSING_FEATURED_PRODUCTS');
      const ids=productIds.map(id=>required(id,'MISSING_PRODUCT_ID'));
      if(new Set(ids).size!==ids.length)fail('DUPLICATE_PRODUCT_ID');
      if(ids.length>featuredLimit)fail('CATALOG_FEATURED_LIMIT_EXCEEDED');
      if(typeof dataCore.transaction!=='function')fail('MISSING_TRANSACTION');
      return dataCore.transaction(async transactionCore=>{
        const repository=transactionCore.repository(productPolicy);
        const selected=[];
        for(const id of ids){
          const product=await repository.getById(id);
          if(!product)fail('CATALOG_PRODUCT_NOT_FOUND');
          if(product.status!==CATALOG_STATES.ACTIVE)fail('CATALOG_FEATURED_PRODUCT_NOT_ACTIVE');
          selected.push(product);
        }
        const currentItems=[];
        let page=1;
        let totalPages=1;
        do{
          const current=await repository.list({filters:{featured:true},page,pageSize:Math.max(100,featuredLimit)});
          currentItems.push(...(current.items??[]));
          const responsePageSize=Number.isSafeInteger(current.pageSize)&&current.pageSize>0?current.pageSize:Math.max(current.items?.length??0,1);
          totalPages=Number.isSafeInteger(current.totalPages)?current.totalPages:Math.ceil(Number(current.total??currentItems.length)/responsePageSize);
          page+=1;
        }while(page<=totalPages);
        const selectedSet=new Set(ids);
        const updates=[];
        for(const product of currentItems){
          if(!selectedSet.has(product.id))updates.push(await repository.updateById(product.id,{featured:false}));
        }
        for(const product of selected){
          if(product.featured!==true)updates.push(await repository.updateById(product.id,{featured:true}));
        }
        return updates;
      });
    },
    async listCategories(input={}){
      return categories.list({page:input.page,pageSize:input.pageSize,filters:compact({search:optional(input.search),status:optional(input.status)}),sort:input.sort});
    },
    async createCategory(input={}){
      if(deletionFields.some(field=>own(input,field)))fail('CATALOG_DELETION_WRITE_FORBIDDEN');
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
    async archiveCategory({categoryId}={}){
      return transitionCategory({categoryId,toStatus:CATALOG_STATES.ARCHIVED});
    },
    transitionCategory,
    async restoreCategory({categoryId}={}){
      return transitionCategory({categoryId,toStatus:CATALOG_STATES.DRAFT},{restoring:true});
    },
    async reorderCategories({items}={}){
      return reorder({items,policy:categoryPolicy,missingCode:'MISSING_CATEGORY_ORDER',idKey:'categoryId',duplicateCode:'DUPLICATE_CATEGORY_ID',notFoundCode:'CATALOG_CATEGORY_NOT_FOUND'});
    },
    async createVariant(input={}){
      if(deletionFields.some(field=>own(input,field)))fail('CATALOG_DELETION_WRITE_FORBIDDEN');
      return variants.create({product_id:required(input.productId,'MISSING_PRODUCT_ID'),sku_code:required(input.skuCode,'MISSING_SKU_CODE'),options:input.options??{},price:nonNegative(input.price,'INVALID_VARIANT_PRICE'),stock_quantity:nonNegative(input.stock??0,'INVALID_VARIANT_STOCK'),currency:required(input.currency??'JPY','MISSING_CURRENCY').toUpperCase(),status:createStatus(input.status,CATALOG_STATES.ACTIVE)});
    },
    async updateVariant(input={}){
      rejectManagedWrites(input);
      const data=compact({price:input.price===undefined?undefined:nonNegative(input.price,'INVALID_VARIANT_PRICE'),stock_quantity:input.stock===undefined?undefined:nonNegative(input.stock,'INVALID_VARIANT_STOCK'),options:input.options});
      return variants.updateById(required(input.variantId,'MISSING_VARIANT_ID'),data);
    },
    transitionVariant,
  };
}

export {productPolicy as PRODUCT_POLICY,categoryPolicy as CATEGORY_POLICY,variantPolicy as VARIANT_POLICY};
