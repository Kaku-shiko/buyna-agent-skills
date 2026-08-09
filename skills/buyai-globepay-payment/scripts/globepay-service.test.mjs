import test from 'node:test';
import assert from 'node:assert/strict';
import {createGlobepayService} from './globepay-service.mjs';

test('checkout persists a pending order before calling GlobePay and then attaches the provider order',async()=>{
  const calls=[];
  const store={
    async createPendingOrder(input){calls.push(['pending',input.status]);return{id:'local-1',...input}},
    async attachProviderOrder(input){calls.push(['attach',input.providerOrderId]);return{...input,status:'pending_payment'}},
  };
  const provider={
    async createOrder(input){calls.push(['provider',input.localOrder.id]);return{providerOrderId:'GP-1',nextAction:{type:'redirect',url:'https://pay.example/GP-1'}}},
  };
  const service=createGlobepayService({store,provider});

  const result=await service.createCheckout({
    sellerId:'seller-1',merchantOrderId:'ORDER-1',amount:1200,currency:'JPY',
    paymentMethod:'wechat',context:'mobile',buyer:{email:'buyer@example.com'},items:[{sku:'SKU-1',quantity:1}],
  });

  assert.deepEqual(calls.map(item=>item[0]),['pending','provider','attach']);
  assert.equal(result.status,'pending_payment');
  assert.equal(result.providerOrderId,'GP-1');
  assert.equal(result.nextAction.type,'redirect');
});

test('verified notification applies one idempotent payment transition inside a transaction',async()=>{
  const calls=[];
  const order={id:'local-1',sellerId:'seller-1',status:'pending_payment'};
  const store={
    async withTransaction(work){calls.push('transaction');return work({
      async getOrderByProviderId(){calls.push('find');return order},
      async claimPaymentEvent(){calls.push('claim');return true},
      async applyPaymentTransition(input){calls.push(['apply',input.nextStatus,...input.effects]);order.status=input.nextStatus},
      async getOrderById(){calls.push('read');return{...order}},
    })},
  };
  const provider={
    async verifyNotification(){calls.push('verify');return{providerOrderId:'GP-1',resultCode:'PAY_SUCCESS',payload:{result_code:'PAY_SUCCESS'}}},
  };
  const service=createGlobepayService({store,provider});

  const result=await service.syncPaymentStatus({sellerId:'seller-1',eventType:'notify',payload:{signed:'provider-payload'}});

  assert.deepEqual(calls.slice(0,4),['verify','transaction','find','claim']);
  assert.deepEqual(calls[4],['apply','paid','upsert_payment','upsert_paid_record','apply_inventory_once']);
  assert.equal(calls[5],'read');
  assert.equal(result.order.status,'paid');
  assert.equal(result.applied,true);
});

test('a duplicate provider event is read safely without applying payment effects twice',async()=>{
  let applied=0;
  const store={async withTransaction(work){return work({
    async getOrderByProviderId(input){assert.equal(input.sellerId,'seller-1');return{id:'local-1',status:'paid'}},
    async claimPaymentEvent(){return false},
    async applyPaymentTransition(){applied+=1},
    async getOrderById(input){assert.equal(input.sellerId,'seller-1');return{id:'local-1',status:'paid'}},
  })}};
  const provider={async queryOrder(){return{providerOrderId:'GP-1',resultCode:'PAY_SUCCESS',payload:{result_code:'PAY_SUCCESS'}}}};
  const service=createGlobepayService({store,provider});

  const result=await service.syncPaymentStatus({sellerId:'seller-1',eventType:'query',providerOrderId:'GP-1'});

  assert.equal(result.applied,false);
  assert.equal(applied,0);
  assert.equal(result.order.status,'paid');
});

test('provider creation failure happens only after the pending order is persisted',async()=>{
  const calls=[];
  const store={
    async createPendingOrder(input){calls.push(['pending',input.status]);return{id:'local-1',...input}},
    async attachProviderOrder(){calls.push('attach')},
  };
  const provider={async createOrder(){calls.push('provider');throw new Error('PROVIDER_UNAVAILABLE')}};
  const service=createGlobepayService({store,provider});

  await assert.rejects(()=>service.createCheckout({sellerId:'seller-1',merchantOrderId:'ORDER-1',amount:1200,currency:'JPY',paymentMethod:'card'}),/PROVIDER_UNAVAILABLE/);
  assert.deepEqual(calls,[['pending','pending_payment'],'provider']);
});
