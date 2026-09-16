import {test} from 'node:test';
import assert from 'node:assert/strict';
import {updateAccess,accessView,validateAccess} from '../src/index.mjs';
test('merchant confirmation does not fake verification',()=>{const r=updateAccess(null,{activation:'merchant_confirmed',reason:'Merchant confirmed'},{actor:'admin',expectedRevision:0});assert.equal(r.verification,'pending');assert.equal(accessView(r,{plan:'Basic',planStatus:'生效中'}).storageLimitBytes,524288000);});
test('optimistic concurrency rejects stale edits',()=>assert.throws(()=>updateAccess({revision:2},{},{actor:'a',expectedRevision:1}),/REVISION_CONFLICT/));
test('merchant cannot change plan or activation',()=>{for(const p of [{plan:'Pro'},{activation:'merchant_confirmed'},{credential:'secret'}])assert.throws(()=>validateAccess(p,{merchant:true}));});
test('admin cannot forge provider proof',()=>{for(const p of [{verification:'passed'},{activation:'provider_denied'}])assert.throws(()=>updateAccess(null,{...p,reason:'x'},{actor:'a',expectedRevision:0}),/PROVIDER_EVIDENCE/);});
test('environment change invalidates old confirmation',()=>{const r=updateAccess({revision:1,environment:'production',activation:'merchant_confirmed',verification:'passed'},{environment:'sandbox',reason:'switch'},{actor:'a',expectedRevision:1});assert.equal(r.activation,'unconfirmed');assert.equal(r.verification,'pending');});
test('invalid dates and expired entitlements',()=>{assert.throws(()=>validateAccess({subscriptionEnd:'2026-02-30'}));assert.equal(accessView({subscriptionEnd:'2020-01-01'},{plan:'Pro',planStatus:'生效中'}).subscriptionActive,false);});
