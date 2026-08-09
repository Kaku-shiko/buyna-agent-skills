import React,{type ElementType,type ReactNode,useState} from 'react';
import {DASHBOARD_METRICS,DASHBOARD_NAVIGATION,DASHBOARD_TABLES,createTableView} from './dashboard-model.mjs';

type ShellProps={brand:string;merchantName?:string;currentPath:string;storefrontUrl?:string;onLogout?:()=>void;LinkComponent?:ElementType;children:ReactNode};
export function MerchantDashboardShell({brand,merchantName,currentPath,storefrontUrl,onLogout,LinkComponent='a',children}:ShellProps){
  const[open,setOpen]=useState(false);
  return <div className="buyna-admin-shell">
    <aside className={`buyna-admin-sidebar${open?' is-open':''}`} aria-label="商家后台导航">
      <div className="buyna-admin-brand"><strong>{brand}</strong><span>{merchantName||'Merchant Console'}</span></div>
      <nav>{DASHBOARD_NAVIGATION.map(item=>{const active=item.href==='/seller'?currentPath===item.href:currentPath.startsWith(item.href);return <LinkComponent aria-current={active?'page':undefined} className={active?'is-active':''} href={item.href} key={item.key} onClick={()=>setOpen(false)}><i aria-hidden="true">{item.icon}</i><span>{item.label}</span></LinkComponent>})}</nav>
      <div className="buyna-admin-sidebar-footer">{storefrontUrl?<a href={storefrontUrl} rel="noreferrer" target="_blank">查看公开网站 ↗</a>:null}{onLogout?<button type="button" onClick={onLogout}>退出登录</button>:null}</div>
    </aside>
    <div className="buyna-admin-workspace">
      <header className="buyna-admin-mobile-header"><div><strong>{brand}</strong><span>{merchantName}</span></div><button aria-expanded={open} aria-label={open?'关闭菜单':'打开菜单'} type="button" onClick={()=>setOpen(value=>!value)}>{open?'×':'☰'}</button></header>
      {children}
    </div>
    {open?<button className="buyna-admin-backdrop" aria-label="关闭菜单" type="button" onClick={()=>setOpen(false)}/>:null}
  </div>;
}

export function DashboardPage({children}:{children:ReactNode}){return <main className="buyna-admin-page">{children}</main>}
export function DashboardPageHeader({eyebrow,title,description,actions}:{eyebrow?:string;title:string;description?:string;actions?:ReactNode}){return <header className="buyna-admin-page-header"><div>{eyebrow?<span>{eyebrow}</span>:null}<h1>{title}</h1>{description?<p>{description}</p>:null}</div>{actions?<div className="buyna-admin-page-actions">{actions}</div>:null}</header>}
export function DashboardPanel({title,description,actions,children}:{title?:string;description?:string;actions?:ReactNode;children:ReactNode}){return <section className="buyna-admin-panel">{title||actions?<header><div>{title?<h2>{title}</h2>:null}{description?<p>{description}</p>:null}</div>{actions?<div>{actions}</div>:null}</header>:null}{children}</section>}

export function DashboardMetricGrid({values,loading=false}:{values:Record<string,ReactNode>;loading?:boolean}){return <section className="buyna-admin-metrics" aria-label="商家数据摘要">{DASHBOARD_METRICS.map(metric=><article key={metric.key}><span>{metric.label}</span><strong>{loading?'—':values[metric.key]??0}</strong></article>)}</section>}

export function DashboardFilterBar({children,primaryAction}:{children:ReactNode;primaryAction?:ReactNode}){return <div className="buyna-admin-filters"><div>{children}</div>{primaryAction?<div className="buyna-admin-filter-action">{primaryAction}</div>:null}</div>}

type TableProps={table:keyof typeof DASHBOARD_TABLES;rows?:Record<string,unknown>[];loading?:boolean;error?:string;permissionDenied?:boolean;rowKey?:(row:Record<string,unknown>)=>string;renderCell?:(row:Record<string,unknown>,column:{key:string;label:string})=>ReactNode;emptyTitle?:string;emptyDescription?:string};
export function DashboardDataTable({table,rows=[],loading,error,permissionDenied,rowKey=(row)=>String(row.id),renderCell=(row,column)=>String(row[column.key]??'—'),emptyTitle='暂无数据',emptyDescription='当前条件下没有可显示的记录。'}:TableProps){
  const schema=DASHBOARD_TABLES[table];
  const view=createTableView({rows,loading,error,permissionDenied});
  if(view.state!=='ready')return <DashboardTableState state={view.state} title={view.state==='empty'?emptyTitle:undefined} description={view.state==='empty'?emptyDescription:view.state==='loading'?'正在读取数据…':view.state==='permission'?'没有权限查看此页面。':error}/>;
  return <div className="buyna-admin-table-wrap"><table className="buyna-admin-table"><thead><tr>{schema.columns.map(column=><th className={column.align?`is-${column.align}`:undefined} key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{view.rows.map(row=><tr key={rowKey(row)}>{schema.columns.map(column=><td className={column.align?`is-${column.align}`:undefined} data-label={column.label} key={column.key}>{renderCell(row,column)}</td>)}</tr>)}</tbody></table></div>;
}

export function DashboardTableState({state,title,description,retry}:{state:'loading'|'empty'|'error'|'permission';title?:string;description?:string;retry?:()=>void}){return <div className={`buyna-admin-state is-${state}`} role={state==='error'?'alert':'status'}><strong>{title||({loading:'加载中',empty:'暂无数据',error:'读取失败',permission:'没有权限'} as const)[state]}</strong>{description?<p>{description}</p>:null}{retry&&state==='error'?<button type="button" onClick={retry}>重新加载</button>:null}</div>}

export function DashboardPagination({page,totalPages,onPageChange}:{page:number;totalPages:number;onPageChange:(page:number)=>void}){if(totalPages<=1)return null;return <nav className="buyna-admin-pagination" aria-label="分页"><button disabled={page<=1} type="button" onClick={()=>onPageChange(page-1)}>上一页</button><span>第 {page} / {totalPages} 页</span><button disabled={page>=totalPages} type="button" onClick={()=>onPageChange(page+1)}>下一页</button></nav>}

const statusLabels:Record<string,string>={active:'公开',inactive:'隐藏',draft:'草稿',pending_payment:'待支付',paid:'已支付',refunded:'已退款',failed:'失败',expired:'已过期',cancelled:'已取消',configured:'已配置',unconfigured:'未配置'};
export function DashboardStatusBadge({value}:{value:string}){const normalized=String(value??'').toLowerCase();return <span className={`buyna-admin-status is-${normalized}`}>{statusLabels[normalized]||value}</span>}

export function DashboardConfirmDialog({open,title,description,confirmLabel='确认',danger=false,busy=false,onConfirm,onCancel}:{open:boolean;title:string;description:string;confirmLabel?:string;danger?:boolean;busy?:boolean;onConfirm:()=>void;onCancel:()=>void}){if(!open)return null;return <div className="buyna-admin-dialog-backdrop" role="presentation"><section aria-labelledby="buyna-confirm-title" aria-modal="true" className="buyna-admin-dialog" role="dialog"><h2 id="buyna-confirm-title">{title}</h2><p>{description}</p><footer><button disabled={busy} type="button" onClick={onCancel}>取消</button><button className={danger?'is-danger':'is-primary'} disabled={busy} type="button" onClick={onConfirm}>{busy?'处理中…':confirmLabel}</button></footer></section></div>}
