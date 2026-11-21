import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resourceRoute} from './resource-route.mjs';

test('only executable visual stages select resource actions',()=>{
 for(const gate of ['design_and_structure','frontend_code','dashboard_integration','testing_upload_gate']){
  const route=resourceRoute({action:'execute',targetGate:gate});
  assert.ok(route.steps.length);assert.equal(route.grantsExternalActions,false);
  assert.equal(route.executionReadiness,'verify-at-runtime');assert.equal(route.preserveExistingDesign,true);
 }
 for(const action of ['blocked','reopen_repair','mark_not_applicable'])assert.equal(resourceRoute({action,targetGate:'frontend_code'}),null);
 for(const targetGate of ['customer_intake','checkout_payment','aws_release','toString','unknown'])assert.equal(resourceRoute({action:'execute',targetGate}),null);
});
test('each plan has independent steps so a previous task cannot change future routing',()=>{
 const request={action:'execute',targetGate:'frontend_code'};
 resourceRoute(request).steps.length=0;
 assert.deepEqual(resourceRoute(request).steps,['component-resolution','build-preview']);
});
