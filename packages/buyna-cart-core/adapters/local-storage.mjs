function required(value,code){const text=String(value??'').trim();if(!text){const error=new Error(code);error.code=code;throw error}return text}
function storageKey(prefix,scope){return`${prefix}:${required(scope?.projectId,'MISSING_PROJECT_ID')}:${required(scope?.sellerId,'MISSING_SELLER_ID')}:${required(scope?.cartId,'MISSING_CART_ID')}`}
function safeItems(items){return(Array.isArray(items)?items:[]).map(item=>({productId:required(item.productId,'MISSING_PRODUCT_ID'),variantId:item.variantId?required(item.variantId,'INVALID_VARIANT_ID'):null,quantity:Number(item.quantity)}))}

export function createLocalStorageCartStore({storage=globalThis.localStorage,keyPrefix='buyna-cart'}={}){
  if(!storage||typeof storage.getItem!=='function'||typeof storage.setItem!=='function')throw new Error('MISSING_LOCAL_STORAGE');
  return{
    async load({scope}={}){
      const raw=storage.getItem(storageKey(keyPrefix,scope));
      if(!raw)return[];
      try{return safeItems(JSON.parse(raw))}catch{return[]}
    },
    async save({scope,items}={}){
      const safe=safeItems(items);
      storage.setItem(storageKey(keyPrefix,scope),JSON.stringify(safe));
      return safe;
    },
    async clear({scope}={}){storage.removeItem?.(storageKey(keyPrefix,scope))},
  };
}
