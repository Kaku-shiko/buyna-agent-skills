import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {Toaster,toast} from 'sonner';
import {CheckCircle2,Info,LoaderCircle,TriangleAlert,X} from 'lucide-react';
import './feedback.css';

// A synchronous gate protects against a second event before React renders disabled.
export function useBusy():[boolean,(value:boolean)=>boolean] {
 const [busy,update]=useState(false),locked=useRef(false);
 const setBusy=useCallback((value:boolean)=>{if(value&&locked.current)return false;locked.current=value;update(value);return true;},[]);
 return [busy,setBusy];
}

type Feedback={busy?:boolean;error?:string;notice?:string;pending?:string;tone?:'success'|'info'};
export function useFeedback({busy=false,error='',notice='',pending='正在处理，请稍候…',tone='success'}:Feedback){
 const id=useId(),previous=useRef({busy:false,error:'',notice:''}),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 useEffect(()=>{
  const before=previous.current;
  if(busy){
   if(!before.busy){toast.dismiss(id);timer.current=setTimeout(()=>toast.loading(pending,{id,dismissible:false,closeButton:false}),300);}
  }else{
   clearTimeout(timer.current);
   if(error&&(before.busy||error!==before.error))toast.error('操作未完成',{id,description:friendlyError(error),duration:8000,closeButton:true,dismissible:true});
   else if(!error&&notice&&(before.busy||notice!==before.notice))toast[tone](<span role="status">{notice}</span>,{id,duration:4500,closeButton:true,dismissible:true});
   else if(before.busy)toast.dismiss(id);
  }
  previous.current={busy,error,notice};
 },[busy,error,notice,pending,tone,id]);
 useEffect(()=>()=>{clearTimeout(timer.current);toast.dismiss(id);},[id]);
}

export function friendlyError(message:string){
 return /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(message)?'连接中断，尚未确认操作结果。请检查网络后刷新记录；付款和退款请先核对结果。':message;
}

export function FeedbackHost(){
 const [offline,setOffline]=useState(!navigator.onLine);
 useEffect(()=>{const on=()=>{setOffline(false);toast.info('网络已恢复，请重新核对未完成的操作。',{id:'network'});},off=()=>{setOffline(true);};window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);};},[]);
 useEffect(()=>{let last=0;const invalid=()=>{if(Date.now()-last<500)return;last=Date.now();toast.error('请检查填写内容',{id:'form-validation',description:'请补全必填项，或检查标记的字段。',duration:6000});};document.addEventListener('invalid',invalid,true);return()=>document.removeEventListener('invalid',invalid,true);},[]);
 return <>{offline&&<div className="connection-notice" role="status">网络连接已断开。请保留当前页面，恢复后先核对操作结果。</div>}<Toaster className="buyna-feedback" theme="light" position="top-right" offset={{top:76,right:20}} mobileOffset={{top:72,left:12,right:12}} visibleToasts={3} closeButton hotkey={['F8']} containerAriaLabel="操作提示" toastOptions={{closeButtonAriaLabel:'关闭提示',className:'buyna-toast'}} icons={{success:<CheckCircle2 size={19}/>,info:<Info size={19}/>,error:<TriangleAlert size={19}/>,loading:<LoaderCircle size={19} className="feedback-spinner"/>,close:<X size={14}/>}}/></>;
}
