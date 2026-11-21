const version=value=>typeof value==='string'&&/^sv1_[a-f0-9]{64}$/.test(value);
function validate(snapshot){if(snapshot?.apiVersion!=='1.1'||!version(snapshot.stateVersion)||!snapshot.identity||!Array.isArray(snapshot.rows)||!Array.isArray(snapshot.billingHistory))throw Error('INVALID_SUBSCRIPTION_RESPONSE');return snapshot;}
function endpoint(value){if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.includes('?')||value.includes('#'))throw Error('INVALID_SUBSCRIPTION_ENDPOINT');return value;}

export function createSubscriptionClient({readUrl, cancelUrl, fetchImpl=fetch,requestId=()=>crypto.randomUUID(),onState=()=>{},invalidate=()=>{}}){
 endpoint(readUrl);endpoint(cancelUrl);
 let current=null,sequence=0,busy=false,disposed=false;
 async function decode(response){const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'SUBSCRIPTION_REQUEST_FAILED'),{status:response.status,operationCommitted:data.operationCommitted===true});return data;}
 async function load(){const token=++sequence;const response=await fetchImpl(readUrl,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});const snapshot=validate(await decode(response));if(token===sequence&&!disposed){current=snapshot;onState(snapshot);}return snapshot;}
 return {
  get state(){return current;},load,
  dispose(){disposed=true;sequence++;},
  async cancel(subscriptionId){
   if(disposed)throw Error('SUBSCRIPTION_CLIENT_DISPOSED');
   if(busy)throw Error('SUBSCRIPTION_OPERATION_IN_PROGRESS');
   if(!current)throw Error('SUBSCRIPTION_RELOAD_REQUIRED');
   busy=true;const displayed=current;
   try{
    const latest=await load();
    if(latest.stateVersion!==displayed.stateVersion)throw Error('SUBSCRIPTION_CHANGED');
    const row=latest.rows.find(value=>value.subscriptionId===subscriptionId);
    if(!row||!version(row.stateVersion))throw Error('SUBSCRIPTION_SCOPE_MISMATCH');
    const response=await fetchImpl(cancelUrl,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-buyna-cancel':'1','x-buyna-subscription-api':'1.1'},body:JSON.stringify({subscriptionId,confirm:true,expectedVersion:row.stateVersion,requestId:requestId()})});
    const result=await decode(response);const snapshot=validate(result.snapshot);sequence++;
    if(!disposed){current=snapshot;onState(snapshot);}invalidate();
    try{await load();return {snapshot:current,revalidated:true};}catch{return {snapshot:current,revalidated:false};}
   }catch(error){if(error.operationCommitted){invalidate();try{await load();}catch{}}throw error;}
   finally{busy=false;}
  },
 };
}

export function watchSubscriptionState(client,{target=window,document=target.document,intervalMs=30000,onError=()=>{}}={}){
 if(!Number.isFinite(intervalMs)||intervalMs<5000)throw Error('INVALID_REVALIDATION_INTERVAL');
 let stopped=false,running=false;
 const reload=async()=>{if(stopped||running||document?.visibilityState==='hidden')return;running=true;try{await client.load();}catch(error){onError(error);}finally{running=false;}};
 const events=['focus','online','buyna:subscription-invalidated'];for(const event of events)target.addEventListener(event,reload);document?.addEventListener('visibilitychange',reload);
 const timer=target.setInterval(reload,intervalMs);void reload();
 return()=>{stopped=true;target.clearInterval(timer);for(const event of events)target.removeEventListener(event,reload);document?.removeEventListener('visibilitychange',reload);client.dispose();};
}

export function merchantSubscriptionView(snapshot){
 validate(snapshot);const current=snapshot.subscription,record=snapshot.rows.find(row=>row.subscriptionId===current?.id);
 return {
  found:Boolean(current),source:'Buyna payments',payee:'Buyna',apiVersion:'1.1',snapshot,stateVersion:current?.recordVersion??null,
  subscriptionId:current?.id,plan:current?.planName??null,planCode:current?.planCode??null,status:current?.status??'not_started',
  currentPeriodStart:snapshot.service.currentPeriodStart,currentPeriodEnd:snapshot.service.currentPeriodEnd,
  currentAmountGross:snapshot.fees.contractAmountGross,billingMonths:current?.billingMonths??null,
  nextAmountGross:snapshot.renewal.nextAmountGross,nextBillingAt:snapshot.renewal.nextBillingAt,
  billingEnabled:snapshot.renewal.enabled,cancelAtPeriodEnd:record?.cancelAtPeriodEnd===true,
  agreementStatus:snapshot.renewal.authorizationStatus==='RECORDED'?'ACTIVE':'PENDING',
  paidFeaturesEnabled:snapshot.service.paidFeaturesEnabled,renewalProcessing:Boolean(snapshot.renewal.inFlight),canExtend:record?.canExtend===true,
  capabilities:{checkout:!current&&!snapshot.review.required,cancel:Boolean(current&&snapshot.renewal.enabled),changeCard:false,invoices:false},
  invoices:snapshot.billingHistory,plans:snapshot.plans,
 };
}
