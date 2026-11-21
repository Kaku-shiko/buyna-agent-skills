import test from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionState, quoteDisplay, catalog } from '../src/model.mjs';

test('missing or failed lookup never becomes an unregistered merchant', () => {
  assert.equal(subscriptionState(null).key, 'unknown');
  assert.equal(subscriptionState({found:false}).key, 'not_started');
  assert.equal(subscriptionState({status:'active'}).key, 'service_active');
  assert.equal(subscriptionState({status:'active'}).autoRenew, null);
});
test('renewal requires explicit authoritative enablement', () => {
  assert.equal(subscriptionState({status:'active',billingEnabled:true,agreementStatus:'ACTIVE'}).key,'subscribed');
  assert.equal(subscriptionState({status:'active',billingEnabled:true}).key,'service_active');
  assert.equal(subscriptionState({status:'active',billingEnabled:true,agreementStatus:'ACTIVE',cancelAtPeriodEnd:true}).key,'cancel_scheduled');
  assert.equal(subscriptionState({status:'past_due'}).key,'payment_failed');
  assert.equal(subscriptionState({status:'pending_binding'}).key,'pending');
  assert.equal(subscriptionState({status:'cancelled'}).key,'ended');
  assert.equal(subscriptionState({status:'surprise'}).key,'unknown');
});
test('display estimates include discounts and whole-yen tax without setup fees', () => {
  assert.equal(quoteDisplay('basic',1).gross,4378);
  assert.equal(quoteDisplay('basic',6).gross,24954);
  assert.equal(quoteDisplay('basic',12).gross,47282);
  assert.equal(quoteDisplay('pro',1).gross,6578);
  assert.equal(quoteDisplay('pro',6).gross,37494);
  assert.equal(quoteDisplay('pro',12).gross,71042);
  assert.throws(()=>quoteDisplay('other',1));
  assert.throws(()=>quoteDisplay('basic',3));
  assert.equal(catalog.payee,'Buyna');
  assert.equal(catalog.paymentExecution,'official_service_only');
});
