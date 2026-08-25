const gateOrder=Object.freeze([
  'customer_intake',
  'design_and_structure',
  'frontend_code',
  'dashboard_integration',
  'checkout_payment',
  'testing_upload_gate',
  'aws_release',
]);
const interactionModes=Object.freeze(['team','developer']);
const workPackageGates=Object.freeze(['frontend_code','dashboard_integration','checkout_payment','testing_upload_gate']);
const paymentArchitectures=Object.freeze(['fixed-cores','legacy-globepay-service']);
const dashboardSliceValues=Object.freeze([
  'dashboard','merchant_identity','products','categories','services','media','page_editor',
  'inventory','coupons','orders','bookings','customers','paid_customers','settings','payment_settings',
]);
import {isTrustedWorkflowState,trustWorkflowState} from './workflow-provenance.mjs';
export {isTrustedWorkflowState} from './workflow-provenance.mjs';
function requireTrustedWorkflowState(state){
  if(!isTrustedWorkflowState(state))throw new Error('WORKFLOW_STATE_PROVENANCE_UNTRUSTED');
}

function requiredText(value,code){
  const result=String(value??'').trim();
  if(!result)throw new Error(code);
  return result;
}

function normalizeInteractionMode(value){
  const mode=String(value??'team').trim().toLowerCase();
  if(!interactionModes.includes(mode))throw new Error('INTERACTION_MODE_INVALID');
  return mode;
}

const siteTypes=Object.freeze(['content','commerce','service','mixed']);
const requiredCapabilityKeys=Object.freeze(['requiresDashboard','requiresCart','requiresCheckout','requiresPayment','requiresBooking']);
const lifecycleCapabilityKeys=Object.freeze(['requiresCatalog','requiresInventory','requiresCoupons']);

export function normalizeWebsiteCapabilities(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('SITE_CAPABILITIES_REQUIRED');
  const siteType=requiredText(value.siteType,'SITE_TYPE_REQUIRED').toLowerCase();
  if(!siteTypes.includes(siteType))throw new Error('SITE_TYPE_INVALID');
  const result={siteType};
  for(const key of requiredCapabilityKeys){if(typeof value[key]!=='boolean')throw new Error('SITE_CAPABILITIES_REQUIRED');result[key]=value[key]}
  for(const key of lifecycleCapabilityKeys){if(value[key]!==undefined&&typeof value[key]!=='boolean')throw new Error('SITE_CAPABILITIES_REQUIRED')}

  // Legacy commerce or cart evidence is unambiguously product commerce.
  // A mixed booking/payment site without cart evidence remains non-product
  // until intake explicitly migrates its lifecycle flags.
  const legacyProductEvidence=siteType==='commerce'||result.requiresCart;
  result.requiresCatalog=value.requiresCatalog??(legacyProductEvidence||value.requiresInventory===true);
  result.requiresInventory=value.requiresInventory??(legacyProductEvidence&&value.requiresCatalog!==false);
  result.requiresCoupons=value.requiresCoupons??false;

  if(result.requiresPayment&&!result.requiresCheckout)throw new Error('PAYMENT_REQUIRES_CHECKOUT');
  if(result.requiresCart&&!result.requiresCheckout)throw new Error('CART_REQUIRES_CHECKOUT');
  if(result.requiresCart&&!result.requiresCatalog)throw new Error('CART_REQUIRES_CATALOG');
  if(result.requiresInventory&&!result.requiresCatalog)throw new Error('INVENTORY_REQUIRES_CATALOG');
  if(result.requiresCoupons&&!result.requiresCheckout)throw new Error('COUPON_REQUIRES_CHECKOUT');
  return Object.freeze(result);
}

export function websiteCapabilitiesEqual(left,right){
  const keys=[...requiredCapabilityKeys,...lifecycleCapabilityKeys];
  return left.siteType===right.siteType&&keys.every(key=>left[key]===right[key]);
}

function selectPaymentArchitecture(state,capabilities,value){
  state.configuration??={};
  if(!capabilities.requiresPayment)return;
  const architecture=requiredText(value,'PAYMENT_ARCHITECTURE_REQUIRED');
  if(!paymentArchitectures.includes(architecture))throw new Error('PAYMENT_ARCHITECTURE_UNSUPPORTED');
  state.configuration.paymentArchitecture=architecture;
}

export function createWorkflow({projectId,now=new Date().toISOString(),workflowVersion='1.2.0',dashboardSlices=[],interactionMode='team'}={}){
  const id=requiredText(projectId,'PROJECT_ID_REQUIRED');
  if(!Array.isArray(dashboardSlices)||dashboardSlices.length)throw new Error('DASHBOARD_SLICES_REQUIRE_APPROVED_TRANSITION');
  const gates=Object.fromEntries(gateOrder.map((gate,index)=>[gate,{status:index===0?'ready':'locked'}]));
  return trustWorkflowState({schemaVersion:1,workflowId:'buyna-website',workflowVersion,projectId:id,currentGate:gateOrder[0],createdAt:now,updatedAt:now,gates,configuration:{interactionMode:normalizeInteractionMode(interactionMode),dashboardSlices:[]},deferredMaterials:[]});
}

