import test from 'node:test';
import assert from 'node:assert/strict';
import {DASHBOARD_NAVIGATION,DASHBOARD_PAGES,DASHBOARD_TABLES,createTableView,dashboardDrawerReducer,validateDashboardTheme} from '../src/index.mjs';

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
