import React,{type ElementType,type ReactNode,useEffect,useReducer} from 'react';
import {DASHBOARD_METRICS,DASHBOARD_NAVIGATION,DASHBOARD_TABLES,createTableView,dashboardDrawerReducer} from '@buyna/merchant-dashboard-core';

type ClassNames=Partial<Record<'shell'|'sidebar'|'brand'|'nav'|'navItem'|'navItemActive'|'sidebarFooter'|'workspace'|'mobileHeader'|'backdrop'|'page'|'pageHeader'|'pageActions'|'panel'|'metrics'|'filters'|'filterAction'|'tableWrap'|'table'|'state'|'pagination'|'status'|'dialogBackdrop'|'dialog',string>>;
const cx=(...values:(string|undefined|false)[])=>values.filter(Boolean).join(' ');

type ShellProps={brand:string;merchantName?:string;currentPath:string;storefrontUrl?:string;onLogout?:()=>void;LinkComponent?:ElementType;renderIcon?:(key:string)=>ReactNode;classNames?:ClassNames;children:ReactNode};
export function MerchantDashboardShell({brand,merchantName,currentPath,storefrontUrl,onLogout,LinkComponent='a',renderIcon=(key)=>key,classNames={},children}:ShellProps){
  const[open,dispatchDrawer]=useReducer(dashboardDrawerReducer,false);
  useEffect(()=>{
    if(!open)return;
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')dispatchDrawer({type:'escape'})};
    window.addEventListener('keydown',closeOnEscape);
    return()=>window.removeEventListener('keydown',closeOnEscape);
  },[open]);
  return <div className={classNames.shell} data-dashboard-part="shell" data-drawer-open={open||undefined}>
    <aside className={classNames.sidebar} data-dashboard-part="sidebar" aria-label="商家后台导航" id="merchant-dashboard-navigation">
      <div className={classNames.brand} data-dashboard-part="brand"><strong>{brand}</strong><span>{merchantName||'Merchant Console'}</span></div>
      <nav className={classNames.nav}>{DASHBOARD_NAVIGATION.map(item=>{const active=item.href==='/seller'?currentPath===item.href:currentPath.startsWith(item.href);return <LinkComponent aria-current={active?'page':undefined} className={cx(classNames.navItem,active&&classNames.navItemActive)} data-dashboard-part="nav-item" data-active={active||undefined} href={item.href} key={item.key} onClick={()=>dispatchDrawer({type:'navigate'})}><i aria-hidden="true">{renderIcon(item.icon)}</i><span>{item.label}</span></LinkComponent>})}</nav>
      <div className={classNames.sidebarFooter} data-dashboard-part="sidebar-footer">{storefrontUrl?<a href={storefrontUrl} rel="noreferrer" target="_blank">查看公开网站 ↗</a>:null}{onLogout?<button type="button" onClick={onLogout}>退出登录</button>:null}</div>
    </aside>
    <div className={classNames.workspace} data-dashboard-part="workspace">
      <header className={classNames.mobileHeader} data-dashboard-part="mobile-header"><div><strong>{brand}</strong><span>{merchantName}</span></div><button aria-expanded={open} aria-controls="merchant-dashboard-navigation" aria-label={open?'关闭菜单':'打开菜单'} type="button" onClick={()=>dispatchDrawer({type:'toggle'})}>{open?'×':'☰'}</button></header>
      {children}
    </div>
    {open?<button className={classNames.backdrop} data-dashboard-part="backdrop" aria-label="关闭菜单" type="button" onClick={()=>dispatchDrawer({type:'backdrop'})}/>:null}
  </div>;
}

export function DashboardPage({classNames={},children}:{classNames?:ClassNames;children:ReactNode}){return <main className={classNames.page} data-dashboard-part="page">{children}</main>}
export function DashboardPageHeader({classNames={},eyebrow,title,description,actions}:{classNames?:ClassNames;eyebrow?:string;title:string;description?:string;actions?:ReactNode}){return <header className={classNames.pageHeader} data-dashboard-part="page-header"><div>{eyebrow?<span>{eyebrow}</span>:null}<h1>{title}</h1>{description?<p>{description}</p>:null}</div>{actions?<div className={classNames.pageActions}>{actions}</div>:null}</header>}
export function DashboardPanel({classNames={},title,description,actions,children}:{classNames?:ClassNames;title?:string;description?:string;actions?:ReactNode;children:ReactNode}){return <section className={classNames.panel} data-dashboard-part="panel">{title||actions?<header><div>{title?<h2>{title}</h2>:null}{description?<p>{description}</p>:null}</div>{actions?<div>{actions}</div>:null}</header>:null}{children}</section>}
export function DashboardMetricGrid({classNames={},values,loading=false}:{classNames?:ClassNames;values:Record<string,ReactNode>;loading?:boolean}){return <section className={classNames.metrics} data-dashboard-part="metrics" aria-label="商家数据摘要">{DASHBOARD_METRICS.map(metric=><article key={metric.key}><span>{metric.label}</span><strong>{loading?'—':values[metric.key]??0}</strong></article>)}</section>}
export function DashboardFilterBar({classNames={},children,primaryAction}:{classNames?:ClassNames;children:ReactNode;primaryAction?:ReactNode}){return <div className={classNames.filters} data-dashboard-part="filters"><div>{children}</div>{primaryAction?<div className={classNames.filterAction}>{primaryAction}</div>:null}</div>}