export const WORKFLOW_GATES=gateOrder;
export const INTERACTION_MODES=interactionModes;
export const PAYMENT_ARCHITECTURES=paymentArchitectures;
export const DASHBOARD_SLICES=dashboardSliceValues;

const commonInteractionPolicy=Object.freeze({
  maxActionQuestionsPerTurn:1,
  approvalChoices:Object.freeze(['确认并进入下一步','需要修改','暂停当前项目']),
  canBypassApproval:false,
  canContinueWithinApprovedWorkPackage:true,
  canCreateInfrastructure:false,
  canExposeSecrets:false,
});

export function getInteractionPolicy({state}={}){
  const mode=normalizeInteractionMode(state?.configuration?.interactionMode??'team');
  return Object.freeze({
    ...commonInteractionPolicy,
    mode,
    requiredSections:Object.freeze(['当前步骤','状态','已经完成','需要你操作','下一步']),
    showInternalStatusCodes:mode==='developer',
    showResourceIdentifiers:mode==='developer',
    showRawCommands:mode==='developer',
    showTechnicalEvidence:mode==='developer',
  });
}

function copyState(state){requireTrustedWorkflowState(state);return structuredClone(state)}
function exactObjectKeys(value,keys,code){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(code);
  const actual=Reflect.ownKeys(value);
  if(actual.some(key=>typeof key!=='string')||actual.length!==keys.length||keys.some(key=>!actual.includes(key)))throw new Error(code);
}
function sameStringArray(left,right){
  return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((value,index)=>value===right[index]);
}
function gateState(state,gate){
  if(!gateOrder.includes(gate))throw new Error('UNKNOWN_GATE');
  if(state.currentGate!==gate)throw new Error('GATE_NOT_CURRENT');
  return state.gates[gate];
}
function result(state,event){return{state:trustWorkflowState(state),event}}
export function setInteractionMode({state,mode,selectedBy='user',now=new Date().toISOString()}={}){
  const next=copyState(state),selected=normalizeInteractionMode(mode),actor=requiredText(selectedBy,'MODE_SELECTOR_REQUIRED');
  next.configuration??={};
  const previous=next.configuration.interactionMode??'team';
  next.configuration.interactionMode=selected;next.configuration.interactionModeSelectedBy=actor;next.configuration.interactionModeSelectedAt=now;next.updatedAt=now;
  return result(next,{event:'interaction_mode_selected',mode:selected,previousMode:previous,selectedBy:actor,at:now});
}
function unlockFollowing(state,gate){
  const following=gateOrder[gateOrder.indexOf(gate)+1];
  if(following){state.gates[following].status='ready';state.currentGate=following}else{state.currentGate=null;state.status='complete'}
}
function nonEmptyArray(value){return Array.isArray(value)&&value.length>0}
function allChecksPassed(value){
  return nonEmptyArray(value)&&value.every(item=>{
    const status=typeof item==='string'?item:item?.status;
    return String(status??'').toUpperCase()==='PASS'||String(status??'').toLowerCase()==='passed';
  });
}
export function validateDeliveryEvidence(state,gate,delivery){
  if(gate==='customer_intake'){
    requiredText(delivery.record,'CUSTOMER_RECORD_REQUIRED');
    const deliveredCapabilities=normalizeWebsiteCapabilities(delivery.capabilities);
    const persistedCapabilities=normalizeWebsiteCapabilities(state.configuration?.capabilities);
    if(!websiteCapabilitiesEqual(deliveredCapabilities,persistedCapabilities))throw new Error('SITE_CAPABILITIES_MISMATCH');
    if(deliveredCapabilities.requiresPayment){
      const architecture=requiredText(state.configuration?.paymentArchitecture,'PAYMENT_ARCHITECTURE_REQUIRED');
      if(!paymentArchitectures.includes(architecture))throw new Error('PAYMENT_ARCHITECTURE_UNSUPPORTED');
      if(delivery.paymentArchitecture!==architecture)throw new Error('PAYMENT_ARCHITECTURE_MISMATCH');
    }
  }
  if(gate==='design_and_structure'&&(!requiredText(delivery.designRecord,'DESIGN_RECORD_REQUIRED')||!requiredText(delivery.pageStructure,'PAGE_STRUCTURE_REQUIRED')||!['delivered','postponed'].includes(delivery.boardStatus)))throw new Error('DESIGN_STRUCTURE_EVIDENCE_MISSING');
  if(gate==='frontend_code'&&(!nonEmptyArray(delivery.deliveredFiles)||!allChecksPassed(delivery.verification)||!requiredText(delivery.interfaceContract,'FRONTEND_DELIVERY_EVIDENCE_MISSING')))throw new Error('FRONTEND_DELIVERY_EVIDENCE_MISSING');
  if(gate==='dashboard_integration'){
    const completed=new Set(delivery.completedSlices??[]),required=state.configuration?.dashboardSlices??[];
    if(required.some(slice=>!completed.has(slice)))throw new Error('DASHBOARD_SLICES_INCOMPLETE');
    if(!nonEmptyArray(delivery.frontendFiles)||!nonEmptyArray(delivery.backendFiles)||!allChecksPassed(delivery.verification))throw new Error('DASHBOARD_DELIVERY_EVIDENCE_MISSING');
  }
  if(gate==='checkout_payment'){
    const capabilities=state.configuration?.capabilities;
    if(!delivery.pendingOrder||!allChecksPassed(delivery.verification))throw new Error('PAYMENT_DELIVERY_EVIDENCE_MISSING');
    if(capabilities?.requiresPayment){
      const architecture=requiredText(state.configuration?.paymentArchitecture,'PAYMENT_ARCHITECTURE_REQUIRED');
      if(!paymentArchitectures.includes(architecture))throw new Error('PAYMENT_ARCHITECTURE_UNSUPPORTED');
      if(!delivery.paymentArchitecture)throw new Error('PAYMENT_DELIVERY_EVIDENCE_MISSING');
      if(delivery.paymentArchitecture!==architecture)throw new Error('PAYMENT_ARCHITECTURE_MISMATCH');
      const fixedCorePath=architecture==='fixed-cores';
      const scopeValid=!fixedCorePath||(delivery.scope?.projectId===state.projectId&&Boolean(requiredText(delivery.scope?.sellerId,'SELLER_ID_REQUIRED')));
      const coreValid=!fixedCorePath||(delivery.checkoutFlowVerified&&delivery.amountCurrencyReconciled);
      const legacyValid=fixedCorePath||(delivery.providerQueryVerified&&delivery.amountCurrencyReconciled);
      if(!scopeValid||!coreValid||!legacyValid||!delivery.routingVerified||!delivery.statusSyncVerified||!delivery.idempotencyVerified||!delivery.gmvOutboxVerified)throw new Error('PAYMENT_DELIVERY_EVIDENCE_MISSING');
    }else if(capabilities?.requiresCheckout&&!delivery.checkoutFlowVerified)throw new Error('CHECKOUT_DELIVERY_EVIDENCE_MISSING');
  }
  if(gate==='testing_upload_gate'&&(delivery.result!=='PASS'||!allChecksPassed(delivery.verification)))throw new Error('TESTING_DELIVERY_EVIDENCE_MISSING');
  if(gate==='aws_release'){
    const architecture=requiredText(delivery.architectureType,'ARCHITECTURE_TYPE_REQUIRED');
    const zeroCreate=delivery.newEc2Instances===0&&delivery.newDatabases===0&&delivery.newBuckets===0&&delivery.newPorts===0;
    const targetValid=architecture==='shared_ec2_postgresql'
      ? Boolean(requiredText(delivery.targetInstance,'TARGET_INSTANCE_REQUIRED')&&requiredText(delivery.runtimeRoute,'RUNTIME_ROUTE_REQUIRED'))
      : architecture==='aws_serverless'
        ? Boolean(requiredText(delivery.distributionId,'DISTRIBUTION_REQUIRED')&&nonEmptyArray(delivery.functionOrApiIds)&&nonEmptyArray(delivery.dataStoreIds))
        : architecture==='aws_static'
          ? Boolean(requiredText(delivery.distributionId,'DISTRIBUTION_REQUIRED')&&requiredText(delivery.bucketName,'BUCKET_REQUIRED'))
          : architecture==='external_legacy'&&Boolean(requiredText(delivery.verifiedTarget,'VERIFIED_TARGET_REQUIRED'));
    if(!requiredText(delivery.releaseVersion,'RELEASE_VERSION_REQUIRED')||!zeroCreate||!targetValid||!nonEmptyArray(delivery.verifiedUrls)||delivery.health!=='passed'||!requiredText(delivery.rollback,'ROLLBACK_EVIDENCE_REQUIRED'))throw new Error('RELEASE_DELIVERY_EVIDENCE_MISSING');
  }
}

