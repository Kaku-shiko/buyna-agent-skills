import {useEffect,useState} from 'react';
import {PaymentBrand} from './payment-brand';
async function api(path:string){
  const response=await fetch(path,{cache:'no-store'});
  if(!response.ok)throw new Error('支付方式加载失败');
  return response.json();
}
import './payment-settings.css';

export type PaymentAvailability={provider:string|null;collectionEnabled:boolean;methods:{id:string;providerId?:string;optionId?:string;label:string;available:boolean;selected:boolean;reason:string}[]};
export function PaymentMethods({siteSlug,previewSiteId,heading='支付方式',description='',value,onChange}:{siteSlug:string;previewSiteId?:string;heading?:string;description?:string;value?:string;onChange?:(method:string)=>void}){
  const [state,setState]=useState<PaymentAvailability|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    setState(null);setError('');
    if(!siteSlug&&!previewSiteId){setError('请先选择网站。');return;}
    let active=true;
    const load=()=>api(previewSiteId?`/api/commerce/sites/${encodeURIComponent(previewSiteId)}/payment-options`:`/api/public/${encodeURIComponent(siteSlug)}/payment-options`).then(v=>{if(active){setState(v);setError('');}}).catch(()=>{if(active){setState(null);setError('支付方式暂时无法加载，请稍后重试。');}});
    void load();const timer=setInterval(load,15000);
    return()=>{active=false;clearInterval(timer);};
  },[siteSlug,previewSiteId]);
  const available=state?.collectionEnabled ? state.methods.filter(m=>m.available&&m.optionId) : [];
  useEffect(()=>{if(value&&!available.some(m=>m.optionId===value))onChange?.('');},[state,value,onChange]);
  if(!previewSiteId&&state&&!available.length)return <p className="payment-status-note">本店暂未开放在线付款，请联系商家。</p>;
  return <section className="shared-payment-methods"><h3>{heading}</h3>{description&&<p>{description}</p>}{error&&<p role="alert">{error}</p>}{!state&&!error&&<p role="status">正在读取支付方式…</p>}
    <div className="shared-method-grid" role={onChange?'group':undefined} aria-label="支付方式">{(previewSiteId?state?.methods:available)?.map(method=>{const optionId=method.optionId||`${state?.provider}:${method.id}`;return onChange?<label className={'shared-method '+(!method.available?'unavailable':'')} key={optionId}><input type="radio" name="paymentMethod" value={optionId} checked={value===optionId} disabled={!method.available||!method.optionId||!!previewSiteId} onChange={()=>onChange(optionId)}/><PaymentBrand name={method.id}/><span>{method.label}<small>{method.available?'可用':method.reason}</small></span></label>:<div className={'shared-method '+(!method.available?'unavailable':'')} key={optionId}><PaymentBrand name={method.id}/><span>{method.label}<small>{method.available?'可用':method.reason}</small></span></div>;})}</div>
    {state&&!state.collectionEnabled&&<p className="payment-status-note">在线收款尚未启用。</p>}
  </section>;
}
