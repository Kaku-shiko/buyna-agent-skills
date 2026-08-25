import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckoutFlow} from '../src/index.mjs';

function createReviewStateAdapter(records=new Map()){
  const key=({projectId,sellerId,reviewToken})=>`${projectId}:${sellerId}:${reviewToken}`;
  return{
    records,
    async create({scope,review}){records.set(key({...scope,reviewToken:review.reviewToken}),structuredClone(review));return structuredClone(review)},
    async get({scope,reviewToken}){const review=records.get(key({...scope,reviewToken}));return review&&structuredClone(review)},
    async update({scope,reviewToken,patch}){
      const record=records.get(key({...scope,reviewToken}));
      if(!record)return null;
      Object.assign(record,structuredClone(patch));
      return structuredClone(record);
    },
  };
}

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

test('a durable review binds server-owned submission identity across core instances',async()=>{
  const reviews=createReviewStateAdapter();
  const orderCalls=[];
  const options={
    projectId:'project-1',sellerId:'seller-1',reviewState:reviews,
    cart:{async createCheckoutSnapshot(){return{total:1200,currency:'JPY'}}},
    orders:{async createPendingOrder(input){orderCalls.push(input);return{id:'order-1',status:'pending_payment'}}},
    submissions:{async acquire(){return{status:'acquired',attemptToken:'attempt-1'}},async complete(){},async release(){}},
    policy:{minimumFields:['buyer_name'],paymentMethods:['wechat'],supportedCurrencies:['JPY']},
  };
  const first=createCheckoutFlow(options);
  const second=createCheckoutFlow(options);
  const review=await first.createReview({fields:{buyer_name:'Ada'},paymentMethod:'wechat',idempotencyKey:'caller-controlled'});
  const result=await second.submit({reviewToken:review.reviewToken,idempotencyKey:'attacker-controlled'});
  const stored=[...reviews.records.values()][0];

  assert.equal(result.order.id,'order-1');
  assert.equal(review.idempotencyKey,undefined);
  assert.notEqual(stored.submissionId,'caller-controlled');
  assert.equal(orderCalls[0].idempotencyKey,stored.submissionId);
});

test('submit requires a current review token and preserves it after a failed attempt',async()=>{
  const flow=createCheckoutFlow({
    projectId:'project-1',sellerId:'seller-1',
    reviewState:createReviewStateAdapter(),
    cart:{async createCheckoutSnapshot(){throw Object.assign(new Error('temporary'),{code:'TEMPORARY_CART_FAILURE'})}},
    orders:{async createPendingOrder(){}},
    submissions:{
      async acquire(){return{status:'acquired',attemptToken:'attempt-1'}},
      async release(){},
      async complete(){},
    },
    policy:{minimumFields:['buyer_name'],paymentMethods:['wechat']},
  });
  const input={fields:{buyer_name:'Ada'},paymentMethod:'wechat',idempotencyKey:'checkout-1'};

  await assert.rejects(()=>flow.submit(input),error=>error.code==='CHECKOUT_REVIEW_REQUIRED');
  const review=await flow.createReview(input);
  await assert.rejects(
    ()=>flow.submit({...input,reviewToken:review.reviewToken}),
    error=>error.code==='TEMPORARY_CART_FAILURE'&&error.checkoutState==='failed',
  );
  assert.equal((await flow.getReviewState({reviewToken:review.reviewToken})).state,'review');
});