export function startGate({state,gate,now=new Date().toISOString()}={}){
  const next=copyState(state),current=gateState(next,gate);
  if(current.status!=='ready')throw new Error('GATE_NOT_READY');
  current.status='in_progress';current.startedAt=now;next.updatedAt=now;
  return result(next,{event:'gate_started',gate,at:now});
}

export function recordDelivery({state,gate,delivery,now=new Date().toISOString()}={}){
  const next=copyState(state),current=gateState(next,gate);
  if(current.status!=='in_progress')throw new Error('GATE_NOT_IN_PROGRESS');
  if(!delivery||typeof delivery!=='object'||Array.isArray(delivery))throw new Error('DELIVERY_REQUIRED');
  current.delivery=structuredClone(delivery);
  if(gate==='customer_intake'){
    next.configuration.capabilities=normalizeWebsiteCapabilities(delivery.capabilities);
    selectPaymentArchitecture(next,next.configuration.capabilities,delivery.paymentArchitecture);
  }
  current.deliveryRecordedAt=now;next.updatedAt=now;
  return result(next,{event:'delivery_recorded',gate,at:now});
}

export function requestApproval({state,gate,now=new Date().toISOString()}={}){
  const next=copyState(state),current=gateState(next,gate);
  if(current.status!=='in_progress')throw new Error('GATE_NOT_IN_PROGRESS');
  if(!current.delivery)throw new Error('DELIVERY_REQUIRED');
  validateDeliveryEvidence(next,gate,current.delivery);
  current.status='waiting_for_approval';current.approvalRequestedAt=now;next.updatedAt=now;
  return result(next,{event:'approval_requested',gate,at:now});
}

