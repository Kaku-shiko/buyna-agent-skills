import test from 'node:test';
import assert from 'node:assert/strict';
import {DASHBOARD_NAVIGATION,DASHBOARD_PAGES,DASHBOARD_TABLES,createTableView} from '../src/dashboard-model.mjs';
test('product merchant navigation contains exactly the approved six pages in order',()=>{
  assert.deepEqual(DASHBOARD_NAVIGATION.map(item=>[item.key,item.label,item.href]),[
    ['dashboard','仪表盘','/seller'],['products','商品管理','/seller/products'],['categories','分类管理','/seller/categories'],['orders','订单','/seller/orders'],['paidCustomers','付费客户','/seller/paid-customers'],['paymentSettings','支付/订阅设置','/seller/settings/payment'],
  ]);
});
test('fixed tables preserve the fields used by existing merchant cases',()=>{
  assert.deepEqual(DASHBOARD_TABLES.products.columns.map(column=>column.key),['sortOrder','image','name','category','price','stock','visibility','actions']);
  assert.deepEqual(DASHBOARD_TABLES.orders.columns.map(column=>column.key),['orderNumber','customer','amount','paymentMethod','status','createdAt','actions']);
  assert.deepEqual(DASHBOARD_TABLES.paidCustomers.columns.map(column=>column.key),['customer','contact','orderNumber','amount','paidAt','actions']);
});
test('table view clamps pagination and exposes loading empty error and ready states',()=>{
  assert.equal(createTableView({loading:true}).state,'loading');assert.equal(createTableView({error:'读取失败'}).state,'error');assert.equal(createTableView({rows:[]}).state,'empty');
  assert.deepEqual(createTableView({rows:[{id:'1'}],page:3,pageSize:500,total:201}),{state:'ready',rows:[{id:'1'}],page:3,pageSize:100,total:201,totalPages:3});
});
test('payment and subscription settings remain one approved dashboard page',()=>{
  assert.deepEqual(DASHBOARD_PAGES.paymentSettings.sections,['connectionStatus','enabledMethods','notifyUrl','returnUrl','merchantPortal','buynaSubscription']);
  assert.deepEqual(DASHBOARD_PAGES.paymentSettings.states,['loading','unconfigured','configured','error','permission']);
});
