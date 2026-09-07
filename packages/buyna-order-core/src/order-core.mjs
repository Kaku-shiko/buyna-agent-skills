import {createHash} from 'node:crypto';
function fail(code){const error=new Error(code);error.code=code;throw error}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value}
function fingerprint(value){return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}
function required(value,code){const text=String(value??'').trim();if(!text)fail(code);return text}
function money(value,code){const number=Number(value);if(!Number.isSafeInteger(number)||number<0)fail(code);return number}
function method(owner,name){if(typeof owner?.[name]!=='function')fail(`MISSING_ADAPTER_${name.toUpperCase()}`)}
const paymentMethods=new Set(['wechat','alipay','card']);
const sensitive=/(password|token|secret|card_number|cardnumber|cvv|cvc|expiry|authorization)/i;

function normalizeSubmission(entries,locale,schemaVersion){
  if(!Array.isArray(entries)||!entries.length)fail('MISSING_CUSTOMER_SUBMISSION');
  return entries.map((entry,index)=>{
    const key=required(entry?.key,'MISSING_SUBMISSION_KEY');
    if(sensitive.test(key))fail('SENSITIVE_SUBMISSION_FIELD');
    return{key,label:required(entry.label,'MISSING_SUBMISSION_LABEL'),value:entry.value??'',type:required(entry.type??'text','MISSING_SUBMISSION_TYPE'),order:Number.isInteger(entry.order)?entry.order:index,locale:entry.locale??locale??null,schemaVersion:entry.schemaVersion??schemaVersion??null};
  });
}

function normalizeCheckout(checkout={}){
  if(!Array.isArray(checkout.items)||!checkout.items.length)fail('EMPTY_CHECKOUT');
  const items=checkout.items.map(item=>{
    const quantity=Number(item.quantity),unitPrice=money(item.unitPrice,'INVALID_ITEM_PRICE'),lineTotal=money(item.lineTotal,'INVALID_LINE_TOTAL');
    if(!Number.isInteger(quantity)||quantity<1||unitPrice*quantity!==lineTotal)fail('INVALID_ORDER_ITEM');
    return{productId:required(item.productId,'MISSING_PRODUCT_ID'),variantId:item.variantId??null,name:required(item.name,'MISSING_PRODUCT_NAME'),skuCode:item.skuCode??null,quantity,unitPrice,lineTotal};
  });
  const subtotal=money(checkout.subtotal,'INVALID_SUBTOTAL'),shipping=money(checkout.shipping??0,'INVALID_SHIPPING'),discount=money(checkout.discount??0,'INVALID_DISCOUNT'),tax=money(checkout.tax??0,'INVALID_TAX'),total=money(checkout.total,'INVALID_TOTAL');
  if(items.reduce((sum,item)=>sum+item.lineTotal,0)!==subtotal||subtotal+shipping+tax-discount!==total)fail('ORDER_TOTAL_MISMATCH');
  return{items,subtotal,shipping,discount,tax,total,currency:required(checkout.currency,'MISSING_CURRENCY').toUpperCase()};
}
function optional(value){const text=String(value??'').trim();return text||undefined}
function compact(object){return Object.fromEntries(Object.entries(object).filter(([,value])=>value!==undefined))}
const unpaidStatuses=new Set(['pending_payment','failed','expired','cancelled']);

function csvCell(value){
  let text=String(value??'');
  if(/^[=+\-@]/.test(text))text=`'${text}`;
  return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;
}

export function createOrdersCsv(orders=[]){
  const fields=new Map();
  for(const order of orders)for(const entry of order.submission??[])if(!sensitive.test(String(entry.key??''))&&!fields.has(entry.key))fields.set(entry.key,entry.label??entry.key);
  const fixed=['order_id','status','payment_method','total','currency','created_at'];
  const header=[...fixed,...fields.values()];
  const rows=orders.map(order=>{
    const answers=new Map((order.submission??[]).map(entry=>[entry.key,entry.value]));
    return[order.id,order.status,order.paymentMethod,order.total,order.currency,order.createdAt,...[...fields.keys()].map(key=>answers.get(key)??'')].map(csvCell).join(',');
  });
  return[header.map(csvCell).join(','),...rows].join('\r\n');
}