export function approveGate({state,gate,approvedBy,now=new Date().toISOString()}={}){
  const next=copyState(state),current=gateState(next,gate);
  if(current.status!=='waiting_for_approval')throw new Error('GATE_NOT_WAITING_FOR_APPROVAL');
  const actor=requiredText(approvedBy,'APPROVER_REQUIRED');
  current.status='approved';current.approvedBy=actor;current.approvedAt=now;
  unlockFollowing(next,gate);
  next.updatedAt=now;
  return result(next,{event:'gate_approved',gate,approvedBy:actor,at:now});
}

export function setApprovedDashboardSlices({state,slices,approvedBy,now=new Date().toISOString()}={}){
  const next=copyState(state);
  const design=next.gates?.design_and_structure;
  if(design?.status!=='approved'||!design.delivery)throw new Error('DASHBOARD_SLICE_DESIGN_APPROVAL_REQUIRED');
  validateDeliveryEvidence(next,'design_and_structure',design.delivery);
  if(next.currentGate!=='frontend_code'||next.gates?.frontend_code?.status!=='ready'||next.gates.frontend_code.delivery!==undefined)throw new Error('DASHBOARD_SLICE_SCOPE_CHANGE_REQUIRED');
  if(!next.configuration?.capabilities?.requiresDashboard)throw new Error('DASHBOARD_SLICE_CAPABILITY_REQUIRED');
  if(!nonEmptyArray(slices))throw new Error('DASHBOARD_SLICES_REQUIRED');
  const selected=slices.map(value=>requiredText(value,'DASHBOARD_SLICE_INVALID'));
  if(new Set(selected).size!==selected.length||selected.some(value=>!dashboardSliceValues.includes(value)))throw new Error('DASHBOARD_SLICE_INVALID');
  const actor=requiredText(approvedBy,'APPROVER_REQUIRED');
  if(!validTimestamp(now))throw new Error('DASHBOARD_SLICE_APPROVAL_EVIDENCE_INVALID');
  next.configuration.dashboardSlices=[...selected];
  next.configuration.dashboardSliceApproval={
    slices:[...selected],approvedBy:actor,approvedAt:now,
    authorizationEvidence:{
      source:'workflow_transition',event:'dashboard_slices_approved',slices:[...selected],approvedBy:actor,approvedAt:now,
    },
  };
  next.updatedAt=now;
  return result(next,{event:'dashboard_slices_approved',slices:[...selected],approvedBy:actor,at:now});
}

export function authorizeWorkPackage({state,gates,authorizedBy,scope,now=new Date().toISOString()}={}){
  const next=copyState(state);
  if(!nonEmptyArray(gates))throw new Error('WORK_PACKAGE_GATES_REQUIRED');
  const selected=[...new Set(gates.map(gate=>requiredText(gate,'WORK_PACKAGE_GATE_REQUIRED')))];
  if(selected.some(gate=>!workPackageGates.includes(gate)))throw new Error('WORK_PACKAGE_GATE_REQUIRES_EXPLICIT_APPROVAL');
  const actor=requiredText(authorizedBy,'APPROVER_REQUIRED');
  next.configuration??={};
  const normalizedScope=requiredText(scope,'WORK_PACKAGE_SCOPE_REQUIRED');
  if(!validTimestamp(now))throw new Error('WORK_PACKAGE_AUTHORIZATION_EVIDENCE_INVALID');
  next.configuration.workPackage={
    gates:selected,
    scope:normalizedScope,
    authorizedBy:actor,
    authorizedAt:now,
    completedGates:[],
    authorizationEvidence:{
      source:'workflow_transition',event:'work_package_authorized',gates:[...selected],scope:normalizedScope,
      authorizedBy:actor,authorizedAt:now,
    },
  };
  next.updatedAt=now;
  return result(next,{event:'work_package_authorized',gates:selected,authorizedBy:actor,at:now});
}

export function completeAuthorizedGate({state,gate,now=new Date().toISOString()}={}){
  const next=copyState(state),current=gateState(next,gate),workPackage=next.configuration?.workPackage;
  validateWorkPackageAuthorization(next);
  if(current.status!=='in_progress')throw new Error('GATE_NOT_IN_PROGRESS');
  if(!current.delivery)throw new Error('DELIVERY_REQUIRED');
  if(!workPackage||!workPackage.gates?.includes(gate))throw new Error('GATE_NOT_AUTHORIZED_BY_WORK_PACKAGE');
  validateDeliveryEvidence(next,gate,current.delivery);
  current.status='approved';
  current.approvalMode='work_package';
  current.approvedBy=workPackage.authorizedBy;
  current.approvedAt=now;
  workPackage.completedGates=[...new Set([...(workPackage.completedGates??[]),gate])];
  unlockFollowing(next,gate);
  next.updatedAt=now;
  return result(next,{event:'gate_completed_from_work_package',gate,authorizedBy:workPackage.authorizedBy,at:now});
}

