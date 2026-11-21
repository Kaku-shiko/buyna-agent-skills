import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defineSubscriptionIntegration, bindSubscriptionApi} from '../src/integration.mjs';
import {reminderFromSnapshot} from '../ui/subscription-reminder.mjs';

const identity = {projectId:'fixture', sellerId:'merchant', shopId:'default'};
const config = defineSubscriptionIntegration({identity, domain:'fixture.example.test'});
const snapshot = {apiVersion:'1.1', identity};
test('validates configuration and freezes merchant binding', () => {
  assert.ok(Object.isFrozen(config.identity));
  assert.throws(() => defineSubscriptionIntegration({identity:{...identity,shopId:''},domain:config.domain}));
  assert.throws(() => defineSubscriptionIntegration({identity,domain:'https://wrong.test/path'}));
});
test('read and mutation snapshots reject each mismatched identity dimension', async () => {
  for (const key of Object.keys(identity)) {
    const wrong = {...snapshot, identity:{...identity,[key]:'other'}};
    await assert.rejects(bindSubscriptionApi(async()=>wrong,config)('/api/admin/subscription-state'),/IDENTITY_MISMATCH/);
    await assert.rejects(bindSubscriptionApi(async()=>({snapshot:wrong}),config)('/api/admin/subscription-resume'),/IDENTITY_MISMATCH/);
  }
});
test('forwards exact transport request without adding browser authority', async () => {
  const options = {method:'POST',body:'{"confirm":true}'};
  const api = bindSubscriptionApi(async(path, input) => {
    assert.equal(path,'/api/admin/subscription-plan-change-cancel'); assert.equal(input,options); return {snapshot};
  },config);
  assert.equal((await api('/api/admin/subscription-plan-change-cancel', options)).snapshot,snapshot);
  await assert.rejects(api('https://other.test/'),/UNSUPPORTED/);
});
test('reminders are identity scoped and show next plan for scheduled renewal', () => {
  const state = {...snapshot,subscription:{id:'fixture-sub',planName:'Basic'},service:{status:'ACTIVE',currentPeriodEnd:'2026-10-21T00:00:00Z'},renewal:{enabled:true,nextAmountGross:6578},scheduledChange:{targetPlanName:'Pro'}};
  const now = new Date('2026-10-19T00:00:00Z');
  assert.equal(reminderFromSnapshot(state,now),null);
  assert.equal(reminderFromSnapshot(state,now,{...identity,sellerId:'other'}),null);
  assert.equal(reminderFromSnapshot(state,now,identity).plan,'Pro');
  assert.equal(reminderFromSnapshot(state,now,identity).amount,6578);
});
test('reminders start strictly below 30 days, retain dismissal key and reject invalid state',()=>{
 const now=new Date('2026-10-01T00:00:00Z');
 const state={...snapshot,subscription:{id:'sub',planName:'Basic'},service:{status:'ACTIVE',currentPeriodEnd:'2026-10-31T00:00:00Z'},renewal:{enabled:false}};
 assert.equal(reminderFromSnapshot(state,now,identity),null);
 const first=reminderFromSnapshot(state,new Date(now.getTime()+1),identity);
 assert.equal(first.status,'EXPIRING');
 assert.equal(first.key,reminderFromSnapshot(state,new Date('2026-10-29T00:00:00Z'),identity).key);
 assert.equal(reminderFromSnapshot({...state,review:{required:true}},new Date(now.getTime()+1),identity),null);
});
