function fail(code){const error=new Error(code);error.code=code;throw error}
function required(value,code){if(!String(value??'').trim())fail(code);return String(value).trim()}
function method(owner,name){if(typeof owner?.[name]!=='function')fail(`MISSING_ADAPTER_${name.toUpperCase()}`)}
function integer(value,fallback){const parsed=Number(value);return Number.isInteger(parsed)&&parsed>0?parsed:fallback}
function allowedObject(value,allowed,code){
  const input=value??{};
  for(const key of Object.keys(input))if(!allowed.includes(key))fail(code);
  return input;
}

function createCore({adapter,scope,maxPageSize,lockingContext=false}){
  function policyValues(policy={}){
    return{
      entity:required(policy.entity,'MISSING_ENTITY'),
      allowedFilters:policy.allowedFilters??[],
      allowedSort:policy.allowedSort??[],
      allowedWrite:policy.allowedWrite??[],
    };
  }

  function writes({entity,allowedWrite}){
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
    };
  }

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
          const result=await work(createCore({adapter:txAdapter,scope,maxPageSize}));
          await txAdapter.completeIdempotency({scope:{...scope},key,operation,result});
          return{applied:true,result};
        });
      },
    },
    async transaction(work){
      method(adapter,'transaction');
      if(typeof work!=='function')fail('MISSING_TRANSACTION_WORK');
      return adapter.transaction(txAdapter=>work(createCore({adapter:txAdapter,scope,maxPageSize})));
    },
    async lockingTransaction(work){
      method(adapter,'lockingTransaction');
      if(typeof work!=='function')fail('MISSING_LOCKING_TRANSACTION_WORK');
      return adapter.lockingTransaction(txAdapter=>work(createCore({adapter:txAdapter,scope,maxPageSize,lockingContext:true})));
    },
    lockingRepository(policy={}){
      if(!lockingContext)fail('LOCKING_REPOSITORY_REQUIRES_TRANSACTION');
      const values=policyValues(policy);
      return{
        ...writes(values),
        async getByIdForUpdate(id){
          method(adapter,'getByIdForUpdate');
          return adapter.getByIdForUpdate({entity:values.entity,id:required(id,'MISSING_RECORD_ID'),scope:{...scope}});
        },
        async listAllForUpdate(input={}){
          const filters=allowedObject(input.filters,values.allowedFilters,'FILTER_NOT_ALLOWED');
          method(adapter,'listAllForUpdate');
          const result=await adapter.listAllForUpdate({entity:values.entity,scope:{...scope},filters});
          return result?.rows??[];
        },
      };
    },
    repository(policy={}){
      const values=policyValues(policy);
      return{
        ...writes(values),
        async getById(id){
          method(adapter,'getById');
          return adapter.getById({entity:values.entity,id:required(id,'MISSING_RECORD_ID'),scope:{...scope}});
        },
        async list(input={}){
          method(adapter,'list');
          const page=integer(input.page,1);
          const pageSize=Math.min(integer(input.pageSize,20),maxPageSize);
          const filters=allowedObject(input.filters,values.allowedFilters,'FILTER_NOT_ALLOWED');
          let sort=null;
          if(input.sort){
            if(!values.allowedSort.includes(input.sort.field))fail('SORT_NOT_ALLOWED');
            const direction=String(input.sort.direction??'asc').toLowerCase();
            if(!['asc','desc'].includes(direction))fail('SORT_DIRECTION_INVALID');
            sort={field:input.sort.field,direction};
          }
          const result=await adapter.list({entity:values.entity,scope:{...scope},filters,sort,limit:pageSize,offset:(page-1)*pageSize});
          const total=Number(result?.total??0);
          return{items:result?.rows??[],page,pageSize,total,totalPages:Math.ceil(total/pageSize)};
        },
      };
    },
  };
}

export function createMerchantDataCore({adapter,projectId,sellerId,maxPageSize=100}={}){
  const scope={projectId:required(projectId,'MISSING_PROJECT_ID'),sellerId:required(sellerId,'MISSING_SELLER_ID')};
  if(!adapter)fail('MISSING_DATABASE_ADAPTER');
  return createCore({adapter,scope,maxPageSize});
}
