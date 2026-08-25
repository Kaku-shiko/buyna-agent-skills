import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DASHBOARD_NAVIGATION,
  DASHBOARD_OPERATION_STATES,
  DASHBOARD_OPERATION_TRANSITIONS,
  DASHBOARD_PAGES,
  DASHBOARD_TABLES,
  createDashboardOperation,
  createTableView,
  dashboardDrawerReducer,
  dashboardOperationStateFromTableView,
  validateDashboardTheme,
} from '../src/index.mjs';

test('product merchant functions remain fixed in the approved order',()=>{
  assert.deepEqual(DASHBOARD_NAVIGATION.map(item=>[item.key,item.label,item.href]),[
    ['dashboard','仪表盘','/seller'],['products','商品管理','/seller/products'],['categories','分类管理','/seller/categories'],['coupons','优惠券管理','/seller/coupons'],['orders','订单','/seller/orders'],['paidCustomers','付费客户','/seller/paid-customers'],['paymentSettings','支付/订阅设置','/seller/settings/payment'],
  ]);
  assert.deepEqual(DASHBOARD_TABLES.products.columns.map(column=>column.key),['sortOrder','image','name','category','price','stock','visibility','actions']);
  assert.equal(DASHBOARD_PAGES.paymentSettings.subscriptionAccess,'server_only_read');
});

test('table behavior remains fixed without visual choices',()=>{
  assert.equal(createTableView({loading:true}).state,'loading');
  assert.equal(createTableView({error:'读取失败'}).state,'error');
  assert.equal(createTableView({rows:[]}).state,'empty');
  assert.deepEqual(createTableView({rows:[{id:'1'}],page:3,pageSize:500,total:201}),{state:'ready',rows:[{id:'1'}],page:3,pageSize:100,total:201,totalPages:3});
});

test('every project supplies an approved dashboard theme with no shared fallback',()=>{
  assert.throws(()=>validateDashboardTheme({}),/themeId/);
  assert.deepEqual(validateDashboardTheme({themeId:'merchant-a-v1',source:'approved_project_design',stylesheet:'src/admin/theme.css',shell:'topbar',density:'spacious'}),{themeId:'merchant-a-v1',source:'approved_project_design',stylesheet:'src/admin/theme.css',shell:'topbar',density:'spacious'});
});

test('mobile drawer behavior is fixed independently from its appearance',()=>{
  assert.equal(dashboardDrawerReducer(false,{type:'toggle'}),true);
  assert.equal(dashboardDrawerReducer(true,{type:'toggle'}),false);
  assert.equal(dashboardDrawerReducer(false,{type:'open'}),true);
  assert.equal(dashboardDrawerReducer(true,{type:'backdrop'}),false);
  assert.equal(dashboardDrawerReducer(true,{type:'navigate'}),false);
  assert.equal(dashboardDrawerReducer(true,{type:'escape'}),false);
});

test('dashboard read operations expose immutable serializable semantic state',()=>{
  assert.equal(Object.isFrozen(DASHBOARD_OPERATION_STATES),true);
  assert.equal(Object.isFrozen(DASHBOARD_OPERATION_TRANSITIONS),true);
  assert.equal(Object.isFrozen(DASHBOARD_OPERATION_TRANSITIONS.idle),true);

  const operation=createDashboardOperation();
  assert.deepEqual(operation.snapshot(),{
    state:'idle',
    dataState:'idle',
    dataStatus:'idle',
    ariaBusy:false,
  });

  const loading=operation.transition('load');
  assert.equal(loading.state,'loading');
  assert.equal(loading.dataState,'loading');
  assert.equal(loading.dataStatus,'loading');
  assert.equal(loading.ariaBusy,true);
  assert.match(loading.requestId,/^dashboard-read-\d+$/);

  const ready=operation.transition('load_success',{
    requestId:loading.requestId,
    data:{rows:[{id:'product-1'}]},
  });
  assert.deepEqual(ready,{
    state:'ready',
    dataState:'ready',
    dataStatus:'ready',
    ariaBusy:false,
    data:{rows:[{id:'product-1'}]},
  });
  assert.equal(Object.isFrozen(ready),true);
  assert.equal(Object.isFrozen(ready.data),true);
  assert.doesNotThrow(()=>JSON.stringify(ready));
});