type TableProps={classNames?:ClassNames;table:keyof typeof DASHBOARD_TABLES;rows?:Record<string,unknown>[];loading?:boolean;error?:string;permissionDenied?:boolean;rowKey?:(row:Record<string,unknown>)=>string;renderCell?:(row:Record<string,unknown>,column:{key:string;label:string})=>ReactNode;emptyTitle?:string;emptyDescription?:string};
export function DashboardDataTable({classNames={},table,rows=[],loading,error,permissionDenied,rowKey=(row)=>String(row.id),renderCell=(row,column)=>String(row[column.key]??'—'),emptyTitle='暂无数据',emptyDescription='当前条件下没有可显示的记录。'}:TableProps){
  const schema=DASHBOARD_TABLES[table];const view=createTableView({rows,loading,error,permissionDenied});
  if(view.state!=='ready')return <DashboardTableState classNames={classNames} state={view.state} title={view.state==='empty'?emptyTitle:undefined} description={view.state==='empty'?emptyDescription:view.state==='loading'?'正在读取数据…':view.state==='permission'?'没有权限查看此页面。':error}/>;
  return <div className={classNames.tableWrap} data-dashboard-part="table-wrap"><table className={classNames.table} data-dashboard-part="table"><thead><tr>{schema.columns.map(column=><th data-align={column.align} key={column.key} scope="col">{column.label}</th>)}</tr></thead><tbody>{view.rows.map(row=><tr key={rowKey(row)}>{schema.columns.map(column=><td data-align={column.align} data-label={column.label} key={column.key}>{renderCell(row,column)}</td>)}</tr>)}</tbody></table></div>;
}
export function DashboardTableState({classNames={},state,title,description,retry}:{classNames?:ClassNames;state:'loading'|'empty'|'error'|'permission';title?:string;description?:string;retry?:()=>void}){return <div className={classNames.state} data-dashboard-part="state" data-state={state} role={state==='error'?'alert':'status'}><strong>{title||({loading:'加载中',empty:'暂无数据',error:'读取失败',permission:'没有权限'} as const)[state]}</strong>{description?<p>{description}</p>:null}{retry&&state==='error'?<button type="button" onClick={retry}>重新加载</button>:null}</div>}
export function DashboardPagination({classNames={},page,totalPages,onPageChange}:{classNames?:ClassNames;page:number;totalPages:number;onPageChange:(page:number)=>void}){if(totalPages<=1)return null;return <nav className={classNames.pagination} data-dashboard-part="pagination" aria-label="分页"><button disabled={page<=1} type="button" onClick={()=>onPageChange(page-1)}>上一页</button><span>第 {page} / {totalPages} 页</span><button disabled={page>=totalPages} type="button" onClick={()=>onPageChange(page+1)}>下一页</button></nav>}
const statusLabels:Record<string,string>={active:'公开',inactive:'隐藏',draft:'草稿',pending_payment:'待支付',paid:'已支付',refunded:'已退款',failed:'失败',expired:'已过期',cancelled:'已取消',configured:'已配置',unconfigured:'未配置'};
export function DashboardStatusBadge({classNames={},value}:{classNames?:ClassNames;value:string}){const normalized=String(value??'').toLowerCase();return <span className={classNames.status} data-dashboard-part="status" data-status={normalized}>{statusLabels[normalized]||value}</span>}
export function DashboardConfirmDialog({classNames={},open,title,description,confirmLabel='确认',danger=false,busy=false,onConfirm,onCancel}:{classNames?:ClassNames;open:boolean;title:string;description:string;confirmLabel?:string;danger?:boolean;busy?:boolean;onConfirm:()=>void;onCancel:()=>void}){if(!open)return null;return <div className={classNames.dialogBackdrop} data-dashboard-part="dialog-backdrop" role="presentation"><section className={classNames.dialog} data-dashboard-part="dialog" data-danger={danger||undefined} aria-labelledby="buyna-confirm-title" aria-modal="true" role="dialog"><h2 id="buyna-confirm-title">{title}</h2><p>{description}</p><footer><button disabled={busy} type="button" onClick={onCancel}>取消</button><button disabled={busy} type="button" onClick={onConfirm}>{busy?'处理中…':confirmLabel}</button></footer></section></div>}