export function markNotApplicable({state,gate,reason,now=new Date().toISOString()}={}){
  const next=copyState(state),current=gateState(next,gate);
  validateNotApplicableCapability(next,gate);
  if(!['ready','in_progress'].includes(current.status))throw new Error('GATE_CANNOT_BE_SKIPPED');
  current.status='not_applicable';current.reason=requiredText(reason,'NOT_APPLICABLE_REASON_REQUIRED');current.completedAt=now;
  current.notApplicableEvidence={source:'native_transition',event:'gate_not_applicable',recordedAt:now};
  unlockFollowing(next,gate);next.updatedAt=now;
  return result(next,{event:'gate_not_applicable',gate,reason:current.reason,at:now});
}

function validateNotApplicableCapability(state,gate){
  if(!['dashboard_integration','checkout_payment'].includes(gate))throw new Error('GATE_NOT_OPTIONAL');
  const capabilities=state.configuration?.capabilities;
  if(!capabilities)throw new Error('SITE_CAPABILITIES_REQUIRED');
  if(gate==='dashboard_integration'&&capabilities.requiresDashboard)throw new Error('DASHBOARD_REQUIRED');
  if(gate==='checkout_payment'&&(capabilities.requiresCheckout||capabilities.requiresPayment))throw new Error('CHECKOUT_PAYMENT_REQUIRED');
}

function validTimestamp(value){
  return Boolean(String(value??'').trim())&&!Number.isNaN(Date.parse(value));
}

function validateDashboardSliceApproval(state){
  const slices=state.configuration?.dashboardSlices;
  if(!Array.isArray(slices))throw new Error('DASHBOARD_SLICE_APPROVAL_EVIDENCE_INVALID');
  const evidence=state.configuration?.dashboardSliceApproval;
  if(slices.length===0){
    if(evidence!==undefined)throw new Error('DASHBOARD_SLICE_APPROVAL_EVIDENCE_INVALID');
    return;
  }
  if(new Set(slices).size!==slices.length||slices.some(value=>typeof value!=='string'||!dashboardSliceValues.includes(value)))throw new Error('DASHBOARD_SLICE_APPROVAL_EVIDENCE_INVALID');
  exactObjectKeys(evidence,['slices','approvedBy','approvedAt','authorizationEvidence'],'DASHBOARD_SLICE_APPROVAL_EVIDENCE_INVALID');
  const actor=requiredText(evidence.approvedBy,'DASHBOARD_SLICE_APPROVAL_EVIDENCE_INVALID');
  if(!sameStringArray(evidence.slices,slices)||!validTimestamp(evidence.approvedAt))throw new Error('DASHBOARD_SLICE_APPROVAL_EVIDENCE_INVALID');
  const authorization=evidence.authorizationEvidence;
  exactObjectKeys(authorization,['source','event','slices','approvedBy','approvedAt'],'DASHBOARD_SLICE_APPROVAL_EVIDENCE_INVALID');
  if(authorization.source!=='workflow_transition'||authorization.event!=='dashboard_slices_approved'
    ||!sameStringArray(authorization.slices,slices)||authorization.approvedBy!==actor
    ||authorization.approvedAt!==evidence.approvedAt)throw new Error('DASHBOARD_SLICE_APPROVAL_EVIDENCE_INVALID');
  const design=state.gates?.design_and_structure;
  if(design?.status!=='approved'||!design.delivery)throw new Error('DASHBOARD_SLICE_APPROVAL_EVIDENCE_INVALID');
}

function validateWorkPackageAuthorization(state){
  const workPackage=state.configuration?.workPackage;
  if(workPackage===undefined)return;
  exactObjectKeys(workPackage,['gates','scope','authorizedBy','authorizedAt','completedGates','authorizationEvidence'],'WORK_PACKAGE_AUTHORIZATION_EVIDENCE_INVALID');
  if(!nonEmptyArray(workPackage.gates)||new Set(workPackage.gates).size!==workPackage.gates.length
    ||workPackage.gates.some(gate=>!workPackageGates.includes(gate))||!Array.isArray(workPackage.completedGates)
    ||new Set(workPackage.completedGates).size!==workPackage.completedGates.length
    ||workPackage.completedGates.some(gate=>!workPackage.gates.includes(gate)))throw new Error('WORK_PACKAGE_AUTHORIZATION_EVIDENCE_INVALID');
  const scope=requiredText(workPackage.scope,'WORK_PACKAGE_AUTHORIZATION_EVIDENCE_INVALID');
  const actor=requiredText(workPackage.authorizedBy,'WORK_PACKAGE_AUTHORIZATION_EVIDENCE_INVALID');
  if(!validTimestamp(workPackage.authorizedAt))throw new Error('WORK_PACKAGE_AUTHORIZATION_EVIDENCE_INVALID');
  const evidence=workPackage.authorizationEvidence;
  exactObjectKeys(evidence,['source','event','gates','scope','authorizedBy','authorizedAt'],'WORK_PACKAGE_AUTHORIZATION_EVIDENCE_INVALID');
  if(evidence.source!=='workflow_transition'||evidence.event!=='work_package_authorized'
    ||!sameStringArray(evidence.gates,workPackage.gates)||evidence.scope!==scope
    ||evidence.authorizedBy!==actor||evidence.authorizedAt!==workPackage.authorizedAt)throw new Error('WORK_PACKAGE_AUTHORIZATION_EVIDENCE_INVALID');
}

