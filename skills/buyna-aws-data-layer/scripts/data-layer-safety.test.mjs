import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSimpleYaml,validateResourceRecord} from './inspect-existing-resources.mjs';
import {validateMigration} from './validate-migration.mjs';

test('resource inspection accepts only confirmed existing PostgreSQL and blocks create permissions',()=>{
  const valid=validateResourceRecord({
    project:{id:'shop-a',seller_id:'seller-a'},
    database:{mode:'existing',engine:'postgresql',instance_identifier:'shared-prod-postgres',connection_source:'DATABASE_URL',name:'shared',schema:'shop_a',allow_create_rds:false,allow_create_database:false},
    storage:{mode:'existing',bucket_source:'AWS_STORAGE_BUCKET_NAME',region:'ap-northeast-1',prefix:'projects/shop-a/',allow_create_bucket:false},
    deployment:{instance_ip:'35.73.127.215',allow_create_instance:false},
  });
  assert.equal(valid.status,'pass');
  assert.equal(JSON.stringify(valid).includes('DATABASE_URL='),false);

  const invalid=validateResourceRecord({project:{id:'shop-a',seller_id:'seller-a'},database:{mode:'existing',engine:'postgresql',instance_identifier:'shared-prod-postgres',connection_source:'DATABASE_URL',name:'shared',schema:'shop_a',allow_create_rds:false,allow_create_database:true}});
  assert.equal(invalid.status,'blocked');
  assert.ok(invalid.errors.includes('DATABASE_CREATION_NOT_DISABLED'));
});

test('resource inspection parses the approved nested YAML record without reading secrets',()=>{
  const record=parseSimpleYaml(`project: {id: shop-a, seller_id: seller-a}
database:
  mode: existing
  engine: postgresql
  instance_identifier: shared-prod-postgres
  connection_source: DATABASE_URL
  name: shared
  schema: shop_a
  allow_create_rds: false
  allow_create_database: false
storage:
  mode: existing
  bucket_source: AWS_STORAGE_BUCKET_NAME
  allow_create_bucket: false
deployment:
  allow_create_instance: false`);
  assert.equal(validateResourceRecord(record).status,'pass');
});

test('migration inspection requires rollback and blocks replacement database or fallback technology',()=>{
  assert.equal(validateMigration({upSql:'ALTER TABLE orders ADD COLUMN project_id text;',downSql:'ALTER TABLE orders DROP COLUMN project_id;'}).status,'pass');
  const invalid=validateMigration({upSql:'CREATE DATABASE replacement; -- sqlite fallback -- supabase',downSql:''});
  assert.equal(invalid.status,'blocked');
  assert.deepEqual(invalid.errors,['CREATE_DATABASE_FORBIDDEN','SQLITE_FORBIDDEN','SUPABASE_FORBIDDEN','ROLLBACK_MISSING']);
});