test('dashboard reads cover empty, error, forbidden, retry, and legal transition metadata',()=>{
  assert.deepEqual(DASHBOARD_OPERATION_TRANSITIONS.idle,{load:'loading'});
  assert.equal(DASHBOARD_OPERATION_TRANSITIONS.loading.load_empty,'empty');
  assert.equal(DASHBOARD_OPERATION_TRANSITIONS.loading.load_error,'error');
  assert.equal(DASHBOARD_OPERATION_TRANSITIONS.loading.forbid,'forbidden');

  const emptyOperation=createDashboardOperation();
  const emptyRequest=emptyOperation.transition('load');
  assert.equal(emptyOperation.transition('load_empty',{requestId:emptyRequest.requestId}).state,'empty');

  const errorOperation=createDashboardOperation();
  const failedRequest=errorOperation.transition('load');
  const failed=errorOperation.transition('load_error',{requestId:failedRequest.requestId,errorCode:'CATALOG_UNAVAILABLE'});
  assert.equal(failed.state,'error');
  assert.equal(failed.errorCode,'CATALOG_UNAVAILABLE');
  const retried=errorOperation.transition('retry');
  assert.equal(retried.state,'loading');
  assert.notEqual(retried.requestId,failedRequest.requestId);

  const forbiddenOperation=createDashboardOperation();
  const forbiddenRequest=forbiddenOperation.transition('load');
  const forbidden=forbiddenOperation.transition('forbid',{requestId:forbiddenRequest.requestId});
  assert.equal(forbidden.state,'forbidden');
  assert.equal(forbidden.errorCode,'DASHBOARD_FORBIDDEN');
  assert.throws(
    ()=>forbiddenOperation.transition('edit'),
    error=>error.code==='DASHBOARD_OPERATION_INVALID_TRANSITION',
  );
});

test('a newer dashboard request rejects an older response',()=>{
  const operation=createDashboardOperation();
  const first=operation.transition('load');
  const second=operation.transition('load');
  assert.notEqual(first.requestId,second.requestId);
  operation.transition('load_success',{requestId:second.requestId,data:{rows:['current']}});
  assert.throws(
    ()=>operation.transition('load_success',{requestId:first.requestId,data:{rows:['stale']}}),
    error=>error.code==='DASHBOARD_OPERATION_STALE_RESPONSE',
  );
  assert.deepEqual(operation.snapshot().data,{rows:['current']});
});

test('an older read permission response is stale after the newer read completes',()=>{
  const operation=createDashboardOperation();
  const first=operation.transition('load');
  const second=operation.transition('load');
  const current=operation.transition('load_success',{
    requestId:second.requestId,
    data:{rows:['current']},
  });

  assert.throws(
    ()=>operation.transition('forbid',{requestId:first.requestId}),
    error=>error.code==='DASHBOARD_OPERATION_STALE_RESPONSE',
  );
  assert.deepEqual(operation.snapshot(),current);
});

test('dashboard edit and save states suppress duplicate saves and restore the last ready snapshot',()=>{
  const operation=createDashboardOperation({state:'ready',data:{record:{id:'p-1',name:'Before'}}});
  const editing=operation.transition('edit',{draft:{id:'p-1',name:'After'}});
  assert.equal(editing.state,'editing');
  assert.deepEqual(editing.data,{record:{id:'p-1',name:'Before'},draft:{id:'p-1',name:'After'}});

  const saving=operation.transition('save');
  assert.equal(saving.state,'saving');
  assert.equal(saving.ariaBusy,true);
  assert.match(saving.requestId,/^dashboard-save-\d+$/);
  assert.deepEqual(operation.transition('save'),saving);

  const validation=operation.transition('validation_error',{
    requestId:saving.requestId,
    errors:{name:'required'},
  });
  assert.equal(validation.state,'validation_error');
  assert.deepEqual(validation.errors,{name:'required'});

  const cancelled=operation.transition('cancel');
  assert.deepEqual(cancelled,{
    state:'ready',
    dataState:'ready',
    dataStatus:'ready',
    ariaBusy:false,
    data:{record:{id:'p-1',name:'Before'}},
  });
});