function validateRepairAuthorization(state){
  const repair=state.activeRepair;
  if(repair===undefined)return;
  const complete=repair.status==='complete';
  exactObjectKeys(repair,complete
    ?['gate','status','scope','authorizedBy','authorizedAt','authorizationEvidence','delivery','completedBy','completedAt']
    :['gate','status','scope','authorizedBy','authorizedAt','authorizationEvidence'],'REPAIR_AUTHORIZATION_EVIDENCE_INVALID');
  if((!complete&&!['ready','in_progress'].includes(repair.status))||!workPackageGates.includes(repair.gate))throw new Error('REPAIR_AUTHORIZATION_EVIDENCE_INVALID');
  const scope=requiredText(repair.scope,'REPAIR_AUTHORIZATION_EVIDENCE_INVALID');
  const actor=requiredText(repair.authorizedBy,'REPAIR_AUTHORIZATION_EVIDENCE_INVALID');
  if(!validTimestamp(repair.authorizedAt))throw new Error('REPAIR_AUTHORIZATION_EVIDENCE_INVALID');
  const evidence=repair.authorizationEvidence;
  exactObjectKeys(evidence,['source','event','gate','scope','authorizedBy','authorizedAt'],'REPAIR_AUTHORIZATION_EVIDENCE_INVALID');
  if(evidence.source!=='workflow_transition'||evidence.event!=='repair_slice_opened'||evidence.gate!==repair.gate
    ||evidence.scope!==scope||evidence.authorizedBy!==actor||evidence.authorizedAt!==repair.authorizedAt)throw new Error('REPAIR_AUTHORIZATION_EVIDENCE_INVALID');
  if(complete){
    requiredText(repair.completedBy,'REPAIR_AUTHORIZATION_EVIDENCE_INVALID');
    if(!validTimestamp(repair.completedAt)||!repair.delivery||typeof repair.delivery!=='object'||Array.isArray(repair.delivery))throw new Error('REPAIR_AUTHORIZATION_EVIDENCE_INVALID');
    validateDeliveryEvidence(state,repair.gate,repair.delivery);
  }
}

function validateAuthorizationConfiguration(state){
  validateDashboardSliceApproval(state);
  validateWorkPackageAuthorization(state);
  validateRepairAuthorization(state);
}

function validateNotApplicableEvidence(state,gate,current){
  validateNotApplicableCapability(state,gate);
  requiredText(current.reason,'NOT_APPLICABLE_REASON_REQUIRED');
  const evidence=current.notApplicableEvidence;
  if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))throw new Error('NOT_APPLICABLE_EVIDENCE_REQUIRED');
  if(evidence.source==='native_transition'){
    if(evidence.event!=='gate_not_applicable'||!validTimestamp(evidence.recordedAt))throw new Error('NOT_APPLICABLE_EVIDENCE_REQUIRED');
    return;
  }
  if(evidence.source==='verified_import'){
    requiredText(evidence.record,'VERIFIED_NOT_APPLICABLE_EVIDENCE_REQUIRED');
    requiredText(evidence.verifiedBy,'VERIFIED_NOT_APPLICABLE_EVIDENCE_REQUIRED');
    if(!validTimestamp(evidence.verifiedAt))throw new Error('VERIFIED_NOT_APPLICABLE_EVIDENCE_REQUIRED');
    return;
  }
  throw new Error('NOT_APPLICABLE_EVIDENCE_REQUIRED');
}

export function validateCompletedWorkflowState(state){
  try{
    if(!state||typeof state!=='object'||Array.isArray(state)||state.currentGate!==null)throw new Error('WORKFLOW_NOT_COMPLETE');
    if(!state.gates||typeof state.gates!=='object'||Array.isArray(state.gates))throw new Error('GATE_STATE_REQUIRED');
    validateAuthorizationConfiguration(state);
    for(const gate of gateOrder){
      const current=state.gates[gate];
      validateTerminalGateEvidence(state,gate,current);
    }
    return state;
  }catch(error){
    if(error instanceof Error&&error.message==='COMPLETED_GATE_EVIDENCE_INVALID')throw error;
    throw new Error('COMPLETED_GATE_EVIDENCE_INVALID',{cause:error});
  }
}

function validateTerminalGateEvidence(state,gate,current){
  if(!current||typeof current!=='object'||Array.isArray(current))throw new Error('GATE_STATE_REQUIRED');
  if(current.status==='approved'){
    if(!current.delivery||typeof current.delivery!=='object'||Array.isArray(current.delivery))throw new Error('DELIVERY_REQUIRED');
    validateDeliveryEvidence(state,gate,current.delivery);
    requiredText(current.approvedBy,'APPROVER_REQUIRED');
    if(!validTimestamp(current.approvedAt))throw new Error('APPROVAL_EVIDENCE_REQUIRED');
    if(current.approvalMode==='imported_verified_evidence')requiredText(current.approvalRecord,'VERIFIED_APPROVAL_EVIDENCE_REQUIRED');
    return;
  }
  if(current.status==='not_applicable'){
    validateNotApplicableEvidence(state,gate,current);
    return;
  }
  throw new Error('GATE_HISTORY_NOT_TERMINAL');
}

