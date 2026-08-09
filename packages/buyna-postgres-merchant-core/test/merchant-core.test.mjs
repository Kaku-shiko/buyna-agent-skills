import test from 'node:test';
import assert from 'node:assert/strict';
import {createMerchantDataCore} from '../src/merchant-core.mjs';

test('repository list always supplies project and seller scope with bounded pagination',async()=>{
  let received;
  const adapter={async list(input){received=input;return{rows:[{id:'p1'}],total:1}}};
  const core=createMerchantDataCore({adapter,projectId:'project-a',sellerId:'seller-a'});
  const products=core.repository({entity:'products',allowedFilters:['status'],allowedSort:['created_at']});

  const result=await products.list({page:2,pageSize:500,filters:{status:'active'},sort:{field:'created_at',direction:'desc'}});

  assert.deepEqual(received.scope,{projectId:'project-a',sellerId:'seller-a'});
  assert.equal(received.limit,100);
  assert.equal(received.offset,100);
  assert.deepEqual(result,{items:[{id:'p1'}],page:2,pageSize:100,total:1,totalPages:1});
});

test('repository lookup cannot omit or override merchant scope',async()=>{
  let received;
  const adapter={async getById(input){received=input;return{id:'order-1'}}};
  const core=createMerchantDataCore({adapter,projectId:'project-a',sellerId:'seller-a'});

  const order=await core.repository({entity:'orders'}).getById('order-1');

  assert.deepEqual(received,{entity:'orders',id:'order-1',scope:{projectId:'project-a',sellerId:'seller-a'}});
  assert.equal(order.id,'order-1');
});

test('transaction exposes the same scoped interface through the transaction adapter',async()=>{
  const calls=[];
  const adapter={async transaction(work){calls.push('begin');const result=await work({async getById(input){calls.push(input.scope);return{id:input.id}}});calls.push('commit');return result}};
  const core=createMerchantDataCore({adapter,projectId:'project-a',sellerId:'seller-a'});

  const result=await core.transaction(tx=>tx.repository({entity:'orders'}).getById('order-1'));

  assert.equal(result.id,'order-1');
  assert.deepEqual(calls,['begin',{projectId:'project-a',sellerId:'seller-a'},'commit']);
});

test('idempotency returns the stored result without executing duplicate work',async()=>{
  let workCalls=0;
  const adapter={async transaction(work){return work({
    async claimIdempotency(){return{claimed:false,result:{orderId:'order-1'}}},
    async completeIdempotency(){throw new Error('must not complete duplicate')},
  })}};
  const core=createMerchantDataCore({adapter,projectId:'project-a',sellerId:'seller-a'});

  const result=await core.idempotency.run({key:'event-1',operation:'payment-sync'},async()=>{workCalls+=1});

  assert.deepEqual(result,{applied:false,result:{orderId:'order-1'}});
  assert.equal(workCalls,0);
});

test('repository create supplies server-owned scope and rejects caller-owned fields',async()=>{
  let received;
  const adapter={async create(input){received=input;return{id:'product-1'}}};
  const core=createMerchantDataCore({adapter,projectId:'project-a',sellerId:'seller-a'});
  const products=core.repository({entity:'products',allowedWrite:['name','price']});

  await products.create({name:'Tea',price:1200});
  assert.deepEqual(received,{entity:'products',scope:{projectId:'project-a',sellerId:'seller-a'},data:{name:'Tea',price:1200}});
  await assert.rejects(()=>products.create({name:'Tea',seller_id:'seller-b'}),/WRITE_FIELD_NOT_ALLOWED/);
});