test('submit rejects invalid server-derived provider money before creating an order',async()=>{
  for(const {checkout,code} of [
    {checkout:{currency:'JPY'},code:'CHECKOUT_PROVIDER_AMOUNT_INVALID'},
    {checkout:{total:-1,currency:'JPY'},code:'CHECKOUT_PROVIDER_AMOUNT_INVALID'},
    {checkout:{total:12.5,currency:'JPY'},code:'CHECKOUT_PROVIDER_AMOUNT_INVALID'},
    {checkout:{total:Number.MAX_SAFE_INTEGER+1,currency:'JPY'},code:'CHECKOUT_PROVIDER_AMOUNT_INVALID'},
    {checkout:{total:1200},code:'CHECKOUT_PROVIDER_CURRENCY_INVALID'},
    {checkout:{total:1200,currency:'USD'},code:'CHECKOUT_PROVIDER_CURRENCY_INVALID'},
  ]){
    let orderCalls=0;
    const flow=createCheckoutFlow({
      projectId:'project-1',sellerId:'seller-1',
      reviewState:createReviewStateAdapter(),
      cart:{async createCheckoutSnapshot(){return checkout}},
      orders:{async createPendingOrder(){orderCalls++}},
      submissions:{
        async acquire(){return{status:'acquired',attemptToken:'attempt-1'}},
        async complete(){},
        async release(){},
      },
      policy:{minimumFields:['buyer_name'],paymentMethods:['wechat'],supportedCurrencies:['JPY']},
    });
    const input={fields:{buyer_name:'Ada'},paymentMethod:'wechat',idempotencyKey:`invalid-${code}-${String(checkout.total)}`};
    const review=await flow.createReview(input);
    await assert.rejects(()=>flow.submit({...input,reviewToken:review.reviewToken}),error=>error.code===code);
    assert.equal(orderCalls,0);
  }
});

test('currency policy and server snapshot accept only explicit ISO-like supported currencies',async()=>{
  const base={projectId:'project-1',sellerId:'seller-1',cart:{},orders:{},submissions:{},reviewState:createReviewStateAdapter(),policy:{minimumFields:[],paymentMethods:['wechat']}};
  for(const supportedCurrencies of [['?'],['123'],['USDD']]){
    assert.throws(
      ()=>createCheckoutFlow({...base,policy:{...base.policy,supportedCurrencies}}),
      error=>error.code==='CHECKOUT_CURRENCY_POLICY_INVALID',
    );
  }
  for(const currency of ['?','123','USDD']){
    const flow=createCheckoutFlow({
      ...base,
      cart:{async createCheckoutSnapshot(){return{total:1200,currency}}},
      orders:{async createPendingOrder(){throw new Error('order must not be created')}},
      submissions:{async acquire(){return{status:'acquired',attemptToken:'attempt-1'}},async complete(){},async release(){}},
      policy:{...base.policy,supportedCurrencies:['JPY']},
    });
    const review=await flow.createReview({fields:{},paymentMethod:'wechat'});
    await assert.rejects(()=>flow.submit({reviewToken:review.reviewToken}),error=>error.code==='CHECKOUT_PROVIDER_CURRENCY_INVALID');
  }
});

test('retry after completion failure releases its lease and completes the original single order',async()=>{
  let snapshotCalls=0;
  let orderCalls=0;
  let completionCalls=0;
  const released=[];
  const flow=createCheckoutFlow({
    projectId:'project-1',sellerId:'seller-1',
    reviewState:createReviewStateAdapter(),
    cart:{async createCheckoutSnapshot(){snapshotCalls++;return{total:1200,currency:'JPY'}}},
    orders:{async createPendingOrder(){orderCalls++;return{id:`order-${orderCalls}`,status:'pending_payment'}}},
    submissions:{
      async acquire(){return{status:'acquired',attemptToken:`attempt-${completionCalls+1}`}},
      async complete(){
        completionCalls++;
        if(completionCalls===1)throw Object.assign(new Error('temporary'),{code:'TRANSIENT_COMPLETE_FAILURE'});
      },
      async release(input){released.push(input)},
    },
    policy:{minimumFields:['buyer_name'],paymentMethods:['wechat'],supportedCurrencies:['JPY']},
  });
  const input={fields:{buyer_name:'Ada'},paymentMethod:'wechat',idempotencyKey:'retry-complete'};
  const review=await flow.createReview(input);

  await assert.rejects(()=>flow.submit({...input,reviewToken:review.reviewToken}),error=>error.code==='TRANSIENT_COMPLETE_FAILURE'&&error.checkoutState==='failed');
  const result=await flow.submit({...input,reviewToken:review.reviewToken});

  assert.equal(result.order.id,'order-1');
  assert.equal(snapshotCalls,1);
  assert.equal(orderCalls,1);
  assert.equal(completionCalls,2);
  assert.deepEqual(released.map(input=>input.attemptToken),['attempt-1']);
});