export function validateWorkflowReadinessEvidence(state){
  if(state?.currentGate===null)return validateCompletedWorkflowState(state);
  try{
    if(!state||typeof state!=='object'||Array.isArray(state))throw new Error('WORKFLOW_STATE_REQUIRED');
    validateAuthorizationConfiguration(state);
    if(!state.gates||typeof state.gates!=='object'||Array.isArray(state.gates))throw new Error('GATE_STATE_REQUIRED');
    const currentIndex=gateOrder.indexOf(state.currentGate);
    if(currentIndex<0)throw new Error('CURRENT_GATE_INVALID');
    for(const gate of gateOrder)if(!state.gates[gate]||typeof state.gates[gate]!=='object'||Array.isArray(state.gates[gate]))throw new Error('GATE_STATE_REQUIRED');
    for(const gate of gateOrder.slice(0,currentIndex))validateTerminalGateEvidence(state,gate,state.gates[gate]);
    return state;
  }catch(error){
    if(error instanceof Error&&error.message==='HISTORICAL_GATE_EVIDENCE_INVALID')throw error;
    throw new Error('HISTORICAL_GATE_EVIDENCE_INVALID',{cause:error});
  }
}

function validateRepairCapability(state,gate){
  const capabilities=state.configuration?.capabilities;
  if(!capabilities)throw new Error('REPAIR_CAPABILITY_SCOPE_CHANGE_REQUIRED');
  if(gate==='dashboard_integration'&&!capabilities.requiresDashboard)throw new Error('REPAIR_CAPABILITY_SCOPE_CHANGE_REQUIRED');
  if(gate==='checkout_payment'&&!capabilities.requiresCheckout)throw new Error('REPAIR_CAPABILITY_SCOPE_CHANGE_REQUIRED');
}

function verifiedApproval(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('VERIFIED_APPROVAL_EVIDENCE_REQUIRED');
  const record=requiredText(value.record,'VERIFIED_APPROVAL_EVIDENCE_REQUIRED');
  const approvedBy=requiredText(value.approvedBy,'VERIFIED_APPROVAL_EVIDENCE_REQUIRED');
  const approvedAt=requiredText(value.approvedAt,'VERIFIED_APPROVAL_EVIDENCE_REQUIRED');
  if(value.decision!=='approved'||Number.isNaN(Date.parse(approvedAt)))throw new Error('VERIFIED_APPROVAL_EVIDENCE_REQUIRED');
  return{record,approvedBy,approvedAt,decision:'approved'};
}

function verifiedNotApplicable(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('VERIFIED_NOT_APPLICABLE_EVIDENCE_REQUIRED');
  const reason=requiredText(value.reason,'VERIFIED_NOT_APPLICABLE_EVIDENCE_REQUIRED');
  const record=requiredText(value.record,'VERIFIED_NOT_APPLICABLE_EVIDENCE_REQUIRED');
  const verifiedBy=requiredText(value.verifiedBy,'VERIFIED_NOT_APPLICABLE_EVIDENCE_REQUIRED');
  const verifiedAt=requiredText(value.verifiedAt,'VERIFIED_NOT_APPLICABLE_EVIDENCE_REQUIRED');
  if(Number.isNaN(Date.parse(verifiedAt)))throw new Error('VERIFIED_NOT_APPLICABLE_EVIDENCE_REQUIRED');
  return{reason,record,verifiedBy,verifiedAt};
}

export function importVerifiedHistory({state,requestedGate,imports,importedBy,now=new Date().toISOString()}={}){
  const requestedIndex=gateOrder.indexOf(requestedGate),startIndex=gateOrder.indexOf(state?.currentGate);
  if(requestedIndex<0||startIndex<0||requestedIndex<=startIndex)throw new Error('HISTORY_IMPORT_TARGET_INVALID');
  if(!Array.isArray(imports)||imports.length!==requestedIndex-startIndex)throw new Error('HISTORY_IMPORT_INCOMPLETE');
  const actor=requiredText(importedBy,'HISTORY_IMPORTER_REQUIRED'),next=copyState(state),events=[];
  for(let offset=0;offset<imports.length;offset+=1){
    const expectedGate=gateOrder[startIndex+offset],item=imports[offset];
    if(item?.gate!==expectedGate)throw new Error('HISTORY_IMPORT_ORDER_INVALID');
    const current=next.gates[expectedGate];
    if(next.currentGate!==expectedGate||current.status!=='ready')throw new Error('HISTORY_IMPORT_STATE_INVALID');
    if(item.outcome==='not_applicable'){
      if('delivery'in item||'approval'in item)throw new Error('VERIFIED_NOT_APPLICABLE_EVIDENCE_INVALID');
      validateNotApplicableCapability(next,expectedGate);
      const evidence=verifiedNotApplicable(item.notApplicable);
      current.status='not_applicable';current.reason=evidence.reason;current.completedAt=evidence.verifiedAt;
      current.importMode='imported_verified_evidence';current.notApplicableRecord=evidence.record;
      current.verifiedBy=evidence.verifiedBy;current.verifiedAt=evidence.verifiedAt;
      current.notApplicableEvidence={source:'verified_import',record:evidence.record,verifiedBy:evidence.verifiedBy,verifiedAt:evidence.verifiedAt};
      unlockFollowing(next,expectedGate);
      events.push({event:'verified_gate_not_applicable_imported',gate:expectedGate,reason:evidence.reason,verificationRecord:evidence.record,importedBy:actor,at:now});
      continue;
    }
    if(!item.delivery||typeof item.delivery!=='object'||Array.isArray(item.delivery))throw new Error('VERIFIED_DELIVERY_EVIDENCE_REQUIRED');
    if(expectedGate==='customer_intake'){
      next.configuration.capabilities=normalizeWebsiteCapabilities(item.delivery.capabilities);
      selectPaymentArchitecture(next,next.configuration.capabilities,item.delivery.paymentArchitecture);
    }
    validateDeliveryEvidence(next,expectedGate,item.delivery);
    const approval=verifiedApproval(item.approval);
    current.status='approved';current.delivery=structuredClone(item.delivery);current.deliveryRecordedAt=now;
    current.approvalMode='imported_verified_evidence';current.approvalRecord=approval.record;
    current.approvedBy=approval.approvedBy;current.approvedAt=approval.approvedAt;
    unlockFollowing(next,expectedGate);
    events.push({event:'verified_gate_history_imported',gate:expectedGate,approvalRecord:approval.record,importedBy:actor,at:now});
  }
  if(next.currentGate!==requestedGate)throw new Error('HISTORY_IMPORT_INCOMPLETE');
  next.updatedAt=now;
  const summary={event:'verified_history_imported',gates:imports.map(item=>item.gate),requestedGate,importedBy:actor,at:now};
  events.push(summary);
  return{state:trustWorkflowState(next),event:summary,events};
}

