import React,{useEffect} from 'react';

type CartLine={key:string;name:string;skuCode?:string|null;imageUrl?:string|null;quantity:number;unitPrice:number;lineTotal:number;currency:string};
type CartView={items:CartLine[];itemCount:number;subtotal:number;currency:string|null};

export function CartButton({itemCount,onOpen,label='购物车'}:{itemCount:number;onOpen:()=>void;label?:string}){
  return <button type="button" className="buyna-cart-button" onClick={onOpen} aria-label={`${label}，${itemCount}件商品`}><span>{label}</span><span className="buyna-cart-count" aria-hidden="true">{itemCount}</span></button>;
}

export function CartDrawer({open,cart,onClose,onUpdateQuantity,onRemove,onCheckout,formatMoney,title='购物车',checkoutLabel='进入结算',maxQuantityPerItem=10}:{open:boolean;cart:CartView;onClose:()=>void;onUpdateQuantity:(line:CartLine,quantity:number)=>void|Promise<void>;onRemove:(line:CartLine)=>void|Promise<void>;onCheckout:()=>void|Promise<void>;formatMoney:(amount:number,currency:string|null)=>string;title?:string;checkoutLabel?:string;maxQuantityPerItem?:number}){
  useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose()};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[open,onClose]);
  if(!open)return null;
  return <div className="buyna-cart-layer"><button className="buyna-cart-backdrop" type="button" onClick={onClose} aria-label="关闭购物车"/><aside className="buyna-cart-drawer" role="dialog" aria-modal="true" aria-labelledby="buyna-cart-title">
    <header className="buyna-cart-header"><h2 id="buyna-cart-title">{title} <span>({cart.itemCount})</span></h2><button type="button" onClick={onClose} aria-label="关闭">×</button></header>
    <div className="buyna-cart-items">{cart.items.length===0?<p className="buyna-cart-empty">购物车为空</p>:cart.items.map(line=><article className="buyna-cart-line" key={line.key}>
      <div className="buyna-cart-image">{line.imageUrl?<img src={line.imageUrl} alt=""/>:null}</div><div className="buyna-cart-copy"><h3>{line.name}</h3>{line.skuCode?<p>{line.skuCode}</p>:null}<strong>{formatMoney(line.unitPrice,line.currency)}</strong>
      <div className="buyna-cart-actions"><button type="button" onClick={()=>onUpdateQuantity(line,line.quantity-1)} disabled={line.quantity<=1} aria-label={`减少${line.name}数量`}>−</button><output aria-label="数量">{line.quantity}</output><button type="button" onClick={()=>onUpdateQuantity(line,line.quantity+1)} disabled={line.quantity>=maxQuantityPerItem} aria-label={`增加${line.name}数量`}>＋</button><button type="button" className="buyna-cart-remove" onClick={()=>onRemove(line)}>删除</button></div></div><strong className="buyna-cart-line-total">{formatMoney(line.lineTotal,line.currency)}</strong>
    </article>)}</div>
    <footer className="buyna-cart-footer"><div><span>合计</span><strong>{formatMoney(cart.subtotal,cart.currency)}</strong></div><button type="button" className="buyna-cart-checkout" disabled={!cart.items.length} onClick={onCheckout}>{checkoutLabel}</button></footer>
  </aside></div>;
}
