import {useEffect,useState} from 'react';
import './redemption.css';
export type RedemptionEntry={orderId:string;lineIndex:number;name:string;quantity:number;scenario:string;customer?:string;validFrom:string;validUntil:string;status:string;blockedReason:string|null;prepared:boolean;code?:string;record:null|{id?:string;actor?:string;createdAt:string;note?:string;quantity:number}};
const scenarios:Record<string,string>={travel:'旅游出行',appointment:'预约到场',dining:'到店取餐'};
const states:Record<string,string>={available:'可核销',blocked:'暂不可核销',redeemed:'已核销'};
const date=(v:string)=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Tokyo'});
export function CustomerVouchers({slug,orderId,token,refreshKey}:{slug:string;orderId:string;token:string;refreshKey:number}){
 const [items,setItems]=useState<RedemptionEntry[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;setItems([]);setError('');async function load(){try{const r=await fetch(`/api/public/${encodeURIComponent(slug)}/orders/${orderId}/vouchers`,{headers:{'X-Order-Token':token},cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'凭证暂时无法读取');if(!Array.isArray(d.items))throw Error('凭证暂时无法读取');if(active){setItems(d.items);setError('');}}catch(e){if(active){setItems([]);setError((e as Error).message);}}}void load();const interval=setInterval(load,15000);return()=>{active=false;clearInterval(interval);};},[slug,orderId,token,refreshKey]);
 if(error)return <p role="alert">{error}</p>;if(!items.length)return null;
 return <section className="customer-vouchers"><h2>我的凭证</h2>{items.map(item=><article className="voucher-card" key={item.lineIndex}><h3>{item.name}</h3><p>{scenarios[item.scenario]} · {item.quantity} 人／份</p><span className={'redemption-status '+item.status}>{states[item.status]}</span><p>{date(item.validFrom)} — {date(item.validUntil)}（日本时间）</p>{item.record?<p>已于 {date(item.record.createdAt)} 使用</p>:item.code?<VoucherCode code={item.code}/>:null}{item.blockedReason&&<p>{item.blockedReason}</p>}</article>)}</section>;
}
function VoucherCode({code}:{code:string}){
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let active=true;void import('qrcode').then(q=>q.toDataURL(code,{width:256,margin:4,errorCorrectionLevel:'M'})).then(v=>{if(active)setUrl(v);}).catch(()=>{if(active)setError('二维码暂时无法显示，请使用下方凭证码。');});return()=>{active=false;};},[code]);
 return <div className="voucher-code">{url&&<img src={url} alt="向店员出示的核销二维码" width={256} height={256}/>}<p>请仅向店员出示，勿公开转发。</p>{error&&<p>{error}</p>}<details><summary>显示凭证码</summary><code>{code}</code></details></div>;
}
