function fail(code){const error=new Error(code);error.code=code;throw error}
function required(value,code){const text=String(value??'').trim();if(!text)fail(code);return text}
function optional(value){const text=String(value??'').trim();return text||undefined}
function compact(object){return Object.fromEntries(Object.entries(object).filter(([,value])=>value!==undefined&&value!==''))}
function nonNegative(value,code){const number=Number(value);if(!Number.isFinite(number)||number<0)fail(code);return number}

const productPolicy=Object.freeze({
  entity:'products',
  allowedFilters:['search','status','category_id'],
  allowedSort:['sort_order','updated_at','created_at','name','price','stock'],
  allowedWrite:['name','description','short_description','price','currency','stock','category_id','main_image_id','sort_order','featured','status','deleted_at'],
});
const categoryPolicy=Object.freeze({
  entity:'categories',
  allowedFilters:['search','status'],
  allowedSort:['sort_order','name','updated_at','created_at'],
  allowedWrite:['name','slug','description','sort_order','status','deleted_at'],
});
const variantPolicy=Object.freeze({
  entity:'product_variants',
  allowedFilters:['product_id','status','sku_code'],
  allowedSort:['sort_order','created_at','sku_code','price','stock_quantity'],
  allowedWrite:['product_id','sku_code','options','price','currency','stock_quantity','sort_order','status','deleted_at'],
});

export function createMerchantCatalogService({dataCore,clock=()=>new Date()}={}){
  if(typeof dataCore?.repository!=='function')fail('MISSING_MERCHANT_DATA_CORE');
  const products=dataCore.repository(productPolicy);
  const categories=dataCore.repository(categoryPolicy);
  const variants=dataCore.repository(variantPolicy);
  return{
    async listProducts(input={}){
      return products.list({page:input.page,pageSize:input.pageSize,filters:compact({search:optional(input.search),status:optional(input.status),category_id:optional(input.categoryId)}),sort:input.sort});
    },
    async createProduct(input={}){
      return products.create({name:required(input.name,'MISSING_PRODUCT_NAME'),price:nonNegative(input.price,'INVALID_PRODUCT_PRICE'),stock:nonNegative(input.stock??0,'INVALID_PRODUCT_STOCK'),currency:required(input.currency??'JPY','MISSING_CURRENCY').toUpperCase(),status:input.status??'draft'});
    },
    async updateProduct(input={}){
      const data=compact({name:input.name===undefined?undefined:required(input.name,'MISSING_PRODUCT_NAME'),description:input.description,short_description:input.shortDescription,price:input.price===undefined?undefined:nonNegative(input.price,'INVALID_PRODUCT_PRICE'),currency:input.currency===undefined?undefined:required(input.currency,'MISSING_CURRENCY').toUpperCase(),stock:input.stock===undefined?undefined:nonNegative(input.stock,'INVALID_PRODUCT_STOCK'),category_id:input.categoryId,featured:input.featured,status:optional(input.status)});
      return products.updateById(required(input.productId,'MISSING_PRODUCT_ID'),data);
    },
    async setProductStock({productId,stock}={}){
      return products.updateById(required(productId,'MISSING_PRODUCT_ID'),{stock:nonNegative(stock,'INVALID_PRODUCT_STOCK')});
    },
    async setProductVisibility({productId,visible}={}){
      if(typeof visible!=='boolean')fail('INVALID_PRODUCT_VISIBILITY');
      return products.updateById(required(productId,'MISSING_PRODUCT_ID'),{status:visible?'active':'draft'});
    },
    async archiveProduct({productId}={}){
      return products.updateById(required(productId,'MISSING_PRODUCT_ID'),{status:'archived',deleted_at:clock().toISOString()});
    },
    async reorderProducts({items}={}){
      if(!Array.isArray(items)||!items.length)fail('MISSING_PRODUCT_ORDER');
      const normalized=items.map(item=>({productId:required(item?.productId,'MISSING_PRODUCT_ID'),sortOrder:nonNegative(item?.sortOrder,'INVALID_SORT_ORDER')}));
      if(new Set(normalized.map(item=>item.productId)).size!==normalized.length)fail('DUPLICATE_PRODUCT_ID');
      if(typeof dataCore.transaction!=='function')fail('MISSING_TRANSACTION');
      return dataCore.transaction(async transactionCore=>{
        const repository=transactionCore.repository(productPolicy);
        return Promise.all(normalized.map(item=>repository.updateById(item.productId,{sort_order:item.sortOrder})));
      });
    },
    async listCategories(input={}){
      return categories.list({page:input.page,pageSize:input.pageSize,filters:compact({search:optional(input.search),status:optional(input.status)}),sort:input.sort});
    },
    async createCategory(input={}){
      return categories.create({name:required(input.name,'MISSING_CATEGORY_NAME'),slug:required(input.slug,'MISSING_CATEGORY_SLUG'),status:input.status??'draft'});
    },
    async updateCategory(input={}){
      const data=compact({name:input.name===undefined?undefined:required(input.name,'MISSING_CATEGORY_NAME'),slug:input.slug===undefined?undefined:required(input.slug,'MISSING_CATEGORY_SLUG'),description:input.description,status:optional(input.status)});
      return categories.updateById(required(input.categoryId,'MISSING_CATEGORY_ID'),data);
    },
    async setCategoryVisibility({categoryId,visible}={}){
      if(typeof visible!=='boolean')fail('INVALID_CATEGORY_VISIBILITY');
      return categories.updateById(required(categoryId,'MISSING_CATEGORY_ID'),{status:visible?'active':'draft'});
    },
    async archiveCategory({categoryId}={}){
      return categories.updateById(required(categoryId,'MISSING_CATEGORY_ID'),{status:'archived',deleted_at:clock().toISOString()});
    },
    async createVariant(input={}){
      return variants.create({product_id:required(input.productId,'MISSING_PRODUCT_ID'),sku_code:required(input.skuCode,'MISSING_SKU_CODE'),options:input.options??{},price:nonNegative(input.price,'INVALID_VARIANT_PRICE'),stock_quantity:nonNegative(input.stock??0,'INVALID_VARIANT_STOCK'),currency:required(input.currency??'JPY','MISSING_CURRENCY').toUpperCase(),status:input.status??'active'});
    },
    async updateVariant(input={}){
      const data=compact({price:input.price===undefined?undefined:nonNegative(input.price,'INVALID_VARIANT_PRICE'),stock_quantity:input.stock===undefined?undefined:nonNegative(input.stock,'INVALID_VARIANT_STOCK'),options:input.options,status:optional(input.status)});
      return variants.updateById(required(input.variantId,'MISSING_VARIANT_ID'),data);
    },
  };
}

export {productPolicy as PRODUCT_POLICY,categoryPolicy as CATEGORY_POLICY,variantPolicy as VARIANT_POLICY};
