import test from 'node:test';
import assert from 'node:assert/strict';
import {approveGate,blockGate,createWorkflow,markNotApplicable,recordDelivery,rejectGate,requestApproval,resumeGate,startGate} from '../src/index.mjs';
import {initializeWorkflow,loadWorkflow,saveTransition} from '../src/file-store.mjs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('a new website workflow starts only at customer intake',()=>{
  const state=createWorkflow({projectId:'shop-one',now:'2026-08-15T00:00:00.000Z'});
  assert.equal(state.currentGate,'customer_intake');
  assert.equal(state.gates.customer_intake.status,'ready');
  assert.equal(state.gates.design_and_structure.status,'locked');
  assert.equal(state.gates.aws_release.status,'locked');
});

test('a gate advances only through start delivery approval request and explicit approval',()=>{
  let state=createWorkflow({projectId:'shop-one',now:'2026-08-15T00:00:00.000Z'});
  state=startGate({state,gate:'customer_intake',now:'2026-08-15T00:01:00.000Z'}).state;
  state=recordDelivery({state,gate:'customer_intake',delivery:{record:'workflow/records/customer-intake.json'},now:'2026-08-15T00:02:00.000Z'}).state;
  state=requestApproval({state,gate:'customer_intake',now:'2026-08-15T00:03:00.000Z'}).state;
  state=approveGate({state,gate:'customer_intake',approvedBy:'user',now:'2026-08-15T00:04:00.000Z'}).state;
  assert.equal(state.gates.customer_intake.status,'approved');
  assert.equal(state.gates.design_and_structure.status,'ready');
  assert.equal(state.currentGate,'design_and_structure');
});

function completeGate(state,gate,delivery){
  state=startGate({state,gate}).state;
  state=recordDelivery({state,gate,delivery}).state;
  state=requestApproval({state,gate}).state;
  return approveGate({state,gate,approvedBy:'user'}).state;
}

test('frontend code cannot request approval without files passing checks and an interface contract',()=>{
  let state=createWorkflow({projectId:'shop-two'});
  state=completeGate(state,'customer_intake',{record:'workflow/records/customer-intake.json'});
  state=completeGate(state,'design_and_structure',{designRecord:'workflow/records/design.json',pageStructure:'workflow/records/page-structure.json',boardStatus:'delivered'});
  state=startGate({state,gate:'frontend_code'}).state;
  state=recordDelivery({state,gate:'frontend_code',delivery:{deliveredFiles:[],verification:[],interfaceContract:''}}).state;
  assert.throws(()=>requestApproval({state,gate:'frontend_code'}),/FRONTEND_DELIVERY_EVIDENCE_MISSING/);
});

test('dashboard integration stays incomplete until every required slice has code and passing verification',()=>{
  let state=createWorkflow({projectId:'shop-three',dashboardSlices:['merchant_identity','products','orders']});
  state=completeGate(state,'customer_intake',{record:'workflow/records/customer-intake.json'});
  state=completeGate(state,'design_and_structure',{designRecord:'workflow/records/design.json',pageStructure:'workflow/records/page-structure.json',boardStatus:'delivered'});
  state=completeGate(state,'frontend_code',{deliveredFiles:['src/index.tsx'],verification:[{status:'passed'}],interfaceContract:'workflow/records/frontend-contract.json'});
  state=startGate({state,gate:'dashboard_integration'}).state;
  state=recordDelivery({state,gate:'dashboard_integration',delivery:{completedSlices:['merchant_identity','products'],frontendFiles:['src/api.ts'],backendFiles:['server.ts'],verification:[{status:'passed'}]}}).state;
  assert.throws(()=>requestApproval({state,gate:'dashboard_integration'}),/DASHBOARD_SLICES_INCOMPLETE/);
});

test('only dashboard and payment gates may be marked not applicable with a reason',()=>{
  let state=createWorkflow({projectId:'static-site'});
  state=completeGate(state,'customer_intake',{record:'workflow/records/customer-intake.json'});
  assert.throws(()=>markNotApplicable({state,gate:'design_and_structure',reason:'skip'}),/GATE_NOT_OPTIONAL/);
  state=completeGate(state,'design_and_structure',{designRecord:'workflow/records/design.json',pageStructure:'workflow/records/page-structure.json',boardStatus:'postponed'});
  state=completeGate(state,'frontend_code',{deliveredFiles:['index.html'],verification:[{status:'passed'}],interfaceContract:'workflow/records/frontend-contract.json'});
  state=markNotApplicable({state,gate:'dashboard_integration',reason:'static website'}).state;
  assert.equal(state.gates.dashboard_integration.status,'not_applicable');
  assert.equal(state.currentGate,'checkout_payment');
});

test('a blocked gate resumes and a rejected approval returns to work',()=>{
  let state=startGate({state:createWorkflow({projectId:'shop'}),gate:'customer_intake'}).state;
  state=blockGate({state,gate:'customer_intake',code:'MATERIALS',message:'waiting'}).state;
  assert.equal(state.gates.customer_intake.status,'blocked');
  state=resumeGate({state,gate:'customer_intake'}).state;
  state=recordDelivery({state,gate:'customer_intake',delivery:{record:'brief.md'}}).state;
  state=requestApproval({state,gate:'customer_intake'}).state;
  state=rejectGate({state,gate:'customer_intake',feedback:'fix address',rejectedBy:'customer'}).state;
  assert.equal(state.gates.customer_intake.status,'in_progress');
});

test('state is atomic and transition history is append only',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'buyna-workflow-'));
  try{
    const initial=createWorkflow({projectId:'shop',now:'2026-01-01T00:00:00.000Z'});
    await initializeWorkflow({projectRoot:root,state:initial,now:'2026-01-01T00:00:00.000Z'});
    const transition=startGate({state:await loadWorkflow({projectRoot:root}),gate:'customer_intake',now:'2026-01-01T00:01:00.000Z'});
    await saveTransition({projectRoot:root,transition});
    assert.equal((await loadWorkflow({projectRoot:root})).gates.customer_intake.status,'in_progress');
    const history=await readFile(path.join(root,'workflow','history','workflow-events.jsonl'),'utf8');
    assert.equal(history.trim().split('\n').length,2);
  }finally{await rm(root,{recursive:true,force:true})}
});
