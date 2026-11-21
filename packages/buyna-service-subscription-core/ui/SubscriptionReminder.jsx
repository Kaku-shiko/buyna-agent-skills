import React, {useEffect, useRef, useState} from 'react';
import {reminderFromSnapshot, reminderDay} from './subscription-reminder.mjs';
import './subscription-reminder.css';
import SubscriptionPanel from './SubscriptionPanel.jsx';
import {bindSubscriptionApi} from '../src/integration.mjs';

export default function SubscriptionReminder({api: transport, config, view, onUnauthorized}) {
  const api = React.useMemo(() => bindSubscriptionApi(transport, config), [transport, config]);
  const [notice, setNotice] = useState(null);
  const [modalRequest, setModalRequest] = useState(null);
  const dialog = useRef(null), dismissed = useRef(new Map()), returnFocus = useRef(null);
  const unauthorized = useRef(onUnauthorized); unauthorized.current = onUnauthorized;
  useEffect(() => {
    let disposed = false, busy = false;
    async function refresh() {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const next = reminderFromSnapshot(await api('/api/admin/subscription-state'), new Date(), config.identity);
        let hidden = false;
        if (next) {
          const day = reminderDay();
          hidden = dismissed.current.get(next.key) === day;
          try { hidden ||= localStorage.getItem('buyna-renewal:' + next.key) === day; } catch {}
        }
        if (!disposed) setNotice(hidden ? null : next);
      } catch (error) {
        if (!disposed) { setNotice(null); if (error.status === 401) unauthorized.current(); }
      } finally { busy = false; }
    }
    void refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [api, view]);
  useEffect(() => {
    const element = dialog.current;
    if (!notice || modalRequest || view === 'subscription' || !element) return;
    const previous = document.activeElement;
    returnFocus.current = previous;
    element.showModal();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, [notice?.key, view, modalRequest]);
  useEffect(() => {
    const returnId = new URL(location.href).searchParams.get('subscription_return');
    setModalRequest(view === 'dashboard' && returnId ? {mode:'result', returnId, trigger:document.querySelector('.admin aside button.active')} : null);
  }, [view]);
  function dismiss() {
    if (notice) {
      const day = reminderDay(); dismissed.current.set(notice.key, day);
      try { localStorage.setItem('buyna-renewal:' + notice.key, day); } catch {}
    }
    setNotice(null);
  }
  function launch(mode) {
    dialog.current?.close();
    const trigger = returnFocus.current?.isConnected && returnFocus.current !== document.body
      ? returnFocus.current : document.querySelector('.admin aside button.active');
    dismiss();
    setModalRequest({mode, trigger});
  }
  function closeFlow() {
    if (modalRequest?.returnId) {
      const url = new URL(location.href);
      url.searchParams.delete('subscription_return');
      history.replaceState(history.state, '', url);
      dismiss();
    }
    setModalRequest(null);
  }
  const failed = notice?.status === 'GRACE', expired = notice?.status === 'EXPIRED';
  const debitPreview = notice?.autoRenew && !failed && !expired;
  const displayDate = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)) : '—';
  return <><SubscriptionPanel api={transport} config={config} onUnauthorized={onUnauthorized} modalOnly modalRequest={modalRequest} onDismiss={closeFlow}/>
  {notice && view !== 'subscription' && !modalRequest && <dialog ref={dialog} className="buyna-renewal-reminder" aria-labelledby="buyna-renewal-title" onCancel={event => { event.preventDefault(); dismiss(); }}>
    <button type="button" className="buyna-renewal-close" aria-label="关闭提醒" onClick={dismiss}>×</button>
    <h2 id="buyna-renewal-title">{failed ? '自动续费未成功' : expired ? '服务订阅已到期' : notice.autoRenew ? '服务即将自动续费' : `服务将在 ${notice.daysRemaining} 天后到期`}</h2>
    <span className="buyna-renewal-plan">{notice.plan}</span>
    <dl className="buyna-renewal-details">
      <div><dt>{debitPreview?'下次扣款（日本时间）':'服务到期日（日本时间）'}</dt><dd>{displayDate(debitPreview?notice.nextBillingAt:notice.displayEndAt||notice.endAt)}</dd></div>
      {debitPreview ? <div><dt>应付金额（含税）</dt><dd>{Number.isSafeInteger(notice.amount)?`¥${notice.amount.toLocaleString('ja-JP')}`:'—'}</dd></div> : <div><dt>自动续费</dt><dd>{notice.autoRenew?'已开启':'已关闭'}</dd></div>}
    </dl>
    <p>{failed || (expired && notice.autoRenew) ? '请查看付款结果。' : notice.autoRenew ? '自动续费已开启，无需重复付款。' : '自动续费已关闭。'}</p>
    <div className="buyna-renewal-actions"><button type="button" className="buyna-renewal-primary" onClick={() => launch(debitPreview || failed ? 'overview' : 'plans')}>{debitPreview ? '查看订阅' : failed ? '查看付款结果' : '立即续费'}</button><button type="button" autoFocus onClick={dismiss}>{debitPreview?'知道了':'稍后提醒'}</button></div>
    {debitPreview && <button type="button" className="buyna-renewal-manage" onClick={() => launch('overview')}>管理自动续费</button>}
  </dialog>}</>;
}