test('concurrent cross-instance submits of one review ignore caller keys and create one order',async()=>{
  let resolveSnapshot;
  let snapshotStarted;
  const snapshotGate=new Promise(resolve=>{resolveSnapshot=resolve});
  const started=new Promise(resolve=>{snapshotStarted=resolve});
  let held=false;
  let orderCalls=0;
  const submissions={
    async acquire(){
      if(held)return{status:'in_progress'};
      held=true;
      return{status:'acquired',attemptToken:'attempt-1'};
    },
    async complete(){},
    async release(){},
  };
  const options={
    projectId:'project-1',sellerId:'seller-1',
    reviewState:createReviewStateAdapter(),
    cart:{async createCheckoutSnapshot(){snapshotStarted();await snapshotGate;return{total:1200,currency:'JPY'}}},
    orders:{async createPendingOrder(){orderCalls++;return{id:'order-1',status:'pending_payment'}}},
    submissions,
    policy:{minimumFields:['buyer_name'],paymentMethods:['wechat'],supportedCurrencies:['JPY']},
  };
  const firstFlow=createCheckoutFlow(options);
  const secondFlow=createCheckoutFlow(options);
  const input={fields:{buyer_name:'Ada'},paymentMethod:'wechat',idempotencyKey:'create-review-only'};
  const firstReview=await firstFlow.createReview(input);

  const first=firstFlow.submit({reviewToken:firstReview.reviewToken,idempotencyKey:'caller-one'});
  await started;
  await assert.rejects(
    ()=>secondFlow.submit({reviewToken:firstReview.reviewToken,idempotencyKey:'caller-two'}),
    error=>error.code==='CHECKOUT_SUBMISSION_IN_PROGRESS',
  );
  resolveSnapshot();
  await first;
  assert.equal(orderCalls,1);
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
    reviewState:createReviewStateAdapter(),
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
      async acquire({projectId,sellerId,idempotencyKey}){
        calls.push(['acquire',projectId,sellerId,idempotencyKey]);
        return savedResults.has(idempotencyKey)?{status:'completed',result:savedResults.get(idempotencyKey)}:{status:'acquired',attemptToken:'attempt-1'};
      },
      async complete({idempotencyKey,result}){
        calls.push(['complete',idempotencyKey,result]);
        savedResults.set(idempotencyKey,result);
      },
      async release(){calls.push(['release'])},
    },
    policy:{minimumFields:['buyer_name'],paymentMethods:['wechat']},
  });
  const input={fields:{buyer_name:'Ada'},paymentMethod:'wechat',idempotencyKey:'checkout-1'};
  const review=await flow.createReview(input);

  const first=await flow.submit({...input,reviewToken:review.reviewToken});
  const second=await flow.submit({...input,reviewToken:review.reviewToken});

  assert.deepEqual(first,{
    state:'order_locked',
    projectId:'project-1',
    sellerId:'seller-1',
    order:{id:'order-1',status:'pending_payment'},
    providerRequest:{orderId:'order-1',paymentMethod:'wechat',amount:1200,currency:'JPY'},
  });
  assert.deepEqual(second,first);
  assert.deepEqual(calls.map(call=>call[0]),['acquire','snapshot','order','complete','acquire']);
  assert.equal(calls.filter(call=>call[0]==='snapshot').length,1);
  assert.equal(calls.filter(call=>call[0]==='order').length,1);
  assert.equal(calls.filter(call=>call[0]==='complete').length,1);
});
