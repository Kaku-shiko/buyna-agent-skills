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

export function createWorkflow({projectId,now=new Date().toISOString(),workflowVersion='1.1.0',dashboardSlices=[],interactionMode='team'}={}){
  const id=requiredText(projectId,'PROJECT_ID_REQUIRED');
  const gates=Object.fromEntries(gateOrder.map((gate,index)=>[gate,{status:index===0?'ready':'locked'}]));
  return{schemaVersion:1,workflowId:'buyna-website',workflowVersion,projectId:id,currentGate:gateOrder[0],createdAt:now,updatedAt:now,gates,configuration:{interactionMode:normalizeInteractionMode(interactionMode),dashboardSlices:[...new Set(dashboardSlices.map(value=>requiredText(value,'INVALID_DASHBOARD_SLICE')))]},deferredMaterials:[]};
}

export const WORKFLOW_GATES=gateOrder;
export const INTERACTION_MODES=interactionModes;

const commonInteractionPolicy=Object.freeze({
  maxActionQuestionsPerTurn:1,
  approvalChoices:Object.freeze(['确认并进入下一步','需要修改','暂停当前项目']),
  canBypassApproval:false,
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

function copyState(state){return structuredClone(state)}
function gateState(state,gate){
  if(!gateOrder.includes(gate))throw new Error('UNKNOWN_GATE');
  if(state.currentGate!==gate)throw new Error('GATE_NOT_CURRENT');
  return state.gates[gate];
}
function result(state,event){return{state,event}}
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
function hasPassedCheck(value){return nonEmptyArray(value)&&value.some(item=>item?.status==='passed'||item?.status==='PASS'||item==='PASS')}
function validateDelivery(state,gate,delivery){
  if(gate==='customer_intake'&&!requiredText(delivery.record,'CUSTOMER_RECORD_REQUIRED'))return;
  if(gate==='design_and_structure'&&(!requiredText(delivery.designRecord,'DESIGN_RECORD_REQUIRED')||!requiredText(delivery.pageStructure,'PAGE_STRUCTURE_REQUIRED')||!['delivered','postponed'].includes(delivery.boardStatus)))throw new Error('DESIGN_STRUCTURE_EVIDENCE_MISSING');
  if(gate==='frontend_code'&&(!nonEmptyArray(delivery.deliveredFiles)||!hasPassedCheck(delivery.verification)||!requiredText(delivery.interfaceContract,'FRONTEND_DELIVERY_EVIDENCE_MISSING')))throw new Error('FRONTEND_DELIVERY_EVIDENCE_MISSING');
  if(gate==='dashboard_integration'){
    const completed=new Set(delivery.completedSlices??[]),required=state.configuration?.dashboardSlices??[];
    if(required.some(slice=>!completed.has(slice)))throw new Error('DASHBOARD_SLICES_INCOMPLETE');
    if(!nonEmptyArray(delivery.frontendFiles)||!nonEmptyArray(delivery.backendFiles)||!hasPassedCheck(delivery.verification))throw new Error('DASHBOARD_DELIVERY_EVIDENCE_MISSING');
  }
  if(gate==='checkout_payment'&&(!delivery.pendingOrder||!delivery.routingVerified||!delivery.statusSyncVerified||!delivery.idempotencyVerified||!delivery.gmvOutboxVerified||!hasPassedCheck(delivery.verification)))throw new Error('PAYMENT_DELIVERY_EVIDENCE_MISSING');
  if(gate==='testing_upload_gate'&&(delivery.result!=='PASS'||!hasPassedCheck(delivery.verification)))throw new Error('TESTING_DELIVERY_EVIDENCE_MISSING');
  if(gate==='aws_release'&&(!requiredText(delivery.releaseVersion,'RELEASE_VERSION_REQUIRED')||!requiredText(delivery.targetInstance,'TARGET_INSTANCE_REQUIRED')||delivery.newEc2Instances!==0||!nonEmptyArray(delivery.verifiedUrls)||delivery.health!=='passed'||!requiredText(delivery.rollback,'ROLLBACK_EVIDENCE_REQUIRED')))throw new Error('RELEASE_DELIVERY_EVIDENCE_MISSING');
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
  current.delivery=structuredClone(delivery);current.deliveryRecordedAt=now;next.updatedAt=now;
  return result(next,{event:'delivery_recorded',gate,at:now});
}

export function requestApproval({state,gate,now=new Date().toISOString()}={}){
  const next=copyState(state),current=gateState(next,gate);
  if(current.status!=='in_progress')throw new Error('GATE_NOT_IN_PROGRESS');
  if(!current.delivery)throw new Error('DELIVERY_REQUIRED');
  validateDelivery(next,gate,current.delivery);
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

export function markNotApplicable({state,gate,reason,now=new Date().toISOString()}={}){
  const next=copyState(state),current=gateState(next,gate);
  if(!['dashboard_integration','checkout_payment'].includes(gate))throw new Error('GATE_NOT_OPTIONAL');
  if(!['ready','in_progress'].includes(current.status))throw new Error('GATE_CANNOT_BE_SKIPPED');
  current.status='not_applicable';current.reason=requiredText(reason,'NOT_APPLICABLE_REASON_REQUIRED');current.completedAt=now;
  unlockFollowing(next,gate);next.updatedAt=now;
  return result(next,{event:'gate_not_applicable',gate,reason:current.reason,at:now});
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
