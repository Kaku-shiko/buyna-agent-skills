import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSimpleYaml,validateResourceRecord} from './inspect-existing-resources.mjs';
import {validateMigration} from './validate-migration.mjs';

test('resource inspection accepts only confirmed existing PostgreSQL and blocks create permissions',()=>{
  const valid=validateResourceRecord({
    project:{id:'shop-a',seller_id:'seller-a'},
    database:{mode:'existing',engine:'postgresql',instance_identifier:'shared-prod-postgres',connection_source:'DATABASE_URL',name:'shared',schema:'shop_a',allow_create_rds:false,allow_create_database:false,allow_create_schema:false},
    storage:{mode:'existing',bucket_source:'AWS_STORAGE_BUCKET_NAME',region:'ap-northeast-1',prefix:'projects/shop-a/',allow_create_bucket:false},
    deployment:{instance_id:'i-existing',instance_ip:'35.73.127.215',allow_create_instance:false,allow_create_port:false},
    release_limits:{new_ec2_instances:0,new_databases:0,new_buckets:0,new_ports:0},
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
  allow_create_schema: false
storage:
  mode: existing
  bucket_source: AWS_STORAGE_BUCKET_NAME
  region: ap-northeast-1
  prefix: projects/shop-a/
  allow_create_bucket: false
deployment:
  instance_id: i-existing
  instance_ip: 35.73.127.215
  allow_create_instance: false
  allow_create_port: false
release_limits:
  new_ec2_instances: 0
  new_databases: 0
  new_buckets: 0
  new_ports: 0`);
  assert.equal(validateResourceRecord(record).status,'pass');
});

test('resource inspection blocks placeholders and infrastructure creation',()=>{
  const result=validateResourceRecord({project:{id:'placeholder',seller_id:'seller'},database:{mode:'existing',engine:'postgresql',instance_identifier:'unknown',connection_source:'DATABASE_URL',name:'shared',schema:'shop',allow_create_rds:false,allow_create_database:false,allow_create_schema:false},storage:{mode:'existing',bucket_source:'AWS_STORAGE_BUCKET_NAME',region:'ap-northeast-1',prefix:'projects/shop/',allow_create_bucket:false},deployment:{instance_id:'i-existing',instance_ip:'35.73.127.215',allow_create_instance:false,allow_create_port:true},release_limits:{new_ec2_instances:1,new_databases:0,new_buckets:0,new_ports:1}});
  assert.equal(result.status,'blocked');
  assert.ok(result.errors.includes('PROJECT_ID_MISSING_OR_UNCONFIRMED'));
  assert.ok(result.errors.includes('PORT_CREATION_NOT_DISABLED'));
  assert.ok(result.errors.includes('NEW_EC2_INSTANCES_NOT_ZERO'));
});

test('migration inspection requires rollback and blocks replacement database or fallback technology',()=>{
  assert.equal(validateMigration({upSql:'ALTER TABLE orders ADD COLUMN project_id text;',downSql:'ALTER TABLE orders DROP COLUMN project_id;'}).status,'pass');
  const invalid=validateMigration({upSql:'CREATE DATABASE replacement; -- sqlite fallback -- supabase',downSql:''});
  assert.equal(invalid.status,'blocked');
  assert.deepEqual(invalid.errors,['CREATE_DATABASE_FORBIDDEN','SQLITE_FORBIDDEN','SUPABASE_FORBIDDEN','ROLLBACK_MISSING']);
});
