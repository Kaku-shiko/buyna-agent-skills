import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderService,createOrdersCsv} from '../src/order-core.mjs';

function fixture(){
  const calls=[];
  const record={id:'order-1',status:'pending_payment',paymentMethod:'wechat',total:2800,currency:'JPY',submission:[{key:'buyer_name',label:'姓名',value:'A',type:'text',order:1}]};
  const tx={async createPendingOrder(input){calls.push(['create',input]);return input},async getOrderById(input){calls.push(['tx-detail',input]);return record},async archiveOrder(input){calls.push(['archive',input]);return{...record,status:'cancelled',archivedAt:input.archivedAt}}};
  const store={async transaction(work){calls.push(['transaction']);return work(tx)},async listOrders(input){calls.push(['list',input]);return{items:[record],total:1}},async getOrderById(input){calls.push(['detail',input]);return record}};
  const service=createOrderService({store,projectId:'shop',sellerId:'seller',idGenerator:()=> 'order-1',clock:()=>new Date('2026-08-10T04:00:00.000Z')});
  return{service,calls};
}

test('pending order stores immutable item, amount, payment, and complete safe submission snapshots',async()=>{
  const {service,calls}=fixture();
  const order=await service.createPendingOrder({checkout:{items:[{productId:'p1',variantId:'v1',name:'Tea',skuCode:'M',quantity:2,unitPrice:1200,lineTotal:2400}],subtotal:2400,shipping:500,discount:100,tax:0,total:2800,currency:'JPY'},paymentMethod:'wechat',submission:[{key:'buyer_name',label:'姓名',value:'A',type:'text',order:1},{key:'notes',label:'备注',value:'门口',type:'textarea',order:2}],locale:'zh-CN',schemaVersion:'checkout-v1'});
  assert.equal(order.status,'pending_payment');
  assert.equal(order.total,2800);
  assert.equal(order.items[0].unitPrice,1200);
  assert.equal(order.submission.length,2);
  assert.deepEqual(calls.map(call=>call[0]),['transaction','create']);
});

test('seller order list/detail use fixed filters and unpaid orders can be archived',async()=>{
  const {service,calls}=fixture();
  const list=await service.listOrders({status:'pending_payment',month:'2026-08',search:'A',paymentMethod:'wechat',page:1,pageSize:20});
  const detail=await service.getOrderDetail({orderId:'order-1'});
  const archived=await service.archiveUnpaidOrder({orderId:'order-1'});
  assert.equal(list.total,1);
  assert.equal(detail.submission[0].label,'姓名');
  assert.equal(archived.status,'cancelled');
  assert.deepEqual(calls.find(call=>call[0]==='list')[1].filters,{status:'pending_payment',month:'2026-08',search:'A',paymentMethod:'wechat'});
});

test('CSV includes fixed order columns and every safe customer submission field',()=>{
  const csv=createOrdersCsv([{id:'o1',status:'paid',paymentMethod:'card',total:2800,currency:'JPY',createdAt:'2026-08-10T00:00:00Z',submission:[{key:'buyer_name',label:'姓名',value:'A, Inc.'},{key:'custom',label:'自定义问题',value:'回答'}]}]);
  assert.match(csv,/order_id,status,payment_method,total,currency,created_at,姓名,自定义问题/);
  assert.match(csv,/"A, Inc\.",回答/);
});
