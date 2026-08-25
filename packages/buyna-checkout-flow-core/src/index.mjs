import {randomUUID} from 'node:crypto';

function fail(code){const error=new Error(code);error.code=code;throw error}
function required(value,code){const text=String(value??'').trim();if(!text)fail(code);return text}
function method(owner,name){if(typeof owner?.[name]!=='function')fail(`MISSING_ADAPTER_${name.toUpperCase()}`)}
const sensitive=/(card[\s_-]?number|cvv|cvc|token)/i;

export const CHECKOUT_STATES=Object.freeze({
  DRAFT:'draft',
  MINIMUM_VALID:'minimum_valid',
  REVIEW:'review',
  SUBMITTING:'submitting',
  ORDER_LOCKED:'order_locked',
  REDIRECTING:'redirecting',
  FAILED:'failed',
});

function normalizeNames(values){
  if(!Array.isArray(values))return[];
  return[...new Set(values.map(value=>String(value??'').trim()).filter(Boolean))];
}

function normalizeCurrencies(values){
  const currencies=normalizeNames(values).map(value=>value.toUpperCase());
  return currencies.length?currencies:['JPY'];
}

function normalizeFields(values){
  if(!values||typeof values!=='object'||Array.isArray(values))return{};
  const fields={};
  for(const [key,value] of Object.entries(values)){
    const name=String(key).trim();
    if(sensitive.test(name))fail('CHECKOUT_SENSITIVE_FIELD');
    if(name)fields[name]=typeof value==='string'?value.trim():String(value??'').trim();
  }
  return fields;
}

function freezeSnapshot(snapshot){
  const copy=structuredClone(snapshot);
  const freeze=value=>{
    if(value&&typeof value==='object'&&!Object.isFrozen(value)){
      for(const child of Object.values(value))freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  return freeze(copy);
}

function providerMoney(checkoutSnapshot,supportedCurrencies){
  const amount=Number(checkoutSnapshot?.total);
  if(!Number.isSafeInteger(amount)||amount<1)fail('CHECKOUT_PROVIDER_AMOUNT_INVALID');
  const currency=String(checkoutSnapshot?.currency??'').trim().toUpperCase();
  if(!currency||!supportedCurrencies.includes(currency))fail('CHECKOUT_PROVIDER_CURRENCY_INVALID');
  return{amount,currency};
}

function createProviderRequest({orderId,paymentMethod,money}){
  return{orderId,paymentMethod,amount:money.amount,currency:money.currency};
}

export function createCheckoutFlow({projectId,sellerId,cart,orders,submissions,policy={}}={}){
  const scope=Object.freeze({projectId:required(projectId,'MISSING_PROJECT_ID'),sellerId:required(sellerId,'MISSING_SELLER_ID')});
  const minimumFields=normalizeNames(policy.minimumFields);
  const paymentMethods=normalizeNames(policy.paymentMethods);
  const supportedCurrencies=normalizeCurrencies(policy.supportedCurrencies);
  const reviews=new Map();

  function validateDraft(input={}){
    const fields=normalizeFields(input.fields);
    if(minimumFields.some(key=>!fields[key]))fail('CHECKOUT_MINIMUM_FIELDS_MISSING');
    const paymentMethod=String(input.paymentMethod??'').trim();
    if(sensitive.test(paymentMethod))fail('CHECKOUT_SENSITIVE_FIELD');
    if(!paymentMethod||!paymentMethods.includes(paymentMethod))fail('CHECKOUT_PAYMENT_METHOD_REQUIRED');
    return{state:CHECKOUT_STATES.MINIMUM_VALID,...scope,fields,paymentMethod};
  }

  function createReview(input={}){
    const review={...validateDraft(input),state:CHECKOUT_STATES.REVIEW,reviewToken:randomUUID()};
    reviews.set(review.reviewToken,review);
    return structuredClone(review);
  }

  function getReviewState({reviewToken}={}){
    const review=reviews.get(required(reviewToken,'CHECKOUT_REVIEW_REQUIRED'));
    if(!review)fail('CHECKOUT_REVIEW_REQUIRED');
    return{state:review.state,reviewToken:review.reviewToken};
  }

  return{
    validateDraft,
    createReview,
    getReviewState,
    /**
     * submissions.acquire returns either {status:'acquired',attemptToken},
     * {status:'completed',result}, or {status:'in_progress'}. The adapter
     * atomically leases one project/seller/idempotency key; complete stores
     * its result for replay and release relinquishes a failed lease. Orders
     * must enforce the supplied idempotencyKey as a persistent unique key.
     */
    async submit(input={}){
      const reviewToken=required(input.reviewToken,'CHECKOUT_REVIEW_REQUIRED');
      const review=reviews.get(reviewToken);
      if(!review||![CHECKOUT_STATES.REVIEW,CHECKOUT_STATES.SUBMITTING,CHECKOUT_STATES.ORDER_LOCKED].includes(review.state))fail('CHECKOUT_REVIEW_REQUIRED');
      const idempotencyKey=required(input.idempotencyKey,'MISSING_IDEMPOTENCY_KEY');
      method(cart,'createCheckoutSnapshot');
      method(orders,'createPendingOrder');
      method(submissions,'acquire');
      method(submissions,'complete');
      method(submissions,'release');
      review.state=CHECKOUT_STATES.SUBMITTING;
      let attemptToken;
      try{
        const claim=await submissions.acquire({...scope,idempotencyKey,reviewToken});
        if(claim?.status==='completed'){
          review.state=CHECKOUT_STATES.ORDER_LOCKED;
          return claim.result??fail('CHECKOUT_SUBMISSION_RESULT_MISSING');
        }
        if(claim?.status==='in_progress')fail('CHECKOUT_SUBMISSION_IN_PROGRESS');
        attemptToken=required(claim?.attemptToken,'CHECKOUT_SUBMISSION_CLAIM_CONFLICT');
        if(review.pendingResult){
          await submissions.complete({...scope,idempotencyKey,attemptToken,result:review.pendingResult});
          review.state=CHECKOUT_STATES.ORDER_LOCKED;
          return review.pendingResult;
        }
        const checkoutSnapshot=freezeSnapshot(await cart.createCheckoutSnapshot({...scope}));
        const money=providerMoney(checkoutSnapshot,supportedCurrencies);
        const order=await orders.createPendingOrder({...scope,idempotencyKey,attemptToken,checkoutSnapshot,paymentMethod:review.paymentMethod,fields:review.fields});
        const orderId=required(order?.id,'MISSING_PENDING_ORDER_ID');
        const result={
          state:CHECKOUT_STATES.ORDER_LOCKED,
          ...scope,
          order:{id:orderId,status:'pending_payment'},
          providerRequest:createProviderRequest({orderId,paymentMethod:review.paymentMethod,money}),
        };
        review.pendingResult=result;
        await submissions.complete({...scope,idempotencyKey,attemptToken,result});
        review.state=CHECKOUT_STATES.ORDER_LOCKED;
        return result;
      }catch(error){
        if(attemptToken)await submissions.release({...scope,idempotencyKey,attemptToken,errorCode:error?.code??'CHECKOUT_SUBMISSION_FAILED'}).catch(()=>{});
        review.state=CHECKOUT_STATES.REVIEW;
        error.checkoutState=CHECKOUT_STATES.FAILED;
        throw error;
      }
    },
  };
}
