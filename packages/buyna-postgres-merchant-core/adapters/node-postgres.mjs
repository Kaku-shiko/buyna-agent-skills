function fail(code){const error=new Error(code);error.code=code;throw error}
function quoteName(value){
  const parts=String(value??'').split('.');
  if(!parts.length||parts.some(part=>!/^[A-Za-z_][A-Za-z0-9_]*$/.test(part)))fail('INVALID_SQL_IDENTIFIER');
  return parts.map(part=>`"${part}"`).join('.');
}
function entityConfig(entities,name){const config=entities?.[name];if(!config)fail('ENTITY_NOT_CONFIGURED');return config}
function scopeConfig(config){return{project:config.scopeColumns?.projectId??'project_id',seller:config.scopeColumns?.sellerId??'seller_id'}}

export function createNodePostgresAdapter({pool,entities,idempotencyTable='merchant_idempotency'}={}){
  if(typeof pool?.query!=='function')fail('INVALID_POSTGRES_CLIENT');

  function create(client){
    return{
      async create(input){
        const config=entityConfig(entities,input.entity),scope=scopeConfig(config),entries=Object.entries(input.data??{});
        if(!entries.length)fail('WRITE_DATA_REQUIRED');
        const columns=[scope.project,scope.seller],values=[input.scope.projectId,input.scope.sellerId];
        for(const [field,value] of entries){const column=config.write?.[field];if(!column)fail('WRITE_FIELD_NOT_CONFIGURED');columns.push(column);values.push(value)}
        const placeholders=values.map((_,index)=>`$${index+1}`);
        const result=await client.query(`INSERT INTO ${quoteName(config.table)} (${columns.map(quoteName).join(',')}) VALUES (${placeholders.join(',')}) RETURNING *`,values);
        return result.rows[0]??null;
      },
      async updateById(input){
        const config=entityConfig(entities,input.entity),scope=scopeConfig(config),idColumn=config.idColumn??'id',entries=Object.entries(input.data??{});
        if(!entries.length)fail('WRITE_DATA_REQUIRED');
        const values=[];
        const assignments=entries.map(([field,value])=>{const column=config.write?.[field];if(!column)fail('WRITE_FIELD_NOT_CONFIGURED');values.push(value);return`${quoteName(column)} = $${values.length}`});
        values.push(input.id,input.scope.projectId,input.scope.sellerId);
        const result=await client.query(`UPDATE ${quoteName(config.table)} SET ${assignments.join(',')} WHERE ${quoteName(idColumn)} = $${values.length-2} AND ${quoteName(scope.project)} = $${values.length-1} AND ${quoteName(scope.seller)} = $${values.length} RETURNING *`,values);
        return result.rows[0]??null;
      },
      async list(input){
        const config=entityConfig(entities,input.entity),scope=scopeConfig(config);
        const values=[input.scope.projectId,input.scope.sellerId];
        const where=[`${quoteName(scope.project)} = $1`,`${quoteName(scope.seller)} = $2`];
        for(const [field,value] of Object.entries(input.filters??{})){
          const column=config.filters?.[field];if(!column)fail('FILTER_NOT_CONFIGURED');
          values.push(value);where.push(`${quoteName(column)} = $${values.length}`);
        }
        let order='';
        if(input.sort){const column=config.sort?.[input.sort.field];if(!column)fail('SORT_NOT_CONFIGURED');order=` ORDER BY ${quoteName(column)} ${input.sort.direction.toUpperCase()}`}
        values.push(input.limit,input.offset);
        const text=`SELECT *, COUNT(*) OVER() AS total_count FROM ${quoteName(config.table)} WHERE ${where.join(' AND ')}${order} LIMIT $${values.length-1} OFFSET $${values.length}`;
        const result=await client.query(text,values);
        const total=Number(result.rows[0]?.total_count??0);
        return{rows:result.rows.map(({total_count,...row})=>row),total};
      },
      async getById(input){
        const config=entityConfig(entities,input.entity),scope=scopeConfig(config),idColumn=config.idColumn??'id';
        const text=`SELECT * FROM ${quoteName(config.table)} WHERE ${quoteName(idColumn)} = $1 AND ${quoteName(scope.project)} = $2 AND ${quoteName(scope.seller)} = $3 LIMIT 1`;
        const result=await client.query(text,[input.id,input.scope.projectId,input.scope.sellerId]);
        return result.rows[0]??null;
      },
      async transaction(work){
        if(typeof client.connect!=='function')fail('TRANSACTION_REQUIRES_POOL');
        const connection=await client.connect();
        try{await connection.query('BEGIN');const result=await work(create(connection));await connection.query('COMMIT');return result}
        catch(error){await connection.query('ROLLBACK');throw error}
        finally{connection.release()}
      },
      async claimIdempotency(input){
        const table=quoteName(idempotencyTable);
        const inserted=await client.query(`INSERT INTO ${table} (project_id,seller_id,idempotency_key,operation,status) VALUES ($1,$2,$3,$4,'processing') ON CONFLICT (project_id,seller_id,idempotency_key,operation) DO NOTHING RETURNING idempotency_key`,[input.scope.projectId,input.scope.sellerId,input.key,input.operation]);
        if(inserted.rowCount>0)return{claimed:true,result:null};
        const existing=await client.query(`SELECT status,result_json FROM ${table} WHERE project_id=$1 AND seller_id=$2 AND idempotency_key=$3 AND operation=$4`,[input.scope.projectId,input.scope.sellerId,input.key,input.operation]);
        return{claimed:false,result:existing.rows[0]?.result_json??null,status:existing.rows[0]?.status??null};
      },
      async completeIdempotency(input){
        await client.query(`UPDATE ${quoteName(idempotencyTable)} SET status='completed',result_json=$5,completed_at=NOW() WHERE project_id=$1 AND seller_id=$2 AND idempotency_key=$3 AND operation=$4`,[input.scope.projectId,input.scope.sellerId,input.key,input.operation,input.result??null]);
      },
    };
  }
  return create(pool);
}