test('dashboard save supports success, permission denial, recoverable error, and stale retry rejection',()=>{
  const successOperation=createDashboardOperation({state:'ready',data:{record:{id:'p-1'}}});
  successOperation.transition('edit',{draft:{id:'p-1',name:'Saved'}});
  const successRequest=successOperation.transition('save');
  const saved=successOperation.transition('save_success',{
    requestId:successRequest.requestId,
    data:{record:{id:'p-1',name:'Saved'}},
  });
  assert.equal(saved.state,'saved');
  assert.deepEqual(saved.data,{record:{id:'p-1',name:'Saved'}});

  const forbiddenOperation=createDashboardOperation({state:'ready'});
  forbiddenOperation.transition('edit');
  const forbiddenRequest=forbiddenOperation.transition('save');
  assert.equal(forbiddenOperation.transition('forbid',{requestId:forbiddenRequest.requestId}).state,'forbidden');

  const retryOperation=createDashboardOperation({state:'ready',data:{record:{id:'p-2'}}});
  retryOperation.transition('edit',{draft:{id:'p-2',name:'Retry'}});
  const firstSave=retryOperation.transition('save');
  const failed=retryOperation.transition('save_error',{
    requestId:firstSave.requestId,
    errorCode:'CATALOG_WRITE_UNAVAILABLE',
    recoverable:true,
  });
  assert.equal(failed.state,'error');
  assert.equal(failed.recoverable,true);
  const retrySave=retryOperation.transition('retry');
  assert.equal(retrySave.state,'saving');
  assert.notEqual(retrySave.requestId,firstSave.requestId);
  assert.throws(
    ()=>retryOperation.transition('save_success',{requestId:firstSave.requestId}),
    error=>error.code==='DASHBOARD_OPERATION_STALE_RESPONSE',
  );
  assert.equal(retryOperation.transition('save_success',{requestId:retrySave.requestId}).state,'saved');
});

test('an older save permission response is stale after the newer save completes',()=>{
  const operation=createDashboardOperation({state:'ready',data:{record:{id:'p-3'}}});
  operation.transition('edit',{draft:{id:'p-3',name:'Current'}});
  const first=operation.transition('save');
  operation.transition('save_error',{
    requestId:first.requestId,
    errorCode:'TEMPORARY_WRITE_FAILURE',
    recoverable:true,
  });
  const second=operation.transition('retry');
  const current=operation.transition('save_success',{
    requestId:second.requestId,
    data:{record:{id:'p-3',name:'Current'}},
  });

  assert.throws(
    ()=>operation.transition('forbid',{requestId:first.requestId}),
    error=>error.code==='DASHBOARD_OPERATION_STALE_RESPONSE',
  );
  assert.deepEqual(operation.snapshot(),current);
});

test('legacy table views map into operation vocabulary without changing table output',()=>{
  assert.equal(dashboardOperationStateFromTableView(createTableView({loading:true})),'loading');
  assert.equal(dashboardOperationStateFromTableView(createTableView({rows:[]})),'empty');
  assert.equal(dashboardOperationStateFromTableView(createTableView({rows:[{id:'1'}]})),'ready');
  assert.equal(dashboardOperationStateFromTableView(createTableView({error:'failed'})),'error');
  assert.equal(dashboardOperationStateFromTableView(createTableView({permissionDenied:true})),'forbidden');
  assert.deepEqual(createTableView({permissionDenied:true}),{state:'permission',rows:[]});
  assert.throws(
    ()=>dashboardOperationStateFromTableView({state:'unknown'}),
    error=>error.code==='DASHBOARD_TABLE_STATE_UNSUPPORTED',
  );
});
