export const DASHBOARD_NAVIGATION=Object.freeze([
  {key:'dashboard',label:'仪表盘',href:'/seller',icon:'▦'},
  {key:'products',label:'商品管理',href:'/seller/products',icon:'◇'},
  {key:'categories',label:'分类管理',href:'/seller/categories',icon:'☰'},
  {key:'orders',label:'订单',href:'/seller/orders',icon:'▤'},
  {key:'paidCustomers',label:'付费客户',href:'/seller/paid-customers',icon:'✦'},
  {key:'paymentSettings',label:'支付/订阅设置',href:'/seller/settings/payment',icon:'◇'},
]);
const column=(key,label,options={})=>Object.freeze({key,label,...options});
export const DASHBOARD_TABLES=Object.freeze({
  products:{columns:[column('sortOrder','排序',{compact:true}),column('image','图片'),column('name','商品'),column('category','分类'),column('price','价格',{align:'right'}),column('stock','库存',{align:'right'}),column('visibility','状态'),column('actions','操作',{align:'right'})]},
  categories:{columns:[column('sortOrder','排序',{compact:true}),column('name','分类'),column('visibility','状态'),column('productCount','商品数',{align:'right'}),column('actions','操作',{align:'right'})]},
  orders:{columns:[column('orderNumber','订单号'),column('customer','客户'),column('amount','金额',{align:'right'}),column('paymentMethod','支付方式'),column('status','状态'),column('createdAt','时间'),column('actions','操作',{align:'right'})]},
  paidCustomers:{columns:[column('customer','客户'),column('contact','联系方式'),column('orderNumber','订单'),column('amount','金额',{align:'right'}),column('paidAt','支付时间'),column('actions','操作',{align:'right'})]},
});
export const DASHBOARD_METRICS=Object.freeze([
  {key:'activeProducts',label:'在售商品'},
  {key:'pendingOrders',label:'待支付'},
  {key:'paidOrders',label:'已支付订单'},
  {key:'paidCustomers',label:'付费客户'},
]);
const commonStates=Object.freeze(['loading','empty','ready','error','permission']);
export const DASHBOARD_PAGES=Object.freeze({
  dashboard:{metrics:['activeProducts','pendingOrders','paidOrders','paidCustomers'],sections:['quickLinks','recentOrders','lowStock'],states:commonStates},
  products:{table:'products',filters:['search','status','category'],actions:['create','edit','archive','visibility','images','inventory','reorder'],states:commonStates},
  categories:{table:'categories',filters:['search','visibility'],actions:['create','edit','archive','visibility','reorder'],states:commonStates},
  orders:{table:'orders',filters:['search','status','month'],actions:['detail','refreshPayments','exportCsv'],states:commonStates},
  paidCustomers:{table:'paidCustomers',filters:['search','month'],actions:['detail','exportCsv','contact'],states:commonStates},
  paymentSettings:{sections:['connectionStatus','enabledMethods','notifyUrl','returnUrl','merchantPortal','buynaSubscription'],actions:['validateConfiguration'],states:['loading','unconfigured','configured','subscriptionUnavailable','error','permission'],ownership:['projectId','sellerId'],subscriptionAccess:'server_only_read'},
});
export function createTableView(input={}){
  if(input.loading)return{state:'loading',rows:[]};
  if(input.permissionDenied)return{state:'permission',rows:[]};
  if(input.error)return{state:'error',rows:[],error:String(input.error)};
  const rows=Array.isArray(input.rows)?input.rows:[];
  if(!rows.length)return{state:'empty',rows:[]};
  const page=Math.max(Number.isInteger(Number(input.page))?Number(input.page):1,1);
  const pageSize=Math.min(Math.max(Number.isInteger(Number(input.pageSize))?Number(input.pageSize):20,1),100);
  const total=Math.max(Number(input.total)||rows.length,0);
  return{state:'ready',rows,page,pageSize,total,totalPages:Math.ceil(total/pageSize)};
}
