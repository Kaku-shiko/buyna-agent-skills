// Reusable PostgreSQL adapter. Inject core policy and the registered pool/schema.
export function createPostgresStorageQuota({pool,schema,resolvePlan,merchantStorageQuota,assertStorageCapacity}={}){
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  if(!pool?.connect||!/^[a-z_][a-z0-9_]{0,62}$/.test(schema??'')||typeof resolvePlan!=='function'||typeof merchantStorageQuota!=='function'||typeof assertStorageCapacity!=='function')fail('STORAGE_QUOTA_NOT_CONFIGURED');
  const accounts=`"${schema}".merchant_storage_accounts`,objects=`"${schema}".merchant_storage_objects`;
  const bytes=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)fail('INVALID_STORAGE_USAGE');return n;};
  function scopeIds(scope){if(!scope||![scope.projectId,scope.sellerId].every(x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(x)))fail('INVALID_STORAGE_SCOPE');return [scope.projectId,scope.sellerId];}
  async function transaction(scope,work){
    const ids=scopeIds(scope),c=await pool.connect();
    try{await c.query('BEGIN');const r=await c.query(`SELECT used_bytes,reserved_bytes FROM ${accounts} WHERE project_id=$1 AND seller_id=$2 FOR UPDATE`,ids);
      if(!r.rows.length)fail('STORAGE_USAGE_NOT_INITIALIZED');
      const account={usedBytes:bytes(r.rows[0].used_bytes),reservedBytes:bytes(r.rows[0].reserved_bytes)};
      const result=await work(c,ids,account);await c.query('COMMIT');return result;
    }catch(error){try{await c.query('ROLLBACK');}catch{}throw error;}finally{c.release();}
  }
  const validRequest=x=>{if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(x.requestKey??'')||typeof x.objectKey!=='string'||!Number.isSafeInteger(x.size)||x.size<=0)fail('INVALID_STORAGE_RESERVATION');const ids=scopeIds(x.scope);if(!x.objectKey.startsWith(`projects/${ids[0]}/sellers/${ids[1]}/`)||x.objectKey.includes('..'))fail('OBJECT_KEY_OUTSIDE_MERCHANT_SCOPE');};
  return {
    async status(scope){return transaction(scope,async(c,ids,usage)=>merchantStorageQuota({plan:await resolvePlan({...scope}),...usage}));},
    async reserve(input){validRequest(input);return transaction(input.scope,async(c,ids,usage)=>{
      const previous=await c.query(`SELECT object_key,size_bytes,status FROM ${objects} WHERE project_id=$1 AND seller_id=$2 AND request_key=$3`,[...ids,input.requestKey]);
      if(previous.rows.length){const p=previous.rows[0];if(p.object_key!==input.objectKey||bytes(p.size_bytes)!==input.size)fail('STORAGE_REQUEST_CONFLICT');if(p.status==='deleted')fail('STORAGE_REQUEST_CLOSED');return {replayed:true,status:p.status};}
      const quota=assertStorageCapacity({plan:await resolvePlan({...input.scope}),...usage,additionalBytes:input.size});
      await c.query(`INSERT INTO ${objects}(project_id,seller_id,request_key,object_key,size_bytes,status) VALUES($1,$2,$3,$4,$5,'reserved')`,[...ids,input.requestKey,input.objectKey,input.size]);
      await c.query(`UPDATE ${accounts} SET reserved_bytes=reserved_bytes+$3 WHERE project_id=$1 AND seller_id=$2`,[...ids,input.size]);
      return {replayed:false,status:'reserved',limitBytes:quota.limitBytes};
    });},
    async confirm(input){validRequest(input);return transaction(input.scope,async(c,ids)=>{
      const r=await c.query(`SELECT object_key,size_bytes,status FROM ${objects} WHERE project_id=$1 AND seller_id=$2 AND request_key=$3`,[...ids,input.requestKey]);
      const row=r.rows[0];if(!row||row.object_key!==input.objectKey||bytes(row.size_bytes)!==input.size)fail('STORAGE_RESERVATION_NOT_FOUND');
      if(row.status==='confirmed')return {replayed:true};if(row.status!=='reserved')fail('STORAGE_REQUEST_CLOSED');
      await c.query(`UPDATE ${accounts} SET reserved_bytes=reserved_bytes-$3,used_bytes=used_bytes+$3 WHERE project_id=$1 AND seller_id=$2`,[...ids,input.size]);
      await c.query(`UPDATE ${objects} SET status='confirmed' WHERE project_id=$1 AND seller_id=$2 AND request_key=$3`,[...ids,input.requestKey]);return {replayed:false};
    });},
    // Cleanup worker only: call AFTER reference checks and confirmed physical deletion.
    async releaseDeletedObject({scope,objectKey}){return transaction(scope,async(c,ids)=>{
      const r=await c.query(`SELECT request_key,size_bytes,status FROM ${objects} WHERE project_id=$1 AND seller_id=$2 AND object_key=$3`,[...ids,objectKey]);
      const row=r.rows[0];if(!row)fail('STORAGE_OBJECT_NOT_FOUND');if(row.status==='deleted')return {replayed:true};
      const column=row.status==='reserved'?'reserved_bytes':'used_bytes';
      await c.query(`UPDATE ${accounts} SET ${column}=${column}-$3 WHERE project_id=$1 AND seller_id=$2`,[...ids,bytes(row.size_bytes)]);
      await c.query(`UPDATE ${objects} SET status='deleted' WHERE project_id=$1 AND seller_id=$2 AND request_key=$3`,[...ids,row.request_key]);return {replayed:false};
    });},
  };
}
