import test from 'node:test';
import assert from 'node:assert/strict';
import {createCartService,MEDINANCE_CART_FLOW} from '../src/cart-core.mjs';
import {createLocalStorageCartStore} from '../adapters/local-storage.mjs';

function fixture(){
  let saved=[];
  const store={async load(){return structuredClone(saved)},async save({items}){saved=structuredClone(items);return structuredClone(saved)},async clear(){saved=[]}};
  const catalog={async resolvePurchasableItem({productId,variantId}){return{id:productId,variantId:variantId??null,name:'Tea',skuCode:variantId?'SKU-M':null,unitPrice:1200,currency:'JPY',availableStock:5,status:'active',imageUrl:'/tea.webp'}}};
  return{store,catalog,getSaved:()=>saved};
}

test('adding the same product and SKU merges quantity and uses catalog price',async()=>{
  const {store,catalog}=fixture();
  const cart=createCartService({store,catalog,projectId:'shop',sellerId:'seller',cartId:'guest-1'});
  await cart.addItem({productId:'p1',variantId:'v1',quantity:2,unitPrice:1});
  const result=await cart.addItem({productId:'p1',variantId:'v1',quantity:1,unitPrice:1});
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].quantity,3);
  assert.equal(result.items[0].unitPrice,1200);
  assert.equal(result.subtotal,3600);
});

test('quantity update, removal, and checkout snapshot stay server-revalidated',async()=>{
  const {store,catalog}=fixture();
  const cart=createCartService({store,catalog,projectId:'shop',sellerId:'seller',cartId:'guest-2',pricing:{shipping:()=>500,discount:()=>200,tax:()=>100}});
  await cart.addItem({productId:'p1',quantity:2});
  const updated=await cart.updateQuantity({productId:'p1',quantity:3});
  assert.equal(updated.subtotal,3600);
  const snapshot=await cart.createCheckoutSnapshot();
  assert.deepEqual({subtotal:snapshot.subtotal,shipping:snapshot.shipping,discount:snapshot.discount,tax:snapshot.tax,total:snapshot.total},{subtotal:3600,shipping:500,discount:200,tax:100,total:4000});
  const empty=await cart.removeItem({productId:'p1'});
  assert.equal(empty.itemCount,0);
  await assert.rejects(()=>cart.createCheckoutSnapshot(),/EMPTY_CART/);
});

test('local storage adapter persists only product, variant, and quantity',async()=>{
  const memory=new Map();
  const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
  const store=createLocalStorageCartStore({storage,keyPrefix:'buyna-cart'});
  const scope={projectId:'shop',sellerId:'seller',cartId:'guest'};
  await store.save({scope,items:[{productId:'p1',variantId:'v1',quantity:2,unitPrice:1,name:'untrusted'}]});
  assert.deepEqual(await store.load({scope}),[{productId:'p1',variantId:'v1',quantity:2}]);
  assert.doesNotMatch([...memory.values()][0],/unitPrice|untrusted/);
});

test('MEDINANCE defaults limit quantity and cart lines',async()=>{
  const {store,catalog}=fixture();
  const cart=createCartService({store,catalog,projectId:'shop',sellerId:'seller',cartId:'medinance-default'});
  await assert.rejects(()=>cart.addItem({productId:'p1',quantity:11}),/INVALID_CART_QUANTITY/);
  for(let index=1;index<=20;index++)await cart.addItem({productId:`p${index}`,quantity:1});
  await assert.rejects(()=>cart.addItem({productId:'p21',quantity:1}),/CART_LINE_LIMIT_EXCEEDED/);
});

test('cart clears only after verified payment or explicit reset',async()=>{
  const {store,catalog}=fixture();
  const cart=createCartService({store,catalog,projectId:'shop',sellerId:'seller',cartId:'clear-gate'});
  await cart.addItem({productId:'p1',quantity:1});
  await assert.rejects(()=>cart.clearCart({reason:'payment_redirect'}),/CART_CLEAR_NOT_ALLOWED/);
  assert.equal((await cart.getCart()).itemCount,1);
  await cart.clearCart({reason:'verified_payment'});
  assert.equal((await cart.getCart()).itemCount,0);
});

test('the fixed storefront flow matches the MEDINANCE cart sequence',()=>{
  assert.equal(MEDINANCE_CART_FLOW.presentation,'right_drawer');
  assert.deepEqual(MEDINANCE_CART_FLOW.steps,['cart','buyer_form','order_review','provider_payment','server_verified_result']);
  assert.equal(MEDINANCE_CART_FLOW.checkoutMode,'all_items_once');
});
