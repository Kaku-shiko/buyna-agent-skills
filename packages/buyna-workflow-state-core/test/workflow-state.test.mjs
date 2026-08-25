import test from 'node:test';
import assert from 'node:assert/strict';
import {approveGate,authorizeWorkPackage,blockGate,completeAuthorizedGate,createWorkflow,getInteractionPolicy,markNotApplicable,recordDelivery,rejectGate,requestApproval,resumeGate,setInteractionMode,startGate} from '../src/index.mjs';
import * as workflowCore from '../src/index.mjs';
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
  assert.equal(state.configuration.interactionMode,'team');
});

test('initial interaction mode is validated and later changes are recorded',()=>{
  const developer=createWorkflow({projectId:'developer-shop',interactionMode:'developer'});
  assert.equal(developer.configuration.interactionMode,'developer');
  const changed=setInteractionMode({state:developer,mode:'team',selectedBy:'colleague',now:'2026-08-15T00:05:00.000Z'});
  assert.equal(changed.state.configuration.interactionMode,'team');
  assert.equal(changed.event.event,'interaction_mode_selected');
  assert.equal(changed.event.previousMode,'developer');
  assert.throws(()=>createWorkflow({projectId:'invalid-shop',interactionMode:'expert'}),/INTERACTION_MODE_INVALID/);
});

test('team interaction policy hides implementation detail without weakening gates',()=>{
  const policy=getInteractionPolicy({state:createWorkflow({projectId:'team-shop'})});
  assert.equal(policy.mode,'team');
  assert.equal(policy.showTechnicalEvidence,false);
  assert.equal(policy.showResourceIdentifiers,false);
  assert.equal(policy.maxActionQuestionsPerTurn,1);
  assert.equal(policy.canBypassApproval,false);
  assert.equal(policy.canCreateInfrastructure,false);
  assert.equal(policy.canExposeSecrets,false);
});

test('developer interaction policy adds sanitized evidence but no extra authority',()=>{
  const policy=getInteractionPolicy({state:createWorkflow({projectId:'dev-shop',interactionMode:'developer'})});
  assert.equal(policy.showInternalStatusCodes,true);
  assert.equal(policy.showRawCommands,true);
  assert.equal(policy.showTechnicalEvidence,true);
  assert.equal(policy.canBypassApproval,false);
  assert.equal(policy.canCreateInfrastructure,false);
  assert.equal(policy.canExposeSecrets,false);
});

test('legacy workflow without an interaction mode safely renders as team mode',()=>{
  const state=createWorkflow({projectId:'legacy-shop'});
  delete state.configuration.interactionMode;
  assert.equal(getInteractionPolicy({state}).mode,'team');
});

test('a gate advances only through start delivery approval request and explicit approval',()=>{
  let state=createWorkflow({projectId:'shop-one',now:'2026-08-15T00:00:00.000Z'});
  state=startGate({state,gate:'customer_intake',now:'2026-08-15T00:01:00.000Z'}).state;
  state=recordDelivery({state,gate:'customer_intake',delivery:{record:'workflow/records/customer-intake.json',capabilities:{siteType:'content',requiresDashboard:false,requiresCart:false,requiresCheckout:false,requiresPayment:false,requiresBooking:false}},now:'2026-08-15T00:02:00.000Z'}).state;
  state=requestApproval({state,gate:'customer_intake',now:'2026-08-15T00:03:00.000Z'}).state;
  state=approveGate({state,gate:'customer_intake',approvedBy:'user',now:'2026-08-15T00:04:00.000Z'}).state;
  assert.equal(state.gates.customer_intake.status,'approved');
  assert.equal(state.gates.design_and_structure.status,'ready');
  assert.equal(state.currentGate,'design_and_structure');
});

