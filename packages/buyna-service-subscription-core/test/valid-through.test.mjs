import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSubscriptionSnapshot} from '../src/snapshot.server.mjs';
import {reminderFromSnapshot} from '../ui/subscription-reminder.mjs';
const identity={projectId:'asuka-shop',sellerId:'asuka',shopId:'default'};
const end='2026-10-23T15:00:00.000Z';
const row={...identity,subscriptionId:'legacy',checkoutFlow:'legacy_service_v1',planCode:'pro',planName:'Pro',status:'cancel_at_period_end',billingEnabled:false,currentPeriodStart:'2026-07-22T15:00:00.000Z',currentPeriodEnd:end};
test('inclusive service date never changes actual expiry or renewal calculations',()=>{
 const snapshot=createSubscriptionSnapshot({identity,rows:[row],service:{...identity,endAt:end,validThrough:'2026-10-23'},now:new Date('2026-10-21T00:00:00Z')});
 assert.equal(snapshot.serviceValidThrough,'2026-10-23');assert.equal(snapshot.service.currentPeriodEnd,end);assert.equal(snapshot.renewal.enabled,false);
 const notice=reminderFromSnapshot(snapshot,new Date('2026-10-21T00:00:00Z'),identity);assert.equal(notice.endAt,end);assert.equal(notice.displayEndAt,'2026-10-23T00:00:00+09:00');
});
test('stale inclusive date disappears when a service period changes',()=>{
 const next='2026-11-23T15:00:00.000Z';const snapshot=createSubscriptionSnapshot({identity,rows:[{...row,currentPeriodEnd:next}],service:{...identity,endAt:next,validThrough:'2026-10-23'}});
 assert.equal(snapshot.serviceValidThrough,undefined);assert.equal(snapshot.service.currentPeriodEnd,next);
});
