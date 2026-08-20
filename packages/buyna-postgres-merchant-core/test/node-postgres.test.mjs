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
