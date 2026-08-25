import test from 'node:test';
import assert from 'node:assert/strict';
import {approveGate,authorizeWorkPackage,blockGate,completeAuthorizedGate,createWorkflow,getInteractionPolicy,markNotApplicable,recordDelivery,rejectGate,requestApproval,resumeGate,setInteractionMode,startGate} from '../src/index.mjs';
import * as workflowCore from '../src/index.mjs';

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
  state=completeGate(state,'customer_intake',intake());
  state=completeGate(state,'design_and_structure',{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'});
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
const intake=(capabilities=contentCapabilities,paymentArchitecture)=>({
  record:'workflow/records/customer-intake.json',
  capabilities,
  ...(paymentArchitecture?{paymentArchitecture}:{}),
});

test('Dashboard slices require a sanctioned approval transition after design evidence',()=>{
  assert.throws(
    ()=>createWorkflow({projectId:'forged-dashboard-slices',dashboardSlices:['products']}),
    /DASHBOARD_SLICES_REQUIRE_APPROVED_TRANSITION/,
  );
  let state=createWorkflow({projectId:'approved-dashboard-slices'});
  assert.throws(
    ()=>workflowCore.setApprovedDashboardSlices({state,slices:['products'],approvedBy:'user'}),
    /DASHBOARD_SLICE_DESIGN_APPROVAL_REQUIRED/,
  );
  state=completeGate(state,'customer_intake',intake(commerceCapabilities,'fixed-cores'));
  state=completeGate(state,'design_and_structure',{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'});
  const original=structuredClone(state);
  const transition=workflowCore.setApprovedDashboardSlices({
    state,
    slices:['products','orders'],
    approvedBy:'user',
    now:'2026-08-26T01:00:00.000Z',
  });
  assert.deepEqual(state,original);
  assert.deepEqual(transition.state.configuration.dashboardSlices,['products','orders']);
  assert.deepEqual(transition.state.configuration.dashboardSliceApproval,{
    slices:['products','orders'],
    approvedBy:'user',
    approvedAt:'2026-08-26T01:00:00.000Z',
    authorizationEvidence:{
      source:'workflow_transition',
      event:'dashboard_slices_approved',
      slices:['products','orders'],
      approvedBy:'user',
      approvedAt:'2026-08-26T01:00:00.000Z',
    },
  });
  assert.deepEqual(transition.event,{
    event:'dashboard_slices_approved',
    slices:['products','orders'],
    approvedBy:'user',
    at:'2026-08-26T01:00:00.000Z',
  });
  for(const mutate of [
    (record)=>{record.authorizationEvidence.approvedBy='other';},
    (record)=>{record.authorizationEvidence.slices=['products'];},
    (record)=>{record.authorizationEvidence.approvedAt='2026-08-26T01:01:00.000Z';},
    (record)=>{record.extra=true;},
  ]){
    const mismatch=structuredClone(transition.state);
    mutate(mismatch.configuration.dashboardSliceApproval);
    assert.throws(()=>workflowCore.validateWorkflowReadinessEvidence(mismatch),/HISTORICAL_GATE_EVIDENCE_INVALID/);
  }
  assert.throws(
    ()=>workflowCore.setApprovedDashboardSlices({state:transition.state,slices:['unknown_slice'],approvedBy:'user'}),
    /DASHBOARD_SLICE_INVALID/,
  );
});

test('workflow readiness rejects fabricated authorization and slice records without transition evidence',()=>{
  let state=createWorkflow({projectId:'authorization-evidence'});
  state.configuration.workPackage={
    gates:['dashboard_integration'],scope:'all Dashboard work',authorizedBy:'user',
    authorizedAt:'2026-08-26T01:00:00.000Z',completedGates:[],
  };
  assert.throws(()=>workflowCore.validateWorkflowReadinessEvidence(state),/HISTORICAL_GATE_EVIDENCE_INVALID/);

  state=createWorkflow({projectId:'slice-evidence'});
  state.configuration.dashboardSlices=['products'];
  assert.throws(()=>workflowCore.validateWorkflowReadinessEvidence(state),/HISTORICAL_GATE_EVIDENCE_INVALID/);
});

test('canonical work-package and repair transitions persist exact authorization evidence',()=>{
  let state=createWorkflow({projectId:'canonical-work-package'});
  const authorized=authorizeWorkPackage({
    state,gates:['dashboard_integration'],scope:'approved Dashboard slice',authorizedBy:'user',
    now:'2026-08-26T02:00:00.000Z',
  });
  assert.deepEqual(authorized.state.configuration.workPackage.authorizationEvidence,{
    source:'workflow_transition',event:'work_package_authorized',
    gates:['dashboard_integration'],scope:'approved Dashboard slice',
    authorizedBy:'user',authorizedAt:'2026-08-26T02:00:00.000Z',
  });
  assert.doesNotThrow(()=>workflowCore.validateWorkflowReadinessEvidence(authorized.state));
  const forged=structuredClone(authorized.state);
  delete forged.configuration.workPackage.authorizationEvidence;
  assert.throws(()=>workflowCore.validateWorkflowReadinessEvidence(forged),/HISTORICAL_GATE_EVIDENCE_INVALID/);
  for(const mutate of [
    (record)=>{record.authorizationEvidence.authorizedBy='other';},
    (record)=>{record.authorizationEvidence.scope='other scope';},
    (record)=>{record.authorizationEvidence.gates=['frontend_code'];},
    (record)=>{record.authorizationEvidence.authorizedAt='2026-08-26T02:01:00.000Z';},
    (record)=>{record.authorizationEvidence.extra=true;},
  ]){
    const mismatch=structuredClone(authorized.state);
    mutate(mismatch.configuration.workPackage);
    assert.throws(()=>workflowCore.validateWorkflowReadinessEvidence(mismatch),/HISTORICAL_GATE_EVIDENCE_INVALID/);
  }

  const completed=completedCommerceWorkflow('canonical-repair-evidence');
  const repair=workflowCore.openRepairSlice({
    state:completed,gate:'dashboard_integration',scope:'repair approved Dashboard slice',
    authorizedBy:'user',now:'2026-08-26T03:00:00.000Z',
  });
  assert.deepEqual(repair.state.activeRepair.authorizationEvidence,{
    source:'workflow_transition',event:'repair_slice_opened',gate:'dashboard_integration',
    scope:'repair approved Dashboard slice',authorizedBy:'user',authorizedAt:'2026-08-26T03:00:00.000Z',
  });
  const forgedRepair=structuredClone(repair.state);
  delete forgedRepair.activeRepair.authorizationEvidence;
  assert.throws(()=>workflowCore.validateWorkflowReadinessEvidence(forgedRepair),/COMPLETED_GATE_EVIDENCE_INVALID/);
  for(const mutate of [
    (record)=>{record.authorizationEvidence.authorizedBy='other';},
    (record)=>{record.authorizationEvidence.scope='other scope';},
    (record)=>{record.authorizationEvidence.gate='frontend_code';},
    (record)=>{record.authorizationEvidence.authorizedAt='2026-08-26T03:01:00.000Z';},
    (record)=>{record.authorizationEvidence.extra=true;},
  ]){
    const mismatch=structuredClone(repair.state);
    mutate(mismatch.activeRepair);
    assert.throws(()=>workflowCore.validateWorkflowReadinessEvidence(mismatch),/COMPLETED_GATE_EVIDENCE_INVALID/);
  }
});

test('trusted workflow provenance survives in-memory core transitions but not serialization',()=>{
  assert.equal(typeof workflowCore.isTrustedWorkflowState,'function');
  assert.equal(workflowCore.hydrateVerifiedWorkflowState,undefined);
  const created=createWorkflow({projectId:'trusted-provenance'});
  assert.equal(workflowCore.isTrustedWorkflowState(created),true);
  const authorized=authorizeWorkPackage({
    state:created,gates:['frontend_code'],scope:'approved frontend',authorizedBy:'user',
    now:'2026-08-26T04:00:00.000Z',
  }).state;
  assert.equal(workflowCore.isTrustedWorkflowState(authorized),true);

  const serialized=JSON.stringify(authorized);
  const parsed=JSON.parse(serialized);
  assert.equal(workflowCore.isTrustedWorkflowState(parsed),false);
  assert.throws(()=>startGate({state:parsed,gate:'customer_intake'}),/WORKFLOW_STATE_PROVENANCE_UNTRUSTED/);
});

test('Dashboard slice approval is limited to the ready frontend boundary',()=>{
  let state=createWorkflow({projectId:'dashboard-slice-window'});
  state=completeGate(state,'customer_intake',intake(commerceCapabilities,'fixed-cores'));
  state=completeGate(state,'design_and_structure',{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'});
  assert.equal(state.currentGate,'frontend_code');
  assert.equal(state.gates.frontend_code.status,'ready');

  const started=startGate({state,gate:'frontend_code'}).state;
  const startedSnapshot=structuredClone(started);
  assert.throws(()=>workflowCore.setApprovedDashboardSlices({
    state:started,slices:['products'],approvedBy:'user',
  }),/DASHBOARD_SLICE_SCOPE_CHANGE_REQUIRED/);
  assert.deepEqual(started,startedSnapshot);

  const completed=completedCommerceWorkflow('dashboard-slice-completed');
  const completedSnapshot=structuredClone(completed);
  assert.throws(()=>workflowCore.setApprovedDashboardSlices({
    state:completed,slices:['products'],approvedBy:'user',
  }),/DASHBOARD_SLICE_SCOPE_CHANGE_REQUIRED/);
  assert.deepEqual(completed,completedSnapshot);
});

test('lifecycle capabilities normalize once and persist through real intake approval',()=>{
  assert.equal(typeof workflowCore.normalizeWebsiteCapabilities,'function');
  const capabilities={...commerceCapabilities,requiresCatalog:true,requiresInventory:true,requiresCoupons:true};
  let state=createWorkflow({projectId:'lifecycle-persistence'});
  state=startGate({state,gate:'customer_intake'}).state;
  state=recordDelivery({state,gate:'customer_intake',delivery:intake(capabilities,'fixed-cores')}).state;
  assert.deepEqual(state.configuration.capabilities,capabilities);
  state=requestApproval({state,gate:'customer_intake'}).state;
  state=approveGate({state,gate:'customer_intake',approvedBy:'customer'}).state;
  assert.deepEqual(state.configuration.capabilities,capabilities);
});

test('lifecycle capability equality includes coupon, catalog, and inventory flags',()=>{
  const capabilities={...commerceCapabilities,requiresCatalog:true,requiresInventory:true,requiresCoupons:true};
  let state=startGate({state:createWorkflow({projectId:'lifecycle-equality'}),gate:'customer_intake'}).state;
  state=recordDelivery({state,gate:'customer_intake',delivery:intake(capabilities,'fixed-cores')}).state;
  const mismatched={...state.gates.customer_intake.delivery,capabilities:{...capabilities,requiresCoupons:false}};
  assert.throws(()=>workflowCore.validateDeliveryEvidence(state,'customer_intake',mismatched),/SITE_CAPABILITIES_MISMATCH/);
});

test('legacy mixed booking-payment state does not infer product lifecycle capabilities',()=>{
  const normalized=workflowCore.normalizeWebsiteCapabilities({
    siteType:'mixed',requiresDashboard:true,requiresCart:false,requiresCheckout:true,
    requiresPayment:true,requiresBooking:true,
  });
  assert.equal(normalized.requiresCatalog,false);
  assert.equal(normalized.requiresInventory,false);
  assert.equal(normalized.requiresCoupons,false);
});

test('lifecycle capability invariants reject impossible combinations',()=>{
  const base={...contentCapabilities,siteType:'commerce',requiresCheckout:true};
  assert.throws(()=>workflowCore.normalizeWebsiteCapabilities({...base,requiresCatalog:false,requiresInventory:true,requiresCoupons:false}),/INVENTORY_REQUIRES_CATALOG/);
  assert.throws(()=>workflowCore.normalizeWebsiteCapabilities({...base,requiresCart:true,requiresCatalog:false,requiresInventory:false,requiresCoupons:false}),/CART_REQUIRES_CATALOG/);
  assert.throws(()=>workflowCore.normalizeWebsiteCapabilities({...base,requiresCheckout:false,requiresCatalog:true,requiresInventory:false,requiresCoupons:true}),/COUPON_REQUIRES_CHECKOUT/);
});

test('frontend code cannot request approval without files passing checks and an interface contract',()=>{
  let state=createWorkflow({projectId:'shop-two'});
  state=completeGate(state,'customer_intake',intake());
  state=completeGate(state,'design_and_structure',{designRecord:'workflow/records/design.json',pageStructure:'workflow/records/page-structure.json',boardStatus:'delivered'});
  state=startGate({state,gate:'frontend_code'}).state;
  state=recordDelivery({state,gate:'frontend_code',delivery:{deliveredFiles:[],verification:[],interfaceContract:''}}).state;
  assert.throws(()=>requestApproval({state,gate:'frontend_code'}),/FRONTEND_DELIVERY_EVIDENCE_MISSING/);
});

test('dashboard integration stays incomplete until every required slice has code and passing verification',()=>{
  let state=createWorkflow({projectId:'shop-three'});
  state=completeGate(state,'customer_intake',intake(commerceCapabilities,'fixed-cores'));
  state=completeGate(state,'design_and_structure',{designRecord:'workflow/records/design.json',pageStructure:'workflow/records/page-structure.json',boardStatus:'delivered'});
  state=workflowCore.setApprovedDashboardSlices({state,slices:['merchant_identity','products','orders'],approvedBy:'user'}).state;
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
  state=completeGate(state,'customer_intake',intake(commerceCapabilities,'fixed-cores'));
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
    let state=workflowAtRelease(`release-${delivery.architectureType}`);
    state=startGate({state,gate:'aws_release'}).state;
    state=recordDelivery({state,gate:'aws_release',delivery}).state;
    assert.equal(requestApproval({state,gate:'aws_release'}).state.gates.aws_release.status,'waiting_for_approval');
  }
  let state=workflowAtRelease('bad-release');
  state=startGate({state,gate:'aws_release'}).state;
  state=recordDelivery({state,gate:'aws_release',delivery:{...base,newBuckets:1,architectureType:'aws_static',distributionId:'E456',bucketName:'existing-bucket'}}).state;
  assert.throws(()=>requestApproval({state,gate:'aws_release'}),/RELEASE_DELIVERY_EVIDENCE_MISSING/);
});

const verifiedApproval=(gate)=>({
  record:`workflow/records/${gate}-approval.json`,
  approvedBy:'customer',
  approvedAt:'2026-08-25T01:00:00.000Z',
  decision:'approved',
});

const importedHistory=(capabilities=commerceCapabilities,paymentArchitecture=capabilities.requiresPayment?'fixed-cores':undefined)=>[
  {gate:'customer_intake',delivery:intake(capabilities,paymentArchitecture),approval:verifiedApproval('customer_intake')},
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

test('verified history import persists normalized lifecycle capabilities',()=>{
  const capabilities={...commerceCapabilities,requiresCatalog:true,requiresInventory:true,requiresCoupons:true};
  const transition=workflowCore.importVerifiedHistory({
    state:createWorkflow({projectId:'recovered-lifecycle-shop'}),
    requestedGate:'checkout_payment',
    imports:importedHistory(capabilities,'fixed-cores'),
    importedBy:'operator',
  });
  assert.deepEqual(transition.state.configuration.capabilities,capabilities);
});

test('static verified history imports approved gates and capability-legitimate not-applicable gates',()=>{
  const notApplicable=(gate,reason)=>({
    gate,
    outcome:'not_applicable',
    notApplicable:{
      reason,
      record:`workflow/records/${gate}-not-applicable.json`,
      verifiedBy:'operator',
      verifiedAt:'2026-08-25T01:30:00.000Z',
    },
  });
  const transition=workflowCore.importVerifiedHistory({
    state:createWorkflow({projectId:'static-recovery'}),
    requestedGate:'testing_upload_gate',
    imports:[
      {gate:'customer_intake',delivery:intake(),approval:verifiedApproval('customer_intake')},
      {gate:'design_and_structure',delivery:{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'},approval:verifiedApproval('design_and_structure')},
      {gate:'frontend_code',delivery:{deliveredFiles:['index.html'],verification:['PASS'],interfaceContract:'contract.json'},approval:verifiedApproval('frontend_code')},
      notApplicable('dashboard_integration','static site has no dashboard'),
      notApplicable('checkout_payment','static site has no checkout'),
    ],
    importedBy:'operator',
    now:'2026-08-25T02:00:00.000Z',
  });
  assert.equal(transition.state.currentGate,'testing_upload_gate');
  assert.equal(transition.state.gates.dashboard_integration.status,'not_applicable');
  assert.equal(transition.state.gates.checkout_payment.status,'not_applicable');
  assert.equal('delivery' in transition.state.gates.dashboard_integration,false);
  assert.equal('delivery' in transition.state.gates.checkout_payment,false);
  assert.deepEqual(transition.state.gates.dashboard_integration.notApplicableEvidence,{
    source:'verified_import',
    record:'workflow/records/dashboard_integration-not-applicable.json',
    verifiedBy:'operator',
    verifiedAt:'2026-08-25T01:30:00.000Z',
  });
  assert.deepEqual(transition.events.map(event=>event.event),[
    'verified_gate_history_imported',
    'verified_gate_history_imported',
    'verified_gate_history_imported',
    'verified_gate_not_applicable_imported',
    'verified_gate_not_applicable_imported',
    'verified_history_imported',
  ]);
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

test('payment-capable intake rejects an omitted or unsupported payment architecture',()=>{
  for(const paymentArchitecture of [undefined,'implicit-legacy']){
    let state=startGate({state:createWorkflow({projectId:`architecture-${paymentArchitecture??'missing'}`}),gate:'customer_intake'}).state;
    const delivery=intake(commerceCapabilities);
    if(paymentArchitecture!==undefined)delivery.paymentArchitecture=paymentArchitecture;
    assert.throws(()=>recordDelivery({state,gate:'customer_intake',delivery}),/PAYMENT_ARCHITECTURE_(?:REQUIRED|UNSUPPORTED)/);
  }
});

test('explicit fixed and named legacy payment architectures select separate validation paths',()=>{
  const legacyDelivery={paymentArchitecture:'legacy-globepay-service',pendingOrder:true,providerQueryVerified:true,amountCurrencyReconciled:true,routingVerified:true,statusSyncVerified:true,idempotencyVerified:true,gmvOutboxVerified:true,verification:['PASS']};
  let fixedState=workflowCore.importVerifiedHistory({state:createWorkflow({projectId:'explicit-fixed'}),requestedGate:'checkout_payment',imports:importedHistory(commerceCapabilities,'fixed-cores'),importedBy:'operator'}).state;
  fixedState=startGate({state:fixedState,gate:'checkout_payment'}).state;
  fixedState=recordDelivery({state:fixedState,gate:'checkout_payment',delivery:{...legacyDelivery,paymentArchitecture:'fixed-cores'}}).state;
  assert.throws(()=>requestApproval({state:fixedState,gate:'checkout_payment'}),/PAYMENT_DELIVERY_EVIDENCE_MISSING/);

  let legacyState=workflowCore.importVerifiedHistory({state:createWorkflow({projectId:'explicit-legacy'}),requestedGate:'checkout_payment',imports:importedHistory(commerceCapabilities,'legacy-globepay-service'),importedBy:'operator'}).state;
  legacyState=startGate({state:legacyState,gate:'checkout_payment'}).state;
  legacyState=recordDelivery({state:legacyState,gate:'checkout_payment',delivery:legacyDelivery}).state;
  legacyState=requestApproval({state:legacyState,gate:'checkout_payment'}).state;
  assert.equal(legacyState.configuration.paymentArchitecture,'legacy-globepay-service');
  assert.equal(legacyState.gates.checkout_payment.status,'waiting_for_approval');
});

test('legacy payment evidence requires provider query and exact amount-currency reconciliation',()=>{
  const base={paymentArchitecture:'legacy-globepay-service',pendingOrder:true,providerQueryVerified:true,amountCurrencyReconciled:true,routingVerified:true,statusSyncVerified:true,idempotencyVerified:true,gmvOutboxVerified:true,verification:['PASS']};
  for(const missing of ['providerQueryVerified','amountCurrencyReconciled']){
    let state=workflowCore.importVerifiedHistory({state:createWorkflow({projectId:`legacy-${missing}`}),requestedGate:'checkout_payment',imports:importedHistory(commerceCapabilities,'legacy-globepay-service'),importedBy:'operator'}).state;
    state=startGate({state,gate:'checkout_payment'}).state;
    const delivery={...base};delete delivery[missing];
    state=recordDelivery({state,gate:'checkout_payment',delivery}).state;
    assert.throws(()=>requestApproval({state,gate:'checkout_payment'}),/PAYMENT_DELIVERY_EVIDENCE_MISSING/);
  }
});

test('ambiguous persisted payment workflow cannot approve checkout evidence as implicit legacy',()=>{
  let state=workflowCore.importVerifiedHistory({state:createWorkflow({projectId:'ambiguous-payment'}),requestedGate:'checkout_payment',imports:importedHistory(),importedBy:'operator'}).state;
  delete state.configuration.paymentArchitecture;
  assert.throws(()=>startGate({state,gate:'checkout_payment'}),/WORKFLOW_STATE_PROVENANCE_UNTRUSTED/);
});

const checkoutDelivery=(projectId)=>({
  paymentArchitecture:'fixed-cores',
  scope:{projectId,sellerId:'seller-1'},
  pendingOrder:true,
  checkoutFlowVerified:true,
  amountCurrencyReconciled:true,
  routingVerified:true,
  statusSyncVerified:true,
  idempotencyVerified:true,
  gmvOutboxVerified:true,
  verification:['PASS'],
});

const releaseDelivery={
  architectureType:'external_legacy',
  releaseVersion:'v1',
  newEc2Instances:0,
  newDatabases:0,
  newBuckets:0,
  newPorts:0,
  verifiedTarget:'existing-target',
  verifiedUrls:['https://example.com'],
  health:'passed',
  rollback:'release-v0',
};

function completedCommerceWorkflow(projectId){
  let state=createWorkflow({projectId});
  state=completeGate(state,'customer_intake',intake(commerceCapabilities,'fixed-cores'));
  state=completeGate(state,'design_and_structure',{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'});
  state=completeGate(state,'frontend_code',{deliveredFiles:['app.tsx'],verification:['PASS'],interfaceContract:'contract.json'});
  state=completeGate(state,'dashboard_integration',{completedSlices:[],frontendFiles:['dashboard.tsx'],backendFiles:['server.mjs'],verification:['PASS']});
  state=completeGate(state,'checkout_payment',checkoutDelivery(projectId));
  state=completeGate(state,'testing_upload_gate',{result:'PASS',verification:['PASS']});
  return completeGate(state,'aws_release',releaseDelivery);
}

function workflowAtRelease(projectId){
  let state=createWorkflow({projectId});
  state=completeGate(state,'customer_intake',intake());
  state=completeGate(state,'design_and_structure',{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'});
  state=completeGate(state,'frontend_code',{deliveredFiles:['index.html'],verification:['PASS'],interfaceContract:'contract.json'});
  state=markNotApplicable({state,gate:'dashboard_integration',reason:'content site has no dashboard'}).state;
  state=markNotApplicable({state,gate:'checkout_payment',reason:'content site has no checkout'}).state;
  return completeGate(state,'testing_upload_gate',{result:'PASS',verification:['PASS']});
}

function completedStaticWorkflow(projectId){
  let state=createWorkflow({projectId});
  state=completeGate(state,'customer_intake',intake());
  state=completeGate(state,'design_and_structure',{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'});
  state=completeGate(state,'frontend_code',{deliveredFiles:['index.html'],verification:['PASS'],interfaceContract:'contract.json'});
  state=markNotApplicable({state,gate:'dashboard_integration',reason:'static site has no dashboard',now:'2026-08-25T02:00:00.000Z'}).state;
  state=markNotApplicable({state,gate:'checkout_payment',reason:'static site has no checkout',now:'2026-08-25T02:01:00.000Z'}).state;
  state=completeGate(state,'testing_upload_gate',{result:'PASS',verification:['PASS']});
  return completeGate(state,'aws_release',releaseDelivery);
}

test('completed workflow opens a separate authorized repair slice without rewriting canonical gates',()=>{
  const completed=completedCommerceWorkflow('completed-repair');
  const canonicalSnapshot=structuredClone(completed.gates);
  assert.equal(typeof workflowCore.validateCompletedWorkflowState,'function');
  assert.doesNotThrow(()=>workflowCore.validateCompletedWorkflowState(completed));
  assert.equal(typeof workflowCore.openRepairSlice,'function');
  const transition=workflowCore.openRepairSlice({
    state:completed,
    gate:'checkout_payment',
    scope:'repair verified checkout behavior',
    authorizedBy:'user',
    now:'2026-08-25T03:00:00.000Z',
  });
  assert.equal(transition.state.currentGate,null);
  assert.deepEqual(transition.state.gates,canonicalSnapshot);
  assert.deepEqual(transition.state.activeRepair,{
    gate:'checkout_payment',
    status:'ready',
    scope:'repair verified checkout behavior',
    authorizedBy:'user',
    authorizedAt:'2026-08-25T03:00:00.000Z',
    authorizationEvidence:{
      source:'workflow_transition',event:'repair_slice_opened',gate:'checkout_payment',
      scope:'repair verified checkout behavior',authorizedBy:'user',authorizedAt:'2026-08-25T03:00:00.000Z',
    },
  });
  assert.equal(transition.event.event,'repair_slice_opened');
});

test('authorized repair slice validates delivery and completes without rewriting canonical gates',()=>{
  const completed=completedCommerceWorkflow('completed-repair-delivery');
  const canonicalSnapshot=structuredClone(completed.gates);
  let state=workflowCore.openRepairSlice({state:completed,gate:'checkout_payment',scope:'repair checkout',authorizedBy:'user'}).state;
  assert.equal(typeof workflowCore.completeRepairSlice,'function');
  const transition=workflowCore.completeRepairSlice({
    state,
    delivery:checkoutDelivery('completed-repair-delivery'),
    completedBy:'operator',
    now:'2026-08-25T04:00:00.000Z',
  });
  assert.equal(transition.state.currentGate,null);
  assert.deepEqual(transition.state.gates,canonicalSnapshot);
  assert.equal(transition.state.activeRepair.status,'complete');
  assert.equal(transition.state.activeRepair.completedBy,'operator');
  assert.equal(transition.event.event,'repair_slice_completed');
});

test('completed workflow and repair API reject approved statuses without full evidence',()=>{
  const invalid=createWorkflow({projectId:'invalid-completed-evidence'});
  invalid.configuration.capabilities=commerceCapabilities;
  invalid.configuration.paymentArchitecture='fixed-cores';
  for(const gate of Object.keys(invalid.gates))invalid.gates[gate]={status:'approved'};
  invalid.currentGate=null;
  invalid.status='complete';
  assert.equal(typeof workflowCore.validateCompletedWorkflowState,'function');
  assert.throws(()=>workflowCore.validateCompletedWorkflowState(invalid),/COMPLETED_GATE_EVIDENCE_INVALID/);
  assert.throws(()=>workflowCore.openRepairSlice({state:invalid,gate:'checkout_payment',scope:'unsafe repair',authorizedBy:'user'}),/WORKFLOW_STATE_PROVENANCE_UNTRUSTED/);
});

test('completed static workflow rejects dashboard repair as capability expansion',()=>{
  const state=completedStaticWorkflow('static-dashboard-repair');
  assert.throws(()=>workflowCore.openRepairSlice({state,gate:'dashboard_integration',scope:'add dashboard',authorizedBy:'user'}),/REPAIR_CAPABILITY_SCOPE_CHANGE_REQUIRED/);
});

test('completed static workflow rejects checkout repair as capability expansion',()=>{
  const state=completedStaticWorkflow('static-checkout-repair');
  assert.throws(()=>workflowCore.openRepairSlice({state,gate:'checkout_payment',scope:'add checkout',authorizedBy:'user'}),/REPAIR_CAPABILITY_SCOPE_CHANGE_REQUIRED/);
});

test('active workflow readiness validates complete historical delivery and approval evidence',()=>{
  const valid=workflowCore.importVerifiedHistory({state:createWorkflow({projectId:'active-history'}),requestedGate:'checkout_payment',imports:importedHistory(),importedBy:'operator'}).state;
  assert.equal(typeof workflowCore.validateWorkflowReadinessEvidence,'function');
  assert.doesNotThrow(()=>workflowCore.validateWorkflowReadinessEvidence(valid));

  const invalidDelivery=structuredClone(valid);
  invalidDelivery.gates.frontend_code.delivery={};
  assert.throws(()=>workflowCore.validateWorkflowReadinessEvidence(invalidDelivery),/HISTORICAL_GATE_EVIDENCE_INVALID/);

  const invalidApproval=structuredClone(valid);
  delete invalidApproval.gates.frontend_code.approvedAt;
  assert.throws(()=>workflowCore.validateWorkflowReadinessEvidence(invalidApproval),/HISTORICAL_GATE_EVIDENCE_INVALID/);

  const invalidImport=structuredClone(valid);
  delete invalidImport.gates.frontend_code.approvalRecord;
  assert.throws(()=>workflowCore.validateWorkflowReadinessEvidence(invalidImport),/HISTORICAL_GATE_EVIDENCE_INVALID/);
});

test('active workflow readiness requires trustworthy not-applicable history evidence',()=>{
  let state=createWorkflow({projectId:'active-static-history'});
  state=completeGate(state,'customer_intake',intake());
  state=completeGate(state,'design_and_structure',{designRecord:'design.json',pageStructure:'pages.json',boardStatus:'delivered'});
  state=completeGate(state,'frontend_code',{deliveredFiles:['index.html'],verification:['PASS'],interfaceContract:'contract.json'});
  state=markNotApplicable({state,gate:'dashboard_integration',reason:'dashboard not required'}).state;
  state=markNotApplicable({state,gate:'checkout_payment',reason:'checkout not required'}).state;
  assert.doesNotThrow(()=>workflowCore.validateWorkflowReadinessEvidence(state));
  delete state.gates.dashboard_integration.notApplicableEvidence;
  assert.throws(()=>workflowCore.validateWorkflowReadinessEvidence(state),/HISTORICAL_GATE_EVIDENCE_INVALID/);
});
