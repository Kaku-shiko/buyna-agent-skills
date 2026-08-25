import test from 'node:test';
import assert from 'node:assert/strict';
import {createNodePostgresAdapter} from '../adapters/node-postgres.mjs';

test('node-postgres list builds parameterized SQL with mandatory project and seller predicates',async()=>{
  let query;
  const pool={async query(text,values){query={text,values};return{rows:[{id:'p1',total_count:'1'}]}}};
  const adapter=createNodePostgresAdapter({pool,entities:{products:{table:'products',filters:{status:'status'},sort:{created_at:'created_at'}}}});

  const result=await adapter.list({entity:'products',scope:{projectId:'project-a',sellerId:'seller-a'},filters:{status:'active'},sort:{field:'created_at',direction:'desc'},limit:20,offset:0});

  assert.match(query.text,/"project_id" = \$1 AND "seller_id" = \$2/);
  assert.match(query.text,/"status" = \$3/);
  assert.match(query.text,/ORDER BY "created_at" DESC/);
  assert.deepEqual(query.values,['project-a','seller-a','active',20,0]);
  assert.deepEqual(result,{rows:[{id:'p1'}],total:1});
});

test('node-postgres create injects scope columns and maps only configured write fields',async()=>{
  let query;
  const pool={async query(text,values){query={text,values};return{rows:[{id:'p1'}]}}};
  const adapter=createNodePostgresAdapter({pool,entities:{products:{table:'products',write:{name:'name',price:'price'}}}});

  const row=await adapter.create({entity:'products',scope:{projectId:'project-a',sellerId:'seller-a'},data:{name:'Tea',price:1200}});

  assert.match(query.text,/INSERT INTO "products" \("project_id","seller_id","name","price"\)/);
  assert.deepEqual(query.values,['project-a','seller-a','Tea',1200]);
  assert.equal(row.id,'p1');
});

test('node-postgres transaction rolls back and releases the connection after failure',async()=>{
  const calls=[];
  const connection={async query(text){calls.push(text)},release(){calls.push('release')}};
  const pool={async query(){},async connect(){return connection}};
  const adapter=createNodePostgresAdapter({pool,entities:{}});

  await assert.rejects(()=>adapter.transaction(async()=>{throw new Error('write failed')}),/write failed/);
  assert.deepEqual(calls,['BEGIN','ROLLBACK','release']);
});

test('locked row lookup uses one scoped parameterized FOR UPDATE query',async()=>{
  let query;
  const pool={async query(text,values){query={text,values};return{rows:[{id:'p1'}]}}};
  const adapter=createNodePostgresAdapter({pool,entities:{products:{table:'merchant.products',idColumn:'product_id'}}});
  const row=await adapter.getByIdForUpdate({entity:'products',id:'p1',scope:{projectId:'project-a',sellerId:'seller-a'}});
  assert.match(query.text,/FROM "merchant"\."products"/);
  assert.match(query.text,/"product_id" = \$1 AND "project_id" = \$2 AND "seller_id" = \$3/);
  assert.match(query.text,/FOR UPDATE$/);
  assert.deepEqual(query.values,['p1','project-a','seller-a']);
  assert.equal(row.id,'p1');
});

test('locked full scoped list has no limit and locks rows in canonical id order',async()=>{
  let query;
  const pool={async query(text,values){query={text,values};return{rows:[{id:'p1'}]}}};
  const adapter=createNodePostgresAdapter({pool,entities:{products:{table:'products',idColumn:'id',filters:{status:'status'}}}});
  const rows=await adapter.listAllForUpdate({entity:'products',scope:{projectId:'project-a',sellerId:'seller-a'},filters:{status:'active'}});
  assert.match(query.text,/"project_id" = \$1 AND "seller_id" = \$2 AND "status" = \$3/);
  assert.match(query.text,/ORDER BY "id" ASC FOR UPDATE$/);
  assert.doesNotMatch(query.text,/LIMIT|OFFSET/);
  assert.deepEqual(query.values,['project-a','seller-a','active']);
  assert.deepEqual(rows,{rows:[{id:'p1'}]});
});

test('locking transaction uses one client, serializable isolation, commit, and release',async()=>{
  const calls=[];
  const connection={
    async query(text,values){
      calls.push([text,values]);
      if(text.startsWith('SELECT'))return{rows:[{id:'p1'}]};
      return{rows:[]};
    },
    release(){calls.push(['release'])},
  };
  const pool={async query(){throw new Error('pool query must not run inside lock')},async connect(){calls.push(['connect']);return connection}};
  const adapter=createNodePostgresAdapter({pool,entities:{products:{table:'products'}}});
  const row=await adapter.lockingTransaction(tx=>tx.getByIdForUpdate({entity:'products',id:'p1',scope:{projectId:'project-a',sellerId:'seller-a'}}));
  assert.equal(row.id,'p1');
  assert.equal(calls[0][0],'connect');
  assert.equal(calls[1][0],'BEGIN ISOLATION LEVEL SERIALIZABLE');
  assert.match(calls[2][0],/FOR UPDATE$/);
  assert.equal(calls[3][0],'COMMIT');
  assert.equal(calls[4][0],'release');
});

test('locking transaction rolls back and releases on failure',async()=>{
  const calls=[];
  const connection={async query(text){calls.push(text);return{rows:[]}},release(){calls.push('release')}};
  const pool={async query(){},async connect(){return connection}};
  const adapter=createNodePostgresAdapter({pool,entities:{}});
  await assert.rejects(()=>adapter.lockingTransaction(async()=>{throw new Error('locked write failed')}),/locked write failed/);
  assert.deepEqual(calls,['BEGIN ISOLATION LEVEL SERIALIZABLE','ROLLBACK','release']);
});

test('locked reads reject configured identifier injection before querying',async()=>{
  let queried=false;
  const pool={async query(){queried=true;return{rows:[]}}};
  const unsafeTable=createNodePostgresAdapter({pool,entities:{products:{table:'products; DROP TABLE products'}}});
  const unsafeFilter=createNodePostgresAdapter({pool,entities:{products:{table:'products',filters:{status:'status; DROP'}}}});
  await assert.rejects(()=>unsafeTable.getByIdForUpdate({entity:'products',id:'p1',scope:{projectId:'p',sellerId:'s'}}),error=>error.code==='INVALID_SQL_IDENTIFIER');
  await assert.rejects(()=>unsafeFilter.listAllForUpdate({entity:'products',scope:{projectId:'p',sellerId:'s'},filters:{status:'active'}}),error=>error.code==='INVALID_SQL_IDENTIFIER');
  assert.equal(queried,false);
});
