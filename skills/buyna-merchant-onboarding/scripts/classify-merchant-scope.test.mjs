import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMerchantScope} from './classify-merchant-scope.mjs';

const identity={primaryHost:'shop.example.com',projectId:'project_alpha',sellerId:'seller_alpha'};

test('routes an explicitly independent project to onboarding',()=>{
  const result=classifyMerchantScope({...identity,intent:'new_independent'});
  assert.equal(result.route,'buyna-merchant-onboarding');
  assert.equal(result.resourceLifecycle,'candidate');
  assert.equal(result.reuseSharedFoundation,true);
  assert.equal(result.mayCreateSchemaAfterApproval,true);
});

test('routes before a new merchant identity is generated',()=>{
  const result=classifyMerchantScope({intent:'new_independent',primaryHost:'new.example.com'});
  assert.equal(result.route,'buyna-merchant-onboarding');
  assert.equal(result.projectId,null);
  assert.equal(result.sellerId,null);
  assert.equal(result.identityResolutionRequired,true);
});

test('routes only an existing migration to unified architecture',()=>{
  assert.equal(classifyMerchantScope({...identity,intent:'existing_migration'}).route,'buyna-unified-merchant-architecture');
  assert.equal(classifyMerchantScope({...identity,intent:'existing_alias'}).route,'buyna-project-resource-registry');
});

test('accepts underscores and rejects missing intent',()=>{
  assert.equal(classifyMerchantScope({...identity,intent:'new_independent'}).projectId,'project_alpha');
  assert.throws(()=>classifyMerchantScope(identity),/MERCHANT_INTENT_REQUIRED/);
});
