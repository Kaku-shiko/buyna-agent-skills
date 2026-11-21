export function reminderFor(payload) {
  const s = payload?.service;
  if (!s || !s.notificationsEnabled || !s.periodVersion || !Number.isFinite(Date.parse(s.endAt)) ||
      !Number.isFinite(s.daysRemaining) || !['EXPIRING', 'EXPIRED', 'GRACE'].includes(s.status)) return null;
  if (s.status === 'EXPIRING' && s.daysRemaining >= 30) return null;
  const identity = [s.projectId, s.sellerId, s.shopId];
  if (identity.some(v => typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(v))) return null;
  return { key: [...identity, s.periodVersion, s.status].join(':'), endAt: s.endAt,
    status: s.status, autoRenew: s.autoRenew === true, daysRemaining: s.daysRemaining };
}
export function reminderDay(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

export function reminderFromSnapshot(snapshot, now = new Date(), expectedIdentity) {
  const s=snapshot?.service, identity=snapshot?.identity;
  if(!expectedIdentity||snapshot?.apiVersion!=='1.1'||snapshot.review?.required||['sellerId','projectId','shopId'].some(key=>!expectedIdentity[key]||identity?.[key]!==expectedIdentity[key])||!snapshot.subscription||!s)return null;
  const end=Date.parse(s.currentPeriodEnd);
  if(!Number.isFinite(end)||!['ACTIVE','EXPIRED','GRACE'].includes(s.status))return null;
  const days=Math.ceil((end-now.getTime())/86400000);
  if (!Number.isFinite(days) || (s.status==='ACTIVE' && days<=0)) return null;
  if(end-now.getTime()>=30*86400000)return null;
  const autoRenew=snapshot.renewal?.enabled===true;
  const stage=days>0?'expiring':s.status;
  return {key:[identity.projectId,identity.sellerId,identity.shopId,snapshot.subscription.id,s.currentPeriodEnd,autoRenew,stage].join(':'),endAt:s.currentPeriodEnd,displayEndAt:snapshot.serviceValidThrough?snapshot.serviceValidThrough+'T00:00:00+09:00':s.currentPeriodEnd,status:s.status==='ACTIVE'?'EXPIRING':s.status,autoRenew,daysRemaining:days,plan:snapshot.scheduledChange?.targetPlanName||snapshot.subscription.planName,amount:autoRenew?snapshot.renewal.nextAmountGross:null,nextBillingAt:snapshot.renewal?.nextBillingAt};
}