export function openRepairSlice({state,gate,scope,authorizedBy,now=new Date().toISOString()}={}){
  const next=copyState(state);
  validateCompletedWorkflowState(next);
  if(!workPackageGates.includes(gate))throw new Error('REPAIR_GATE_REQUIRES_EXPLICIT_WORKFLOW');
  validateRepairCapability(next,gate);
  if(next.activeRepair&&!['complete','cancelled'].includes(next.activeRepair.status))throw new Error('REPAIR_SLICE_ALREADY_ACTIVE');
  const actor=requiredText(authorizedBy,'APPROVER_REQUIRED');
  const normalizedScope=requiredText(scope,'WORK_PACKAGE_SCOPE_REQUIRED');
  if(!validTimestamp(now))throw new Error('REPAIR_AUTHORIZATION_EVIDENCE_INVALID');
  next.activeRepair={
    gate,
    status:'ready',
    scope:normalizedScope,
    authorizedBy:actor,
    authorizedAt:now,
    authorizationEvidence:{
      source:'workflow_transition',event:'repair_slice_opened',gate,scope:normalizedScope,
      authorizedBy:actor,authorizedAt:now,
    },
  };
  next.updatedAt=now;
  return result(next,{event:'repair_slice_opened',gate,authorizedBy:actor,at:now});
}

export function completeRepairSlice({state,delivery,completedBy,now=new Date().toISOString()}={}){
  const next=copyState(state),repair=next.activeRepair;
  validateRepairAuthorization(next);
  if(!repair||!['ready','in_progress'].includes(repair.status))throw new Error('REPAIR_SLICE_NOT_ACTIVE');
  if(!delivery||typeof delivery!=='object'||Array.isArray(delivery))throw new Error('DELIVERY_REQUIRED');
  validateDeliveryEvidence(next,repair.gate,delivery);
  const actor=requiredText(completedBy,'REPAIR_COMPLETER_REQUIRED');
  repair.status='complete';repair.delivery=structuredClone(delivery);
  repair.completedBy=actor;repair.completedAt=now;next.updatedAt=now;
  return result(next,{event:'repair_slice_completed',gate:repair.gate,completedBy:actor,at:now});
}

export function rejectGate({state,gate,feedback,rejectedBy,now=new Date().toISOString()}={}){
  const next=copyState(state),current=gateState(next,gate);
  if(current.status!=='waiting_for_approval')throw new Error('GATE_NOT_WAITING_FOR_APPROVAL');
  current.status='in_progress';current.rejection={feedback:requiredText(feedback,'REJECTION_FEEDBACK_REQUIRED'),rejectedBy:requiredText(rejectedBy,'REJECTOR_REQUIRED'),at:now};
  next.updatedAt=now;return result(next,{event:'gate_rejected',gate,at:now});
}

export function blockGate({state,gate,code,message,now=new Date().toISOString()}={}){
  const next=copyState(state),current=gateState(next,gate);
  if(!['ready','in_progress','waiting_for_approval'].includes(current.status))throw new Error('GATE_CANNOT_BE_BLOCKED');
  current.previousStatus=current.status;current.status='blocked';current.blocker={code:requiredText(code,'BLOCKER_CODE_REQUIRED'),message:requiredText(message,'BLOCKER_MESSAGE_REQUIRED'),at:now};
  next.updatedAt=now;return result(next,{event:'gate_blocked',gate,code:current.blocker.code,at:now});
}

export function resumeGate({state,gate,now=new Date().toISOString()}={}){
  const next=copyState(state),current=gateState(next,gate);
  if(current.status!=='blocked')throw new Error('GATE_NOT_BLOCKED');
  current.status=current.previousStatus||'in_progress';delete current.previousStatus;delete current.blocker;
  next.updatedAt=now;return result(next,{event:'gate_resumed',gate,at:now});
}
