import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSubscriptionSnapshot} from '../src/snapshot.server.mjs';
import {assertSubscriptionIdentity,defineSubscriptionIntegration} from '../src/integration.mjs';

const identity={projectId:'bluesequoia',sellerId:'seller-bluesequoia',shopId:'default'};
const config=defineSubscriptionIntegration({identity,domain:'bluesequia.buyna.ai'});
// Midnight is a fixture boundary only, not an approved live debit timestamp.
const row={...identity,subscriptionId:'fixture-blue-legacy',checkoutFlow:'legacy_service_v1',status:'active',currentPeriodStart:'2026-08-03T00:00:00+09:00',currentPeriodEnd:'2026-11-03T00:00:00+09:00',billingEnabled:false};
const snapshot=(extra={})=>createSubscriptionSnapshot({identity,rows:[row],charges:[],now:new Date('2026-10-19T00:00:00+09:00'),...extra});

test('BlueSequoia preserves its legacy dates without inventing card payments or renewal authority',()=>{
 const view=assertSubscriptionIdentity(snapshot(),config);
 const japanDate=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date(value));
 assert.equal(japanDate(view.service.currentPeriodStart),'2026-08-03');
 assert.equal(japanDate(view.service.currentPeriodEnd),'2026-11-03');
 assert.equal(view.renewal.enabled,false);
 assert.equal(view.renewal.nextBillingAt,null);
 assert.equal(view.renewal.nextAmountGross,null);
 assert.equal(view.payment.status,'LEGACY_PREPAID');
 assert.deepEqual(view.billingHistory,[]);
 assert.equal(view.service.enforcementEnabled,false);
});

test('BlueSequoia cannot consume EC snapshots or silently reset missing dates',()=>{
 assert.throws(()=>assertSubscriptionIdentity({...snapshot(),identity:{projectId:'ectecshop',sellerId:'ectecshop',shopId:'default'}},config),/IDENTITY_MISMATCH/);
 const unknown=snapshot({rows:[],service:{...identity,reviewStatus:'MIGRATION_REVIEW'}});
 assert.equal(unknown.review.required,true);
 assert.equal(unknown.service.currentPeriodEnd,null);
 assert.equal(unknown.renewal.enabled,false);
});