export function createOrderService({store,projectId,sellerId,idGenerator,clock=()=>new Date()}={}){
  const scope=Object.freeze({projectId:required(projectId,'MISSING_PROJECT_ID'),sellerId:required(sellerId,'MISSING_SELLER_ID')});
  method(store,'transaction');if(typeof idGenerator!=='function')fail('MISSING_ORDER_ID_GENERATOR');
  return{
    scope,
    async createPendingOrder(input={}){
      const key=required(input.idempotencyKey,'MISSING_IDEMPOTENCY_KEY');
      const checkout=normalizeCheckout(input.checkout);
      const paymentMethod=required(input.paymentMethod,'MISSING_PAYMENT_METHOD');
      if(!paymentMethods.has(paymentMethod))fail('INVALID_PAYMENT_METHOD');
      const submission=normalizeSubmission(input.submission,input.locale,input.schemaVersion);
      const request={...scope,paymentMethod,...checkout,submission,expiresAt:input.expiresAt??null};
      const requestFingerprint=fingerprint(request);
      return store.transaction(async tx=>{
        method(tx,'createPendingOrder');method(tx,'claimIdempotency');method(tx,'completeIdempotency');
        const identity={scope:{...scope},key,operation:'create_order'};
        const claim=await tx.claimIdempotency(identity);
        if(claim?.claimed!==true){
          if(!claim?.result)fail('ORDER_CREATION_IN_PROGRESS');
          if(claim.result.fingerprint!==requestFingerprint)fail('ORDER_IDEMPOTENCY_CONFLICT');
          const saved=claim.result.order;
          if(!saved?.id||saved.projectId!==scope.projectId||saved.sellerId!==scope.sellerId)fail('ORDER_CREATION_RESULT_INVALID');
          return structuredClone(saved);
        }
        const order={id:required(idGenerator(),'INVALID_ORDER_ID'),...request,status:'pending_payment',createdAt:clock().toISOString()};
        const created=await tx.createPendingOrder({scope:{...scope},order,idempotencyKey:key});
        const saved=created?.order??created;
        if(!saved?.id||saved.id!==order.id||saved.projectId!==scope.projectId||saved.sellerId!==scope.sellerId)fail('ORDER_CREATION_RESULT_INVALID');
        await tx.completeIdempotency({...identity,result:{fingerprint:requestFingerprint,order:saved}});
        return saved;
      });
    },
    async listOrders(input={}){
      method(store,'listOrders');
      const page=Math.max(Number.parseInt(input.page,10)||1,1),pageSize=Math.min(Math.max(Number.parseInt(input.pageSize,10)||20,1),100);
      return store.listOrders({scope:{...scope},filters:compact({status:optional(input.status),month:optional(input.month),search:optional(input.search),paymentMethod:optional(input.paymentMethod)}),limit:pageSize,offset:(page-1)*pageSize,page,pageSize});
    },
    async getOrderDetail({orderId}={}){
      method(store,'getOrderById');
      const order=await store.getOrderById({scope:{...scope},orderId:required(orderId,'MISSING_ORDER_ID')});
      if(!order)fail('ORDER_NOT_FOUND');
      return order;
    },
    async archiveUnpaidOrder({orderId}={}){
      const id=required(orderId,'MISSING_ORDER_ID');
      return store.transaction(async tx=>{
        method(tx,'getOrderById');method(tx,'archiveOrder');
        const order=await tx.getOrderById({scope:{...scope},orderId:id});
        if(!order)fail('ORDER_NOT_FOUND');
        if(!unpaidStatuses.has(order.status))fail('PAID_ORDER_CANNOT_BE_ARCHIVED');
        return tx.archiveOrder({scope:{...scope},orderId:id,status:'cancelled',archivedAt:clock().toISOString(),allowedStatuses:[...unpaidStatuses]});
      });
    },
  };
}

export function createCheckoutOrderAdapter({orders,mapSubmission}={}){
  method(orders,'createPendingOrder');
  if(typeof mapSubmission!=='function')fail('MISSING_SUBMISSION_MAPPER');
  return Object.freeze({async createPendingOrder(input={}){
    return orders.createPendingOrder({idempotencyKey:input.idempotencyKey,checkout:input.checkoutSnapshot,paymentMethod:input.paymentMethod,submission:await mapSubmission(input.fields),locale:input.locale,schemaVersion:input.schemaVersion,expiresAt:input.expiresAt});
  }});
}
