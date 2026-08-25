import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckoutFlow} from '../src/index.mjs';

function createFlow(){
  return createCheckoutFlow({
    projectId:'project-1',
    sellerId:'seller-1',
    cart:{},
    orders:{},
    submissions:{},
    policy:{
      minimumFields:['buyer_name','email'],
      paymentMethods:['wechat','alipay'],
    },
  });
}

test('draft validation requires configured minimum fields and one approved payment method',()=>{
  const flow=createFlow();

  assert.throws(
    ()=>flow.validateDraft({fields:{buyer_name:'Ada',email:''},paymentMethod:'wechat'}),
    error=>error.code==='CHECKOUT_MINIMUM_FIELDS_MISSING',
  );
  for(const field of ['card_number','cvv','token']){
    assert.throws(
      ()=>flow.validateDraft({fields:{buyer_name:'Ada',email:'ada@example.test',[field]:'sensitive'},paymentMethod:'wechat'}),
      error=>error.code==='CHECKOUT_SENSITIVE_FIELD',
    );
  }
  assert.throws(
    ()=>flow.validateDraft({fields:{buyer_name:'Ada',email:'ada@example.test',notes:''}}),
    error=>error.code==='CHECKOUT_PAYMENT_METHOD_REQUIRED',
  );

  assert.deepEqual(
    flow.validateDraft({fields:{buyer_name:'Ada',email:'ada@example.test',notes:''},paymentMethod:'wechat'}),
    {
      state:'minimum_valid',
      projectId:'project-1',
      sellerId:'seller-1',
      fields:{buyer_name:'Ada',email:'ada@example.test',notes:''},
      paymentMethod:'wechat',
    },
  );
});

test('submit locks one pending order and returns one idempotent provider request without provider access',async()=>{
  const calls=[];
  const checkout={
    items:[{productId:'tea-1',quantity:1,unitPrice:1200,lineTotal:1200}],
    subtotal:1200,
    shipping:0,
    discount:0,
    tax:0,
    total:1200,
    currency:'JPY',
  };
  const savedResults=new Map();
  const flow=createCheckoutFlow({
    projectId:'project-1',
    sellerId:'seller-1',
    cart:{
      async createCheckoutSnapshot({projectId,sellerId}){
        calls.push(['snapshot',projectId,sellerId]);
        return structuredClone(checkout);
      },
    },
    orders:{
      async createPendingOrder({projectId,sellerId,checkoutSnapshot,paymentMethod}){
        calls.push(['order',projectId,sellerId,checkoutSnapshot,paymentMethod]);
        assert.equal(Object.isFrozen(checkoutSnapshot),true);
        assert.equal(Object.isFrozen(checkoutSnapshot.items),true);
        return{id:'order-1',status:'pending_payment'};
      },
    },
    submissions:{
      async claim({projectId,sellerId,idempotencyKey}){
        calls.push(['claim',projectId,sellerId,idempotencyKey]);
        return savedResults.has(idempotencyKey)?{claimed:false,result:savedResults.get(idempotencyKey)}:{claimed:true};
      },
      async saveResult({idempotencyKey,result}){
        calls.push(['save',idempotencyKey,result]);
        savedResults.set(idempotencyKey,result);
      },
    },
    policy:{minimumFields:['buyer_name'],paymentMethods:['wechat']},
  });
  const input={fields:{buyer_name:'Ada'},paymentMethod:'wechat',idempotencyKey:'checkout-1'};

  const first=await flow.submit(input);
  const second=await flow.submit(input);

  assert.deepEqual(first,{
    state:'order_locked',
    projectId:'project-1',
    sellerId:'seller-1',
    order:{id:'order-1',status:'pending_payment'},
    providerRequest:{orderId:'order-1',paymentMethod:'wechat',amount:1200,currency:'JPY'},
  });
  assert.deepEqual(second,first);
  assert.deepEqual(calls.map(call=>call[0]),['claim','snapshot','order','save','claim']);
  assert.equal(calls.filter(call=>call[0]==='snapshot').length,1);
  assert.equal(calls.filter(call=>call[0]==='order').length,1);
  assert.equal(calls.filter(call=>call[0]==='save').length,1);
});
