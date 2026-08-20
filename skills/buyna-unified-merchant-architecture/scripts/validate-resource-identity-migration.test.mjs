import test from 'node:test';
import assert from 'node:assert/strict';
import {validateResourceIdentityMigration} from './validate-resource-identity-migration.mjs';

const record=(overrides={})=>({
  record:{version:1,checked_at:'2026-08-16T00:00:00Z',evidence_source:'aws-runtime'},
  project:{id:'shop',seller_id:'seller'},architecture:{type:'shared_ec2_postgresql'},domains:{primary:'shop.example'},
  database:{mode:'existing',engine:'postgresql',instance_identifier:'legacy-postgres',connection_source:'DATABASE_URL',name:'legacy_db',schema:'shop',allow_create_rds:false,allow_create_database:false,allow_create_schema:false},
  storage:{mode:'existing',provider:'s3',bucket:'shared-assets',prefix:'projects/shop/sellers/seller/',allow_create_bucket:false},
  deployment:{mode:'existing',provider:'ec2',instance_id:'i-existing',allow_create_instance:false,allow_create_port:false},routing:{ingress:'nginx'},
  release_limits:{new_ec2_instances:0,new_databases:0,new_buckets:0,new_ports:0},...overrides
});

test('accepts a name-only migration that preserves runtime and storage identity',()=>{
  const before=record();
  const after=record({database:{...before.database,instance_identifier:'shared-postgres',name:'shared_merchants',resource_tags:{Name:'shared-postgres',Project:'shared-merchants',Environment:'production',DatabaseName:'shared_merchants'}}});
  const result=validateResourceIdentityMigration(before,after);
  assert.equal(result.status,'pass');
  assert.deepEqual(result.changes,{rdsIdentifier:true,databaseName:true});
});

test('blocks an identity migration that silently moves storage or instance',()=>{
  const before=record();
  const after=record({database:{...before.database,instance_identifier:'shared-postgres'},storage:{...before.storage,bucket:'replacement-assets'},deployment:{...before.deployment,instance_id:'i-replacement'}});
  const result=validateResourceIdentityMigration(before,after);
  assert.equal(result.status,'blocked');
  assert.ok(result.errors.includes('STORAGE_BUCKET_CHANGED'));
  assert.ok(result.errors.includes('INSTANCE_CHANGED'));
});

test('blocks a no-op plan',()=>{
  const result=validateResourceIdentityMigration(record(),record());
  assert.equal(result.status,'blocked');
  assert.ok(result.errors.includes('RESOURCE_IDENTITY_UNCHANGED'));
});
