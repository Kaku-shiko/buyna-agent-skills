function fail(code){const error=new Error(code);error.code=code;throw error}
function required(value,code){const text=String(value??'').trim();if(!text)fail(code);return text}
function quantity(value,max){const number=Number(value);if(!Number.isInteger(number)||number<1||number>max)fail('INVALID_CART_QUANTITY');return number}
function method(owner,name){if(typeof owner?.[name]!=='function')fail(`MISSING_ADAPTER_${name.toUpperCase()}`)}
function lineKey(productId,variantId){return`${productId}:${variantId??''}`}
function money(value,code){const number=Number(value??0);if(!Number.isSafeInteger(number)||number<0)fail(code);return number}

export const MEDINANCE_CART_FLOW=Object.freeze({
  presentation:'right_drawer',
  steps:Object.freeze(['cart','buyer_form','order_review','provider_payment','server_verified_result']),
  checkoutMode:'all_items_once',
  clearReasons:Object.freeze(['verified_payment','explicit_reset']),
  defaultMaxQuantityPerItem:10,
  defaultMaxLines:20,
});

export function createCartService({store,catalog,projectId,sellerId,cartId,pricing={},policy={}}={}){
  const scope=Object.freeze({projectId:required(projectId,'MISSING_PROJECT_ID'),sellerId:required(sellerId,'MISSING_SELLER_ID'),cartId:required(cartId,'MISSING_CART_ID')});
  method(store,'load');method(store,'save');method(catalog,'resolvePurchasableItem');
  const maxQuantityPerItem=Math.min(Math.max(Number(policy.maxQuantityPerItem)||10,1),99);
  const maxLines=Math.min(Math.max(Number(policy.maxLines)||20,1),100);

  async function resolve(items){
    const lines=[];
    for(const saved of items){
      const product=await catalog.resolvePurchasableItem({scope:{...scope},productId:saved.productId,variantId:saved.variantId??null});
      if(!product||product.status!=='active')fail('CART_ITEM_UNAVAILABLE');
      const count=quantity(saved.quantity,maxQuantityPerItem);
      if(count>Number(product.availableStock))fail('CART_STOCK_EXCEEDED');
      const unitPrice=Number(product.unitPrice);
      if(!Number.isSafeInteger(unitPrice)||unitPrice<0)fail('INVALID_CATALOG_PRICE');
      lines.push({key:lineKey(product.id,product.variantId),productId:product.id,variantId:product.variantId??null,name:product.name,skuCode:product.skuCode??null,imageUrl:product.imageUrl??null,quantity:count,unitPrice,currency:product.currency,lineTotal:unitPrice*count});
    }
    const currencies=new Set(lines.map(line=>line.currency));
    if(currencies.size>1)fail('MIXED_CART_CURRENCY');
    const subtotal=lines.reduce((sum,line)=>sum+line.lineTotal,0);
    return{scope:{...scope},items:lines,subtotal,currency:lines[0]?.currency??null,itemCount:lines.reduce((sum,line)=>sum+line.quantity,0)};
  }

  async function getCart(){return resolve(await store.load({scope:{...scope}})??[])}
  async function persist(items){await store.save({scope:{...scope},items});return getCart()}

  return{
    scope,
    getCart,
    async addItem(input={}){
      const productId=required(input.productId,'MISSING_PRODUCT_ID');
      const variantId=input.variantId?required(input.variantId,'INVALID_VARIANT_ID'):null;
      const addQuantity=quantity(input.quantity??1,maxQuantityPerItem);
      const current=await store.load({scope:{...scope}})??[];
      const key=lineKey(productId,variantId);
      const existing=current.find(item=>lineKey(item.productId,item.variantId??null)===key);
      if(existing)existing.quantity=quantity(Number(existing.quantity)+addQuantity,maxQuantityPerItem);
      else{
        if(current.length>=maxLines)fail('CART_LINE_LIMIT_EXCEEDED');
        current.push({productId,variantId,quantity:addQuantity});
      }
      await resolve(current);
      return persist(current);
    },
    async updateQuantity(input={}){
      const productId=required(input.productId,'MISSING_PRODUCT_ID');
      const variantId=input.variantId?required(input.variantId,'INVALID_VARIANT_ID'):null;
      const current=await store.load({scope:{...scope}})??[];
      const existing=current.find(item=>lineKey(item.productId,item.variantId??null)===lineKey(productId,variantId));
      if(!existing)fail('CART_ITEM_NOT_FOUND');
      existing.quantity=quantity(input.quantity,maxQuantityPerItem);
      await resolve(current);
      return persist(current);
    },
    async removeItem(input={}){
      const productId=required(input.productId,'MISSING_PRODUCT_ID');
      const variantId=input.variantId?required(input.variantId,'INVALID_VARIANT_ID'):null;
      const current=await store.load({scope:{...scope}})??[];
      return persist(current.filter(item=>lineKey(item.productId,item.variantId??null)!==lineKey(productId,variantId)));
    },
    async createCheckoutSnapshot(context={}){
      const cart=await getCart();
      if(!cart.items.length)fail('EMPTY_CART');
      const shipping=money(await pricing.shipping?.(cart,context),'INVALID_SHIPPING_AMOUNT');
      const discount=money(await pricing.discount?.(cart,context),'INVALID_DISCOUNT_AMOUNT');
      const tax=money(await pricing.tax?.(cart,context),'INVALID_TAX_AMOUNT');
      const total=cart.subtotal+shipping+tax-discount;
      if(total<0)fail('INVALID_CART_TOTAL');
      return{...cart,shipping,discount,tax,total,quotedAt:new Date().toISOString()};
    },
    async clearCart({reason}={}){
      if(!['verified_payment','explicit_reset'].includes(reason))fail('CART_CLEAR_NOT_ALLOWED');
      method(store,'clear');
      await store.clear({scope:{...scope},reason});
      return getCart();
    },
  };
}
