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

export function createCheckoutFlow({projectId,sellerId,cart,orders,submissions,policy={}}={}){
  const scope=Object.freeze({projectId:required(projectId,'MISSING_PROJECT_ID'),sellerId:required(sellerId,'MISSING_SELLER_ID')});
  const minimumFields=normalizeNames(policy.minimumFields);
  const paymentMethods=normalizeNames(policy.paymentMethods);

  function validateDraft(input={}){
    const fields=normalizeFields(input.fields);
    if(minimumFields.some(key=>!fields[key]))fail('CHECKOUT_MINIMUM_FIELDS_MISSING');
    const paymentMethod=String(input.paymentMethod??'').trim();
    if(sensitive.test(paymentMethod))fail('CHECKOUT_SENSITIVE_FIELD');
    if(!paymentMethod||!paymentMethods.includes(paymentMethod))fail('CHECKOUT_PAYMENT_METHOD_REQUIRED');
    return{state:CHECKOUT_STATES.MINIMUM_VALID,...scope,fields,paymentMethod};
  }

  return{
    validateDraft,
    createReview(input={}){return{...validateDraft(input),state:CHECKOUT_STATES.REVIEW}},
    async submit(input={}){
      const draft=validateDraft(input);
      const idempotencyKey=required(input.idempotencyKey,'MISSING_IDEMPOTENCY_KEY');
      method(cart,'createCheckoutSnapshot');
      method(orders,'createPendingOrder');
      method(submissions,'claim');
      method(submissions,'saveResult');
      const claim=await submissions.claim({...scope,idempotencyKey});
      if(!claim?.claimed)return claim?.result??fail('CHECKOUT_SUBMISSION_CLAIM_CONFLICT');
      const checkoutSnapshot=freezeSnapshot(await cart.createCheckoutSnapshot({...scope}));
      const order=await orders.createPendingOrder({...scope,checkoutSnapshot,paymentMethod:draft.paymentMethod,fields:draft.fields});
      const orderId=required(order?.id,'MISSING_PENDING_ORDER_ID');
      const result={
        state:CHECKOUT_STATES.ORDER_LOCKED,
        ...scope,
        order:{id:orderId,status:'pending_payment'},
        providerRequest:{orderId,paymentMethod:draft.paymentMethod,amount:Number(checkoutSnapshot.total),currency:String(checkoutSnapshot.currency??'').toUpperCase()},
      };
      await submissions.saveResult({...scope,idempotencyKey,result});
      return result;
    },
  };
}
