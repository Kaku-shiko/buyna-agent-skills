function fail(code){const error=new Error(code);error.code=code;throw error}
function required(value,code){if(!String(value??'').trim())fail(code);return String(value).trim()}
function method(owner,name){if(typeof owner?.[name]!=='function')fail(`MISSING_ADAPTER_${name.toUpperCase()}`)}
function integer(value,fallback){const parsed=Number(value);return Number.isInteger(parsed)&&parsed>0?parsed:fallback}
function allowedObject(value,allowed,code){
  const input=value??{};
  for(const key of Object.keys(input))if(!allowed.includes(key))fail(code);
  return input;
}

export function createMerchantDataCore({adapter,projectId,sellerId,maxPageSize=100}={}){
  const scope={projectId:required(projectId,'MISSING_PROJECT_ID'),sellerId:required(sellerId,'MISSING_SELLER_ID')};
  if(!adapter)fail('MISSING_DATABASE_ADAPTER');

  return{
    scope:Object.freeze({...scope}),
    idempotency:{
      async run(input={},work){
        method(adapter,'transaction');
        const key=required(input.key,'MISSING_IDEMPOTENCY_KEY');
        const operation=required(input.operation,'MISSING_IDEMPOTENCY_OPERATION');
        if(typeof work!=='function')fail('MISSING_IDEMPOTENCY_WORK');
        return adapter.transaction(async txAdapter=>{
          method(txAdapter,'claimIdempotency');
          method(txAdapter,'completeIdempotency');
          const claim=await txAdapter.claimIdempotency({scope:{...scope},key,operation});
          if(!claim?.claimed)return{applied:false,result:claim?.result??null};
          const result=await work(createMerchantDataCore({adapter:txAdapter,projectId:scope.projectId,sellerId:scope.sellerId,maxPageSize}));
          await txAdapter.completeIdempotency({scope:{...scope},key,operation,result});
          return{applied:true,result};
        });
      },
    },
    async transaction(work){
      method(adapter,'transaction');
      if(typeof work!=='function')fail('MISSING_TRANSACTION_WORK');
      return adapter.transaction(txAdapter=>work(createMerchantDataCore({adapter:txAdapter,projectId:scope.projectId,sellerId:scope.sellerId,maxPageSize})));
    },
    repository(policy={}){
      const entity=required(policy.entity,'MISSING_ENTITY');
      const allowedFilters=policy.allowedFilters??[];
      const allowedSort=policy.allowedSort??[];
      const allowedWrite=policy.allowedWrite??[];
      return{
        async create(data={}){
          method(adapter,'create');
          const safeData=allowedObject(data,allowedWrite,'WRITE_FIELD_NOT_ALLOWED');
          return adapter.create({entity,scope:{...scope},data:{...safeData}});
        },
        async updateById(id,data={}){
          method(adapter,'updateById');
          const safeData=allowedObject(data,allowedWrite,'WRITE_FIELD_NOT_ALLOWED');
          return adapter.updateById({entity,id:required(id,'MISSING_RECORD_ID'),scope:{...scope},data:{...safeData}});
        },
        async getById(id){
          method(adapter,'getById');
          return adapter.getById({entity,id:required(id,'MISSING_RECORD_ID'),scope:{...scope}});
        },
        async list(input={}){
          method(adapter,'list');
          const page=integer(input.page,1);
          const pageSize=Math.min(integer(input.pageSize,20),maxPageSize);
          const filters=allowedObject(input.filters,allowedFilters,'FILTER_NOT_ALLOWED');
          let sort=null;
          if(input.sort){
            if(!allowedSort.includes(input.sort.field))fail('SORT_NOT_ALLOWED');
            const direction=String(input.sort.direction??'asc').toLowerCase();
            if(!['asc','desc'].includes(direction))fail('SORT_DIRECTION_INVALID');
            sort={field:input.sort.field,direction};
          }
          const result=await adapter.list({entity,scope:{...scope},filters,sort,limit:pageSize,offset:(page-1)*pageSize});
          const total=Number(result?.total??0);
          return{items:result?.rows??[],page,pageSize,total,totalPages:Math.ceil(total/pageSize)};
        },
      };
    },
  };
}
