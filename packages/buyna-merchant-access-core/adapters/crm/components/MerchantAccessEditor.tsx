import {useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {getMerchantAccess,saveMerchantAccess} from '@/lib/merchant-access.functions';
import {emptyAccess} from '@/lib/merchant-access-core.mjs';
export function MerchantAccessEditor({customerId}:{customerId:string}){
 const read=useServerFn(getMerchantAccess),save=useServerFn(saveMerchantAccess);
 const [projectId,setProjectId]=useState(''),[ownerActor,setOwnerActor]=useState(''),[draft,setDraft]=useState<any>(emptyAccess()),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const update=(key:string,value:unknown)=>setDraft((d:any)=>({...d,[key]:value}));
 async function run(load=false){setBusy(true);setMessage('');try{const value=load?await read({data:{projectId}}):await save({data:{projectId,ownerActor,customerId,expectedRevision:revision,patch:Object.fromEntries(Object.entries(draft).filter(([k])=>!["verification","verificationReason"].includes(k)))}});if(value.customerId!==customerId)throw Error('此项目已绑定其他客户');setOwnerActor(value.ownerActor);setRevision(value.revision);const clean=emptyAccess();for(const key of Object.keys(clean))clean[key]=value[key];setDraft(clean);setMessage(load?'已读取当前配置':'已保存，Builder 下次读取立即生效');}catch(e){setMessage('操作未完成，请检查项目绑定及字段；如已被其他窗口修改，请先重新读取。');}finally{setBusy(false);}}
 return <section className="mt-6 rounded-2xl border border-[#dfe5ef] p-4"><h3 className="font-semibold">支付与开通管理</h3><p className="my-2 text-sm text-slate-500">绑定信息可从 Builder 的“支付与订阅”复制。保存配置不会发起扣款。</p>
 <fieldset disabled={busy} className="space-y-3">
 <label className="block text-sm">Builder 项目编号<input className="mt-1 w-full rounded border p-2" value={projectId} onChange={e=>{setProjectId(e.target.value);setRevision(0);setDraft(emptyAccess());setOwnerActor('');}}/></label>
 <label className="block text-sm">Builder 账户编号<input className="mt-1 w-full rounded border p-2" value={ownerActor} onChange={e=>setOwnerActor(e.target.value)}/></label>
 <button type="button" className="rounded border px-3 py-2" onClick={()=>run(true)}>读取配置</button>
 {Object.entries({legalName:'商户法定名称',contactName:'联系人',contactEmail:'联系邮箱',subscriptionEnd:'订阅截止日期（可留空）',reason:'本次修改原因'}).map(([key,label])=><label key={key} className="block text-sm">{label}<input type={key==='subscriptionEnd'?'date':key==='contactEmail'?'email':'text'} className="mt-1 w-full rounded border p-2" value={draft[key]} onChange={e=>update(key,e.target.value)}/></label>)}
 {Object.entries({businessType:{company:'法人商户',individual:'个人商户'},environment:{production:'正式环境',sandbox:'沙盒环境'},activation:{unconfirmed:'开通情况待确认',merchant_confirmed:'商户已确认开通'},configuration:{pending:'待完成支付配置',saved:'配置已保存',connected:'网站已接入'},renewal:{manual:'手动续费',automatic:'自动续费记录',cancel_at_end:'到期不续费'}}).map(([key,options])=><label key={key} className="block text-sm">{{businessType:'商户类型',environment:'支付环境',activation:'渠道开通',configuration:'网站配置',renewal:'续费方式'}[key]}<select className="mt-1 w-full rounded border p-2" value={draft[key]} onChange={e=>update(key,e.target.value)}>{Object.entries(options).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>)}
 <p className="text-sm text-slate-500">接口验证：{draft.verification==='pending'?'待验证':draft.verification}。验证结果仅由渠道核对写入。</p>
 <label className="block text-sm"><input type="checkbox" checked={draft.enabled} onChange={e=>update('enabled',e.target.checked)}/> 允许网站启用收款（仍需完成凭证接入）</label>
 <button type="button" className="rounded bg-blue-600 px-4 py-2 text-white" onClick={()=>run()}>{busy?'保存中…':'保存支付与开通配置'}</button></fieldset><p role="status" className="mt-3 text-sm">{message}</p></section>;
}
