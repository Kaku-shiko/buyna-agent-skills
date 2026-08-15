import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSimpleYaml,validateResourceRecord} from './validate-resource-record.mjs';

const evidence={version:1,checked_at:'2026-08-15T00:00:00Z',evidence_source:'aws-inspection'};

test('accepts an existing shared RDS project',()=>{
  const result=validateResourceRecord({record:evidence,project:{id:'shop',seller_id:'seller'},architecture:{type:'shared_ec2_postgresql'},domains:{primary:'shop.example'},database:{mode:'existing',engine:'postgresql',instance_identifier:'shared-prod-postgres',name:'commerce',schema:'shop',connection_source:'DATABASE_URL',allow_create_rds:false,allow_create_database:false,allow_create_schema:false},storage:{mode:'existing',provider:'s3',bucket:'shared-assets',prefix:'projects/shop/sellers/seller/',allow_create_bucket:false},deployment:{mode:'existing',provider:'ec2',instance_id:'i-existing',allow_create_instance:false}});
  assert.equal(result.status,'pass');
});

test('accepts a BlueSequoia-like serverless project without forcing RDS or EC2',()=>{
  const result=validateResourceRecord({record:evidence,project:{id:'blue',seller_id:'blue'},architecture:{type:'aws_serverless'},domains:{primary:'blue.example'},database:{mode:'existing',engine:'dynamodb',region:'ap-northeast-1',table_names:'commerce,cache',allow_create_database:false},storage:{mode:'existing',provider:'s3',region:'ap-northeast-1',bucket_names:'assets,images',allow_create_bucket:false},deployment:{mode:'existing',provider:'lambda_open_next',region:'ap-northeast-1',function_names:'server,image',allow_create_instance:false},routing:{provider:'cloudfront',distribution_id:'E123',origin_evidence:'distribution-export',function_association_evidence:'behavior-export',allow_create_distribution:false}});
  assert.equal(result.status,'pass');
});

test('accepts verified local EBS storage without inventing an S3 bucket',()=>{
  const result=validateResourceRecord({record:evidence,project:{id:'legacy',seller_id:'legacy'},architecture:{type:'shared_ec2_postgresql'},domains:{primary:'legacy.example'},database:{mode:'existing',engine:'postgresql',instance_identifier:'shared-prod-postgres',name:'commerce',schema:'legacy',connection_source:'DATABASE_URL',allow_create_rds:false,allow_create_database:false,allow_create_schema:false},storage:{mode:'existing',provider:'local_ebs',root_source:'APP_UPLOAD_ROOT',migration_status:'retained'},deployment:{mode:'existing',provider:'ec2',instance_id:'i-existing',allow_create_instance:false}});
  assert.equal(result.status,'pass');
});

test('unknown required serverless values remain blocked',()=>{
  const result=validateResourceRecord({record:{version:1,checked_at:'unknown',evidence_source:'unknown'},project:{id:'blue',seller_id:'blue'},architecture:{type:'aws_serverless'},domains:{primary:'unknown'},database:{mode:'existing',engine:'dynamodb',region:'unknown',table_names:'unknown',allow_create_database:false},storage:{mode:'existing',provider:'s3',region:'unknown',bucket_names:'unknown',allow_create_bucket:false},deployment:{mode:'existing',provider:'lambda_open_next',region:'unknown',function_names:'unknown',allow_create_instance:false},routing:{provider:'cloudfront',distribution_id:'unknown',origin_evidence:'unknown',function_association_evidence:'unknown',allow_create_distribution:false}});
  assert.equal(result.status,'blocked');
  assert.ok(result.errors.includes('DISTRIBUTION_ID_MISSING'));
});

test('blocks confused identifiers, unapproved schema creation, and embedded secrets',()=>{
  const record=parseSimpleYaml(`record: {version: 1, checked_at: 2026-08-15, evidence_source: audit}\nproject: {id: shop, seller_id: seller}\narchitecture: {type: shared_ec2_postgresql}\ndomains: {primary: shop.example}\ndatabase:\n  mode: existing\n  engine: postgresql\n  instance_identifier: shared-prod-postgres\n  name: shared-prod-postgres\n  schema: shop\n  connection_source: postgresql://user:password@example/db\n  allow_create_rds: false\n  allow_create_database: false\n  allow_create_schema: true\nstorage:\n  mode: existing\n  bucket: assets\n  prefix: projects/shop/\n  allow_create_bucket: false\ndeployment:\n  mode: existing\n  provider: ec2\n  instance_id: i-existing\n  allow_create_instance: false`);
  const result=validateResourceRecord(record);
  assert.equal(result.status,'blocked');
  assert.ok(result.errors.includes('RDS_IDENTIFIER_USED_AS_DATABASE_NAME'));
  assert.ok(result.errors.includes('SCHEMA_CREATION_NOT_APPROVED'));
  assert.ok(result.errors.includes('SECRET_VALUE_FORBIDDEN'));
});