test('one bounded work-package approval completes execution gates without repeated confirmation',()=>{
  let state=createWorkflow({projectId:'fast-shop'});
  state=startGate({state,gate:'customer_intake'}).state;
  state=recordDelivery({state,gate:'customer_intake',delivery:{record:'intake.json',capabilities:{siteType:'content',requiresDashboard:false,requiresCart:false,requiresCheckout:false,requiresPayment:false,requiresBooking:false}}}).state;
  state=requestApproval({state,gate:'customer_intake'}).state;
  state=approveGate({state,gate:'customer_intake',approvedBy:'user'}).state;
  state=startGate({state,gate:'design_and_structure'}).state;
  state=recordDelivery({state,gate:'design_and_structure',delivery:{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'}}).state;
  state=requestApproval({state,gate:'design_and_structure'}).state;
  state=approveGate({state,gate:'design_and_structure',approvedBy:'user'}).state;

  state=authorizeWorkPackage({
    state,
    gates:['frontend_code','dashboard_integration','checkout_payment','testing_upload_gate'],
    authorizedBy:'user',
    scope:'deliver approved website capabilities and minimum verification',
  }).state;

  state=startGate({state,gate:'frontend_code'}).state;
  state=recordDelivery({state,gate:'frontend_code',delivery:{deliveredFiles:['index.html'],verification:['PASS'],interfaceContract:'contract.json'}}).state;
  state=completeAuthorizedGate({state,gate:'frontend_code'}).state;
  assert.equal(state.gates.frontend_code.status,'approved');
  assert.equal(state.gates.frontend_code.approvalMode,'work_package');
  assert.equal(state.currentGate,'dashboard_integration');

  state=markNotApplicable({state,gate:'dashboard_integration',reason:'content site'}).state;
  state=markNotApplicable({state,gate:'checkout_payment',reason:'no checkout or payment'}).state;
  assert.equal(state.currentGate,'testing_upload_gate');
});

test('work-package approval cannot include intake design or production release',()=>{
  const state=createWorkflow({projectId:'bounded-shop'});
  for(const gate of ['customer_intake','design_and_structure','aws_release']){
    assert.throws(()=>authorizeWorkPackage({state,gates:[gate],authorizedBy:'user',scope:'too broad'}),/WORK_PACKAGE_GATE_REQUIRES_EXPLICIT_APPROVAL/);
  }
});

test('an authorized gate still requires complete delivery evidence',()=>{
  let state=createWorkflow({projectId:'evidence-shop'});
  state.gates.customer_intake.status='approved';
  state.gates.design_and_structure.status='approved';
  state.gates.frontend_code.status='ready';
  state.currentGate='frontend_code';
  state=authorizeWorkPackage({state,gates:['frontend_code'],authorizedBy:'user',scope:'frontend delivery'}).state;
  state=startGate({state,gate:'frontend_code'}).state;
  state=recordDelivery({state,gate:'frontend_code',delivery:{deliveredFiles:[],verification:[],interfaceContract:''}}).state;
  assert.throws(()=>completeAuthorizedGate({state,gate:'frontend_code'}),/FRONTEND_DELIVERY_EVIDENCE_MISSING/);
});

function completeGate(state,gate,delivery){
  state=startGate({state,gate}).state;
  state=recordDelivery({state,gate,delivery}).state;
  state=requestApproval({state,gate}).state;
  return approveGate({state,gate,approvedBy:'user'}).state;
}

const contentCapabilities={siteType:'content',requiresDashboard:false,requiresCart:false,requiresCheckout:false,requiresPayment:false,requiresBooking:false};
const commerceCapabilities={siteType:'commerce',requiresDashboard:true,requiresCart:true,requiresCheckout:true,requiresPayment:true,requiresBooking:false};
const intake=(capabilities=contentCapabilities)=>({record:'workflow/records/customer-intake.json',capabilities});

test('frontend code cannot request approval without files passing checks and an interface contract',()=>{
  let state=createWorkflow({projectId:'shop-two'});
  state=completeGate(state,'customer_intake',intake());
  state=completeGate(state,'design_and_structure',{designRecord:'workflow/records/design.json',pageStructure:'workflow/records/page-structure.json',boardStatus:'delivered'});
  state=startGate({state,gate:'frontend_code'}).state;
  state=recordDelivery({state,gate:'frontend_code',delivery:{deliveredFiles:[],verification:[],interfaceContract:''}}).state;
  assert.throws(()=>requestApproval({state,gate:'frontend_code'}),/FRONTEND_DELIVERY_EVIDENCE_MISSING/);
});

test('dashboard integration stays incomplete until every required slice has code and passing verification',()=>{
  let state=createWorkflow({projectId:'shop-three',dashboardSlices:['merchant_identity','products','orders']});
  state=completeGate(state,'customer_intake',intake(commerceCapabilities));
  state=completeGate(state,'design_and_structure',{designRecord:'workflow/records/design.json',pageStructure:'workflow/records/page-structure.json',boardStatus:'delivered'});
  state=completeGate(state,'frontend_code',{deliveredFiles:['src/index.tsx'],verification:[{status:'passed'}],interfaceContract:'workflow/records/frontend-contract.json'});
  state=startGate({state,gate:'dashboard_integration'}).state;
  state=recordDelivery({state,gate:'dashboard_integration',delivery:{completedSlices:['merchant_identity','products'],frontendFiles:['src/api.ts'],backendFiles:['server.ts'],verification:[{status:'passed'}]}}).state;
  assert.throws(()=>requestApproval({state,gate:'dashboard_integration'}),/DASHBOARD_SLICES_INCOMPLETE/);
});

test('only dashboard and payment gates may be marked not applicable with a reason',()=>{
  let state=createWorkflow({projectId:'static-site'});
  state=completeGate(state,'customer_intake',intake());
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
  state=recordDelivery({state,gate:'customer_intake',delivery:{record:'brief.md',capabilities:contentCapabilities}}).state;
  state=requestApproval({state,gate:'customer_intake'}).state;
  state=rejectGate({state,gate:'customer_intake',feedback:'fix address',rejectedBy:'customer'}).state;
  assert.equal(state.gates.customer_intake.status,'in_progress');
});

test('one passing check cannot hide a failed check',()=>{
  let state=createWorkflow({projectId:'strict-checks'});
  state=completeGate(state,'customer_intake',intake());
  state=completeGate(state,'design_and_structure',{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'});
  state=startGate({state,gate:'frontend_code'}).state;
  state=recordDelivery({state,gate:'frontend_code',delivery:{deliveredFiles:['index.html'],interfaceContract:'contract.json',verification:[{status:'PASS'},{status:'FAIL'}]}}).state;
  assert.throws(()=>requestApproval({state,gate:'frontend_code'}),/FRONTEND_DELIVERY_EVIDENCE_MISSING/);
});

test('capabilities prevent skipping required commerce gates',()=>{
  let state=createWorkflow({projectId:'commerce-shop'});
  state=completeGate(state,'customer_intake',intake(commerceCapabilities));
  state=completeGate(state,'design_and_structure',{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'});
  state=completeGate(state,'frontend_code',{deliveredFiles:['app.tsx'],verification:['PASS'],interfaceContract:'contract.json'});
  assert.throws(()=>markNotApplicable({state,gate:'dashboard_integration',reason:'skip'}),/DASHBOARD_REQUIRED/);
});

test('release evidence follows architecture and requires all zero-create counters',()=>{
  const base={releaseVersion:'v1',newEc2Instances:0,newDatabases:0,newBuckets:0,newPorts:0,verifiedUrls:['https://example.com'],health:'passed',rollback:'s3://rollback'};
  for(const delivery of [
    {...base,architectureType:'shared_ec2_postgresql',targetInstance:'i-existing',runtimeRoute:'unix:/run/shop.sock'},
    {...base,architectureType:'aws_serverless',distributionId:'E123',functionOrApiIds:['fn'],dataStoreIds:['table']},
    {...base,architectureType:'aws_static',distributionId:'E456',bucketName:'existing-bucket'},
  ]){
    let state=createWorkflow({projectId:`release-${delivery.architectureType}`});
    state.gates.aws_release.status='in_progress';state.currentGate='aws_release';
    state=recordDelivery({state,gate:'aws_release',delivery}).state;
    assert.equal(requestApproval({state,gate:'aws_release'}).state.gates.aws_release.status,'waiting_for_approval');
  }
  let state=createWorkflow({projectId:'bad-release'});
  state.gates.aws_release.status='in_progress';state.currentGate='aws_release';
  state=recordDelivery({state,gate:'aws_release',delivery:{...base,newBuckets:1,architectureType:'aws_static',distributionId:'E456',bucketName:'existing-bucket'}}).state;
  assert.throws(()=>requestApproval({state,gate:'aws_release'}),/RELEASE_DELIVERY_EVIDENCE_MISSING/);
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

const verifiedApproval=(gate)=>({
  record:`workflow/records/${gate}-approval.json`,
  approvedBy:'customer',
  approvedAt:'2026-08-25T01:00:00.000Z',
  decision:'approved',
});

const importedHistory=(capabilities=commerceCapabilities)=>[
  {gate:'customer_intake',delivery:intake(capabilities),approval:verifiedApproval('customer_intake')},
  {gate:'design_and_structure',delivery:{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'},approval:verifiedApproval('design_and_structure')},
  {gate:'frontend_code',delivery:{deliveredFiles:['app.tsx'],verification:['PASS'],interfaceContract:'contract.json'},approval:verifiedApproval('frontend_code')},
  {gate:'dashboard_integration',delivery:{completedSlices:[],frontendFiles:['dashboard.tsx'],backendFiles:['server.mjs'],verification:['PASS']},approval:verifiedApproval('dashboard_integration')},
];

test('verified history import validates canonical evidence and advances directly to the requested gate',()=>{
  assert.equal(typeof workflowCore.importVerifiedHistory,'function');
  const transition=workflowCore.importVerifiedHistory({
    state:createWorkflow({projectId:'recovered-shop'}),
    requestedGate:'checkout_payment',
    imports:importedHistory(),
    importedBy:'operator',
    now:'2026-08-25T02:00:00.000Z',
  });
  assert.equal(transition.state.currentGate,'checkout_payment');
  assert.equal(transition.state.gates.checkout_payment.status,'ready');
  assert.deepEqual(transition.events.map(({event,gate})=>[event,gate??null]),[
    ['verified_gate_history_imported','customer_intake'],
    ['verified_gate_history_imported','design_and_structure'],
    ['verified_gate_history_imported','frontend_code'],
    ['verified_gate_history_imported','dashboard_integration'],
    ['verified_history_imported',null],
  ]);
  assert.equal(transition.event.event,'verified_history_imported');
  assert.equal(transition.state.gates.frontend_code.approvalMode,'imported_verified_evidence');
  assert.equal(transition.state.configuration.paymentArchitecture,'fixed-cores');
});

test('history import rejects chat assertions, missing approval evidence, and noncanonical order atomically',()=>{
  assert.equal(typeof workflowCore.importVerifiedHistory,'function');
  const original=createWorkflow({projectId:'unsafe-import'}),snapshot=structuredClone(original);
  assert.throws(()=>workflowCore.importVerifiedHistory({state:original,requestedGate:'design_and_structure',imports:[{gate:'customer_intake',chatAssertion:'customer said complete'}],importedBy:'operator'}),/VERIFIED_DELIVERY_EVIDENCE_REQUIRED/);
  assert.throws(()=>workflowCore.importVerifiedHistory({state:original,requestedGate:'design_and_structure',imports:[{gate:'customer_intake',delivery:intake(),approval:{approvedBy:'customer'}}],importedBy:'operator'}),/VERIFIED_APPROVAL_EVIDENCE_REQUIRED/);
  assert.throws(()=>workflowCore.importVerifiedHistory({
    state:original,
    requestedGate:'frontend_code',
    imports:[
      {gate:'design_and_structure',delivery:{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'},approval:verifiedApproval('design_and_structure')},
      {gate:'customer_intake',delivery:intake(),approval:verifiedApproval('customer_intake')},
    ],
    importedBy:'operator',
  }),/HISTORY_IMPORT_ORDER_INVALID/);
  assert.deepEqual(original,snapshot);
});

test('one file-store transition appends the complete verified import event batch',async()=>{
  assert.equal(typeof workflowCore.importVerifiedHistory,'function');
  const root=await mkdtemp(path.join(tmpdir(),'buyna-workflow-import-'));
  try{
    const initial=createWorkflow({projectId:'persisted-recovery',now:'2026-08-25T00:00:00.000Z'});
    await initializeWorkflow({projectRoot:root,state:initial,now:'2026-08-25T00:00:00.000Z'});
    const transition=workflowCore.importVerifiedHistory({state:initial,requestedGate:'checkout_payment',imports:importedHistory(),importedBy:'operator',now:'2026-08-25T02:00:00.000Z'});
    await saveTransition({projectRoot:root,transition});
    const persisted=await loadWorkflow({projectRoot:root});
    const history=(await readFile(path.join(root,'workflow','history','workflow-events.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(persisted.currentGate,'checkout_payment');
    assert.equal(history.length,1+transition.events.length);
    assert.deepEqual(history.slice(1).map(event=>event.event),transition.events.map(event=>event.event));
  }finally{await rm(root,{recursive:true,force:true})}
});

test('no-provider product checkout requires checkout-flow evidence but no settlement evidence',()=>{
  assert.equal(typeof workflowCore.importVerifiedHistory,'function');
  const noPaymentCapabilities={...commerceCapabilities,requiresPayment:false};
  let state=workflowCore.importVerifiedHistory({state:createWorkflow({projectId:'no-provider-checkout'}),requestedGate:'checkout_payment',imports:importedHistory(noPaymentCapabilities),importedBy:'operator'}).state;
  state=startGate({state,gate:'checkout_payment'}).state;
  state=recordDelivery({state,gate:'checkout_payment',delivery:{pendingOrder:true,checkoutFlowVerified:true,verification:['PASS']}}).state;
  state=requestApproval({state,gate:'checkout_payment'}).state;
  assert.equal(state.gates.checkout_payment.status,'waiting_for_approval');
});

test('provider payment checkout requires exact amount and currency reconciliation',()=>{
  assert.equal(typeof workflowCore.importVerifiedHistory,'function');
  let state=workflowCore.importVerifiedHistory({state:createWorkflow({projectId:'provider-checkout'}),requestedGate:'checkout_payment',imports:importedHistory(),importedBy:'operator'}).state;
  state=startGate({state,gate:'checkout_payment'}).state;
  state=recordDelivery({state,gate:'checkout_payment',delivery:{pendingOrder:true,routingVerified:true,statusSyncVerified:true,idempotencyVerified:true,gmvOutboxVerified:true,verification:['PASS']}}).state;
  assert.throws(()=>requestApproval({state,gate:'checkout_payment'}),/PAYMENT_DELIVERY_EVIDENCE_MISSING/);
  state=recordDelivery({state,gate:'checkout_payment',delivery:{paymentArchitecture:'fixed-cores',scope:{projectId:'provider-checkout',sellerId:'seller-1'},pendingOrder:true,checkoutFlowVerified:true,routingVerified:true,statusSyncVerified:true,idempotencyVerified:true,gmvOutboxVerified:true,verification:['PASS']}}).state;
  assert.throws(()=>requestApproval({state,gate:'checkout_payment'}),/PAYMENT_DELIVERY_EVIDENCE_MISSING/);
  state=recordDelivery({state,gate:'checkout_payment',delivery:{paymentArchitecture:'fixed-cores',scope:{projectId:'provider-checkout',sellerId:'seller-1'},pendingOrder:true,checkoutFlowVerified:true,amountCurrencyReconciled:true,routingVerified:true,statusSyncVerified:true,idempotencyVerified:true,gmvOutboxVerified:true,verification:['PASS']}}).state;
  state=requestApproval({state,gate:'checkout_payment'}).state;
  assert.equal(state.gates.checkout_payment.status,'waiting_for_approval');
});
