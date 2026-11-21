import React, { useEffect, useId, useRef, useState } from "react";
import {
  catalog,
  subscriptionState,
} from "../src/model.mjs";
import {merchantSubscriptionView} from '../src/client.mjs';
import {bindSubscriptionApi} from '../src/integration.mjs';
import "./subscription.css";
import "./subscription-panel.css";

const messages = {
  zh: {
    title: "服务订阅",
    intro: "网站服务、续费与账单，在这里统一管理。",
    current: "当前服务",
    term: "订阅周期",
    currentAmount: "最近购买金额（含税）",
    website: "已关联当前网站",
    viewSite: "查看网站",
    end: "服务到期日",
    next: "下次扣款",
    amount: "下次应付",
    unknown: "待官方确认",
    not_started: "尚未开通订阅",
    service_active: "服务有效",
    subscribed: "订阅生效中",
    cancel_scheduled: "已取消自动续费",
    payment_failed: "付款需要处理",
    pending: "付款确认中",
    ended: "付费权益已结束",
    error: "订阅信息暂时无法读取。请重试，或联系 Buyna。",
    retry: "重新读取",
    loading: "正在读取订阅信息…",
    choose: "选择订阅周期",
    names: ["1个月", "6个月", "12个月"],
    notes: [
      "每月支付一次。",
      "一次支付6个月，享5%优惠。",
      "一次支付12个月，享10%优惠。",
    ],
    months: "个月服务",
    save: "优惠",
    one: "一次支付整个周期",
    flex: "按月续费",
    payee: "服务费收款方",
    payeeNote: "由 Buyna 官方收取，与商城顾客购物付款独立。",
    card: "付款方式",
    noCard: "暂未返回信用卡信息",
    changeCard: "更换信用卡",
    renew: "自动续费",
    enabled: "已开启",
    disabled: "未开启",
    cancel: "取消自动续费",
    renewUnknown: "当前记录未提供续费授权状态，不会据此发起扣款。",
    cancelNote: "取消后，已付服务保留至本期结束。",
    offers: "续费",
    renewalPlans: "续费方案",
    extensionStart:
      "续费从付款确认时间与原到期日中较晚者起算，原有服务期限不会缩短。",
    extensionCycle: "后续自动续费按所选 {n} 个月周期，保持当前开关状态。",
    extensionOn: "自动续费：已开启",
    extensionOff: "自动续费：已关闭",
    renewedEnd: "续费后到期（预计）",
    renewedNext: "续费后下次扣款（预计）",
    cycle: "续费周期",
    noNext: "未安排扣款",
    extensionLocked: "已有订阅仅支持同套餐续费。",
    extensionUnavailable:
      "当前订阅暂不能叠加续费。如有付款正在确认，请先等待结果。",
    confirm: "查看费用明细",
    bill: "账单与付款记录",
    noBill: "尚无可展示的在线账单",
    noBillNote: "账单以官方核验的支付记录为准，不根据服务状态生成。",
    support: "联系 Buyna",
    preserve: "服务期限待确认，请联系客服。",
    newNote: "尚未关联在线订阅。已有付费服务请先联系 Buyna 核对。",
    pendingNote: "请等待支付结果确认，不要重复开通。",
    failedNote: "请联系 Buyna 核对扣款结果，避免重复支付。",
    drawer: "确认服务方案",
    estimate: "费用预览",
    fee: "订阅费用",
    discount: "优惠金额",
    tax: "消费税（10%）",
    total: "预计应付",
    noCharge:
      "本页仅预览费用，不会立即扣款。最终金额及生效日期由官方结账确认。",
    renewCheck: "自动续费",
    renewTerm: "每{n}个月续费一次，可在下次扣款前取消。",
    agree: "我已阅读并同意",
    terms: "订阅条款",
    privacy: "隐私政策",
    continue: "前往付款",
    unavailable: "官方在线开通接口尚未接通，暂不能在此绑卡或付款。",
    managementUnavailable: "该操作尚未接通官方订阅服务，请联系 Buyna 处理。",
    close: "关闭",
    date: "付款日期",
    paid: "实付金额",
    status: "状态",
    download: "下载账单",
  },
  ja: {
    title: "サービス契約",
    intro: "サイトのサービス・更新・請求をまとめて管理。",
    current: "現在のサービス",
    term: "契約期間",
    currentAmount: "直近の購入額（税込）",
    website: "現在のサイトに連携済み",
    viewSite: "サイトを見る",
    end: "利用期限",
    next: "次回請求日",
    amount: "次回請求額",
    unknown: "確認待ち",
    not_started: "未契約",
    service_active: "サービス利用中",
    subscribed: "契約中",
    cancel_scheduled: "自動更新停止済み",
    payment_failed: "お支払いの確認が必要",
    pending: "お支払い確認中",
    ended: "有料機能の利用終了",
    error: "契約情報を取得できません。再試行するかお問い合わせください。",
    retry: "再読み込み",
    loading: "契約情報を確認しています…",
    choose: "契約期間を選択",
    names: ["1か月", "6か月", "12か月"],
    notes: [
      "毎月のお支払い。",
      "6か月分一括払い・5%割引。",
      "12か月分一括払い・10%割引。",
    ],
    months: "か月分",
    save: "割引",
    one: "期間分を一括払い",
    flex: "気軽に選べる",
    payee: "サービス料金のお支払い先",
    payeeNote: "Buynaへのサービス料金です。店舗のお客様からの売上とは別です。",
    card: "お支払い方法",
    noCard: "カード情報はまだ取得できていません",
    changeCard: "カードを変更",
    renew: "自動更新",
    enabled: "有効",
    disabled: "無効",
    cancel: "自動更新を停止",
    renewUnknown: "更新承認の情報がありません。この状態では請求しません。",
    cancelNote: "停止後も支払済みの期間はご利用いただけます。",
    offers: "更新",
    renewalPlans: "更新プラン",
    extensionStart:
      "お支払い確認時と現在の利用期限のうち遅い方から延長します。既存の期間は短縮されません。",
    extensionCycle:
      "次回以降の自動更新は選択した{n}か月周期となり、更新の設定は維持されます。",
    extensionOn: "自動更新：有効",
    extensionOff: "自動更新：停止中",
    renewedEnd: "更新後の利用期限（予定）",
    renewedNext: "更新後の次回請求日（予定）",
    cycle: "更新間隔",
    noNext: "請求予定なし",
    extensionLocked: "現在と同じプランのみ延長できます。",
    extensionUnavailable:
      "現在は延長できません。処理中のお支払いがある場合は結果をお待ちください。",
    confirm: "料金の内訳を見る",
    bill: "請求・支払い履歴",
    noBill: "表示できるオンライン請求はありません",
    noBillNote: "請求は確認済みの支払い記録に基づきます。",
    support: "Buynaに問い合わせ",
    preserve:
      "利用期間の確認が必要です。サポートにお問い合わせください。",
    newNote:
      "オンライン契約は未連携です。お支払い済みの場合はお問い合わせください。",
    pendingNote: "お支払い結果を確認中です。重複して申し込まないでください。",
    failedNote: "重複支払いを避けるため、請求結果をお問い合わせください。",
    drawer: "サービスプランを確認",
    estimate: "料金プレビュー",
    fee: "サービス料金",
    discount: "割引額",
    tax: "消費税（10%）",
    total: "予定合計",
    noCharge:
      "料金の確認のみで請求は発生しません。最終金額と開始日は決済時に確定します。",
    renewCheck: "選択した期間で自動更新",
    renewTerm: "{n}か月ごとに更新。次回請求前に停止できます。",
    agree: "以下に同意します",
    terms: "契約条件",
    privacy: "プライバシーポリシー",
    continue: "お支払いへ",
    unavailable:
      "オンライン契約の接続準備中です。現在はカード登録・決済できません。",
    managementUnavailable:
      "この操作は現在ご利用いただけません。Buynaへお問い合わせください。",
    close: "閉じる",
    date: "支払日",
    paid: "支払額",
    status: "状態",
    download: "請求書",
  },
  en: {
    title: "Service subscription",
    intro: "Your website service, renewals and billing in one place.",
    current: "Current service",
    term: "Subscription term",
    currentAmount: "Most recent purchase (tax included)",
    website: "Linked to this website",
    viewSite: "View site",
    end: "Service ends",
    next: "Next charge",
    amount: "Next amount",
    unknown: "Awaiting confirmation",
    not_started: "No online subscription",
    service_active: "Service active",
    subscribed: "Subscription active",
    cancel_scheduled: "Renewal cancelled",
    payment_failed: "Payment needs attention",
    pending: "Payment pending",
    ended: "Paid features ended",
    error: "Subscription details are unavailable. Retry or contact Buyna.",
    retry: "Refresh",
    loading: "Loading subscription…",
    choose: "Select subscription term",
    names: ["1 month", "6 months", "12 months"],
    notes: [
      "Pay each month.",
      "Pay for 6 months and save 5%.",
      "Pay for 12 months and save 10%.",
    ],
    months: "months of service",
    save: "Save",
    one: "One payment for the full term",
    flex: "Flexible start",
    payee: "Service fee recipient",
    payeeNote: "Paid to Buyna, separate from your customers’ purchases.",
    card: "Payment method",
    noCard: "Card details are not currently available",
    changeCard: "Change card",
    renew: "Auto-renewal",
    enabled: "Enabled",
    disabled: "Disabled",
    cancel: "Cancel auto-renewal",
    renewUnknown:
      "No confirmed renewal authorization. This record does not authorize charges.",
    cancelNote: "Your paid service remains available through the current term.",
    offers: "Renew",
    renewalPlans: "Renewal plans",
    extensionStart:
      "The extension starts at the later of confirmed payment time or your current expiry. Your existing term is not shortened.",
    extensionCycle:
      "Future automatic renewals follow the selected {n}-month term. Your current renewal setting is preserved.",
    extensionOn: "Auto-renewal: on",
    extensionOff: "Auto-renewal: off",
    renewedEnd: "Service end after renewal (estimated)",
    renewedNext: "Next charge after renewal (estimated)",
    cycle: "Renewal term",
    noNext: "No charge scheduled",
    extensionLocked: "You can only extend your current plan.",
    extensionUnavailable:
      "This subscription cannot be extended right now. Wait for any pending payment to be confirmed.",
    confirm: "Review fees",
    bill: "Billing and payment history",
    noBill: "No online billing details available",
    noBillNote:
      "Bills require verified payment records, not service status alone.",
    support: "Contact Buyna",
    preserve:
      "Service dates need confirmation. Please contact support.",
    newNote:
      "No linked online subscription. Contact Buyna if you have already paid.",
    pendingNote: "Awaiting payment confirmation. Do not subscribe again.",
    failedNote:
      "Contact Buyna to check the result before making another payment.",
    drawer: "Review service plan",
    estimate: "Fee preview",
    fee: "Subscription fee",
    discount: "Discount",
    tax: "Consumption tax (10%)",
    total: "Estimated total",
    noCharge:
      "Review only. No charge is made here. Final amount and start date are confirmed at checkout.",
    renewCheck: "Renew automatically for this term",
    renewTerm: "Renews every {n} month(s). Cancel before the next charge.",
    agree: "I have read and agree to",
    terms: "Subscription terms",
    privacy: "Privacy policy",
    continue: "Continue to payment",
    unavailable:
      "Online activation is not connected yet. Card setup and payment are unavailable here.",
    managementUnavailable:
      "This action is not connected yet. Contact Buyna for assistance.",
    close: "Close",
    date: "Payment date",
    paid: "Amount paid",
    status: "Status",
    download: "Invoice",
  },
};
const yen = (n) => Number.isSafeInteger(n)?`¥${n.toLocaleString("ja-JP")}`:'—';
const day = (v, language) =>
  v && !Number.isNaN(Date.parse(v))
    ? new Date(v).toLocaleDateString(
        { zh: "zh-CN", ja: "ja-JP", en: "en-GB" }[language],
        { timeZone: "Asia/Tokyo" },
      )
    : null;

const serviceDay=(data,language)=>day(data?.snapshot?.serviceValidThrough?data.snapshot.serviceValidThrough+'T00:00:00+09:00':data?.currentPeriodEnd,language);
function validPlanChange(change, data) {
  return Boolean(change && change.mode === 'next_cycle' && change.targetPlan === 'pro' &&
    change.chargeNow === 0 && change.currency === 'JPY' && typeof change.autoRenew === 'boolean' &&
    [1, 6, 12].includes(change.months) && change.months === (data?.snapshot?.subscription?.renewalMonths ?? data?.billingMonths) &&
    Number.isFinite(Date.parse(change.effectiveAt)) && Date.parse(change.effectiveAt) === Date.parse(data?.currentPeriodEnd) &&
    ['subtotal', 'tax', 'gross'].every(key => Number.isSafeInteger(change[key]) && change[key] >= 0) &&
    change.gross > 0 && change.subtotal + change.tax === change.gross && change.nextAmountGross === change.gross);
}
function canScheduleUpgrade(data) {
  const change = data?.snapshot?.upgradePreview;
  return validPlanChange(change, data) && data.planCode === 'basic' && Boolean(data.subscriptionId) &&
    !data.snapshot.scheduledChange && !data.snapshot.review?.required && !data.renewalProcessing &&
    ['active', 'cancel_at_period_end'].includes(data.status) && Date.parse(change.effectiveAt) > Date.now() &&
    change.autoRenew === (data.billingEnabled === true && data.cancelAtPeriodEnd !== true);
}
function canPayScheduledChange(data) {
  const change = data?.snapshot?.scheduledChange;
  return validPlanChange(change, data) && change.status === 'scheduled' && data.planCode === 'basic' &&
    Date.now() >= Date.parse(change.effectiveAt) && !data.snapshot.review?.required &&
    data.canExtend === true && !data.renewalProcessing &&
    ['active', 'cancel_at_period_end', 'past_due', 'cancelled'].includes(data.status) &&
    typeof data.snapshot.renewal?.enabled === 'boolean' &&
    change.autoRenew === data.snapshot.renewal.enabled &&
    data.snapshot.renewalPreview?.options?.some(option => option.months === change.months);
}

const checkoutNotes = {
  zh: {
    failed: "暂时无法进入付款，请重试或联系 info@buyna.jp。",
    progress: "正在进入官方结账…",
    ready: "下一步直接前往官方信用卡收银台。",
    renew: "请确认自动续费后继续。",
    billing: "账单资料", saved: "此前保存的账单资料，请确认。", edit: "编辑", company: "公司名称", contact: "联系人", email: "电子邮箱",
    contextLoading: "正在读取账单资料…", contextError: "账单资料读取失败，请重试。", contextRetry: "重试账单资料",
    accept: "我已阅读并同意",
  },
  ja: {
    failed: "決済へ進めません。再試行またはお問い合わせください。",
    progress: "公式決済へ移動中…",
    ready: "次に公式カード決済画面へ直接進みます。",
    renew: "自動更新をご確認ください。",
    billing: "請求先情報", saved: "以前保存した請求先情報をご確認ください。", edit: "編集", company: "会社名", contact: "担当者名", email: "メールアドレス",
    contextLoading: "請求先情報を取得中…", contextError: "請求先情報を取得できません。再試行してください。", contextRetry: "請求先情報を再取得",
    accept: "以下を読み、同意します：",
  },
  en: {
    failed: "Unable to open checkout. Retry or contact info@buyna.jp.",
    progress: "Opening official checkout…",
    ready: "Next, go directly to the official hosted card checkout.",
    renew: "Confirm automatic renewal to continue.",
    billing: "Billing details", saved: "Review your previously saved billing details.", edit: "Edit", company: "Company name", contact: "Contact name", email: "Email",
    contextLoading: "Loading billing details…", contextError: "Unable to load billing details. Please retry.", contextRetry: "Retry billing details",
    accept: "I have read and agree to the",
  },
};
export function SubscriptionView({
  config,
  data,
  loading,
  error,
  onReload,
  language,
  setLanguage,
  onCheckout,
  onLoadPaymentContext,
  onSaveBillingProfile,
  onCancel,
  onScheduleUpgrade,
  onResume,
  onCancelPlanChange,
  modalOnly = false,
  modalRequest,
  onDismiss,
}) {
  const dialogTitleId = useId(), cancelTitleId = useId(), checkoutNoteId = useId();
  const t = messages[language],
    state = subscriptionState(data),
    paymentText = checkoutNotes[language];
  const [paying, setPaying] = useState(false),
    [paymentError, setPaymentError] = useState("");
  const checkoutBusy = useRef(false);
  const refreshBusy = useRef(false);
  const [refreshStatus, setRefreshStatus] = useState('idle');
  const refreshText = ({zh:{loading:'正在更新…',success:'订阅信息已更新',error:'更新失败，请重试'},ja:{loading:'更新中…',success:'契約情報を更新しました',error:'更新できませんでした。再試行してください'},en:{loading:'Refreshing…',success:'Subscription updated',error:'Refresh failed. Please retry.'}})[language];
  async function refreshSubscription() {
    if (refreshBusy.current) return;
    refreshBusy.current = true;
    setRefreshStatus('loading');
    try {
      const snapshot = await onReload();
      setRefreshStatus(snapshot ? 'success' : 'error');
    } catch {
      setRefreshStatus('error');
    } finally {
      refreshBusy.current = false;
    }
  }
  const [resumeMessage,setResumeMessage]=useState('');
  const [planResult,setPlanResult]=useState(null);
  const changeText=({zh:{cancel:'取消套餐变更',confirm:'确认取消套餐变更',keep:'保留套餐变更',saved:'套餐更改已保存',cancelled:'套餐变更已取消',done:'完成',failed:'暂时无法确认结果，请重新读取后查看。',noCharge:'本次未收费。',title:'更改套餐'},ja:{cancel:'プラン変更を取り消す',confirm:'プラン変更の取消を確認',keep:'プラン変更を維持',saved:'プラン変更を保存しました',cancelled:'プラン変更を取り消しました',done:'完了',failed:'結果を確認できません。再読み込みしてください。',noCharge:'今回の請求はありません。',title:'プラン変更'},en:{cancel:'Cancel plan change',confirm:'Confirm cancellation of plan change',keep:'Keep plan change',saved:'Plan change saved',cancelled:'Plan change cancelled',done:'Done',failed:'Unable to confirm. Refresh to check the result.',noCharge:'No charge today.',title:'Change plan'}})[language];
  async function cancelPlanChange(){
    if(checkoutBusy.current||!onCancelPlanChange||!scheduledChange)return;
    checkoutBusy.current=true;setPaying(true);setPaymentError('');
    const key=`cancel-change:${data.subscriptionId}:${data.snapshot.stateVersion}:${scheduledChange.requestId}`;
    if(!checkoutAttempts.current.has(key))checkoutAttempts.current.set(key,crypto.randomUUID());
    try{
      const result=await onCancelPlanChange({subscriptionId:data.subscriptionId,expectedVersion:data.snapshot.stateVersion,changeRequestId:scheduledChange.requestId,requestId:checkoutAttempts.current.get(key),confirm:true});
      setPlanResult({kind:'cancelled',snapshot:result.snapshot});setDialogMode('plan-result');
    }catch{setPaymentError(changeText.failed);}
    finally{checkoutBusy.current=false;setPaying(false);}
  }
  const resumeText=({zh:{title:'开启自动续费',confirm:'确认开启自动续费',note:'开启后按期自动扣款，今天不收费。',done:'自动续费已开启',failed:'未能确认开启结果，请重新读取后重试。',authorization:'信用卡授权需要重新确认，自动续费未开启。',expired:'当前服务已到期，请先续费。',checking:'正在核验信用卡授权…'},ja:{title:'自動更新を再開',confirm:'自動更新の再開を確認',note:'更新日に請求します。本日の請求はありません。',done:'自動更新を再開しました',failed:'結果を確認できません。再読み込みしてください。',authorization:'カードの承認を再確認してください。自動更新は停止中です。',expired:'利用期限が終了しました。先に更新してください。',checking:'カードの承認を確認中…'},en:{title:'Enable auto-renewal',confirm:'Confirm auto-renewal',note:'You will be charged on the renewal date, not today.',done:'Auto-renewal enabled',failed:'Unable to confirm. Refresh before retrying.',authorization:'Card authorization needs confirmation. Auto-renewal remains off.',expired:'Your service has expired. Renew first.',checking:'Checking card authorization…'}})[language];
  async function resumeRenewal(){
    if(checkoutBusy.current||!onResume)return;
    checkoutBusy.current=true;setPaying(true);setResumeMessage('');
    const key=`resume:${data.subscriptionId}:${data.snapshot.stateVersion}`;
    if(!checkoutAttempts.current.has(key))checkoutAttempts.current.set(key,crypto.randomUUID());
    try{await onResume({subscriptionId:data.subscriptionId,expectedVersion:data.snapshot.stateVersion,requestId:checkoutAttempts.current.get(key),confirm:true});setResumeMessage(resumeText.done);}
    catch(error){setResumeMessage(error.message==='AUTHORIZATION_REVIEW_REQUIRED'?resumeText.authorization:error.message==='RENEWAL_PAYMENT_REQUIRED'?resumeText.expired:resumeText.failed);}
    finally{checkoutBusy.current=false;setPaying(false);}
  }
  const [profile, setProfile] = useState({}),
    [profileRevision, setProfileRevision] = useState(0),
    [profileSaveStatus, setProfileSaveStatus] = useState('idle'),
    [contextStatus, setContextStatus] = useState('idle'),
    [contextSource, setContextSource] = useState(null),
    [editingProfile, setEditingProfile] = useState(false);
  const contextRequest = useRef(0), editedFields = useRef(new Set()), checkoutAttempts = useRef(new Map());
  const emailOptional = data?.snapshot?.capabilities?.optionalBillingEmail === true;
  const profileReady = ['company_name', 'contact_name'].every(key => typeof profile[key] === 'string' && profile[key].trim()) && ((emailOptional && !profile.email?.trim()) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email?.trim() || ''));
  async function loadPaymentContext() {
    const id = ++contextRequest.current;
    setContextStatus('loading');
    try {
      const context = await onLoadPaymentContext();
      if (!context || !['subscription_billing', 'empty'].includes(context.source) || !context.profile || typeof context.profile !== 'object') throw Error('invalid_payment_context');
      if (id !== contextRequest.current) return;
      const saved = Object.fromEntries(['company_name', 'contact_name', 'email', 'phone', 'company_address', 'country', 'notes'].map(key => [key, typeof context.profile[key] === 'string' ? context.profile[key] : '']));
      setProfile(current => ({...saved, ...Object.fromEntries(Object.entries(current).filter(([key]) => editedFields.current.has(key)))}));
      setContextSource(context.source);
      setProfileRevision(context.revision ?? 0);
      setContextStatus('ready');
    } catch {
      if (id === contextRequest.current) setContextStatus('error');
    }
  }
  const profileSaving = useRef(false);
  const profileText = ({zh:{save:'保存账单资料',saving:'正在保存…',saved:'账单资料已保存',failed:'保存失败，请重试',conflict:'资料已在其他窗口修改，请重新读取后确认'},ja:{save:'請求先情報を保存',saving:'保存中…',saved:'請求先情報を保存しました',failed:'保存できませんでした',conflict:'他の画面で変更されました。再読み込みしてください'},en:{save:'Save billing details',saving:'Saving…',saved:'Billing details saved',failed:'Save failed. Please retry.',conflict:'Details changed elsewhere. Reload before saving.'}})[language];
  async function saveBillingProfile() {
    if (profileSaving.current || !profileReady || !onSaveBillingProfile) return false;
    profileSaving.current = true; setProfileSaveStatus('saving');
    try {
      const result = await onSaveBillingProfile({profile, revision:profileRevision});
      if (!Number.isSafeInteger(result?.revision) || !result?.profile) throw Error('INVALID_PROFILE_RESPONSE');
      setProfile(result.profile); setProfileRevision(result.revision); editedFields.current.clear();
      setContextSource('subscription_billing'); setEditingProfile(false); setProfileSaveStatus('saved');
      return true;
    } catch(error) {
      setProfileSaveStatus(error.message === 'PROFILE_CONFLICT' ? 'conflict' : 'failed'); return false;
    } finally {profileSaving.current = false;}
  }
  async function proceed() {
    if (
      checkoutBusy.current ||
      !checkoutAllowed || !priceReady || contextStatus !== 'ready' || !profileReady ||
      !consent ||
      dialogMode !== 'preview' ||
      (scheduledChange && !canPayScheduledChange(data)) ||
      (!extending && !renew) ||
      !onCheckout
    )
      return;
    checkoutBusy.current = true;
    setPaying(true);
    setPaymentError("");
    try {
      if (onSaveBillingProfile && (editedFields.current.size || contextSource !== 'subscription_billing') && !await saveBillingProfile()) {
        checkoutBusy.current=false;setPaying(false);return;
      }
      const key = JSON.stringify([data?.snapshot?.identity, data?.subscriptionId, data?.snapshot?.stateVersion, selectedPlan, checkoutMonths, checkoutRenew, extending, scheduledChange?.requestId]);
      if (!checkoutAttempts.current.has(key)) checkoutAttempts.current.set(key, crypto.randomUUID());
      const result = await onCheckout({
        plan: selectedPlan,
        months: checkoutMonths,
        autoRenew: checkoutRenew,
        ...(extending ? { intent: "extend" } : {}),
        expectedVersion: data.snapshot.stateVersion,
        expectedTotalJpy: quote.gross,
        requestId: checkoutAttempts.current.get(key),
        agree: true,
        language,
        profile: Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, value.trim()])),
      });
      if (result?.status === 'active') {
        setDialogMode(modalOnly ? 'overview' : null);
        checkoutBusy.current = false;
        setPaying(false);
      }
    } catch {
      setPaymentError(paymentText.failed);
      checkoutBusy.current = false;
      setPaying(false);
    }
  }
  async function scheduleUpgrade() {
    if (checkoutBusy.current || !consent || !onScheduleUpgrade || !canScheduleUpgrade(data)) return;
    checkoutBusy.current = true;
    setPaying(true);
    setPaymentError('');
    try {
      const key = JSON.stringify(['schedule-upgrade', data.snapshot.identity, data.subscriptionId, data.snapshot.stateVersion, data.snapshot.upgradePreview]);
      if (!checkoutAttempts.current.has(key)) checkoutAttempts.current.set(key, crypto.randomUUID());
      const result=await onScheduleUpgrade({subscriptionId:data.subscriptionId, expectedVersion:data.snapshot.stateVersion,
        requestId:checkoutAttempts.current.get(key), plan:'pro', agree:true});
      setPlanResult({kind:'saved',snapshot:result.snapshot});setDialogMode('plan-result');
    } catch {
      setPaymentError(({zh:'暂时无法确认预约结果，请重新读取后重试。',ja:'予約結果を確認できません。再読み込みしてから再試行してください。',en:'Unable to confirm the reservation. Refresh and retry.'})[language]);
    } finally {
      checkoutBusy.current = false;
      setPaying(false);
    }
  }
  const [cancelConfirm, setCancelConfirm] = useState(false),
    [cancelling, setCancelling] = useState(false),
    [cancelMessage, setCancelMessage] = useState("");
  const cancelText = {
    zh: {
      title: "取消自动续费？",
      note: "付费权益保留至本期结束，到期不再扣款。商城继续营业，订单与数据保留。",
      keep: "保留订阅",
      confirm: "确认取消续费",
      done: "自动续费已关闭。",
      failed: "暂时无法确认取消结果，请刷新查看最新状态，或联系 info@buyna.jp。",
      processing: "本期扣款正在处理，取消尚未完成，请稍后重试。",
      ended: "付费权益已结束，商城继续营业。",
    },
    ja: {
      title: "自動更新を停止しますか？",
      note: "有料機能は利用期限まで有効です。その後の請求は停止します。店舗・注文・データは維持されます。",
      keep: "契約を継続",
      confirm: "自動更新を停止",
      done: "自動更新を停止しました。",
      failed: "停止結果を確認できません。再読み込みで最新の状態をご確認ください。",
      processing:
        "決済処理中です。停止は未完了のため、後ほど再試行してください。",
      ended: "有料機能は終了しました。店舗は営業を継続します。",
    },
    en: {
      title: "Cancel automatic renewal?",
      note: "Paid features remain until the current term ends. No further renewal charges. Your store, orders and data stay available.",
      keep: "Keep subscription",
      confirm: "Confirm cancellation",
      done: "Auto-renewal is off.",
      failed: "Cancellation could not be confirmed. Refresh to check the latest state or contact info@buyna.jp.",
      processing:
        "A payment is processing. Cancellation has not completed; retry shortly.",
      ended: "Paid features have ended. Your store remains open.",
    },
  }[language];
  async function cancel() {
    if (checkoutBusy.current || !onCancel) return;
    checkoutBusy.current = true;
    setCancelling(true);
    setCancelMessage("");
    try {
      await onCancel({ subscriptionId: data.subscriptionId, confirm: true,expectedVersion:data.stateVersion });
      setCancelConfirm(false);
      setCancelMessage(cancelText.done);
    } catch (e) {
      setCancelMessage(
        e.data?.operationCommitted ? {zh:'请求已提交，请刷新确认最新续费状态。',ja:'手続きは送信済みです。再読み込みして状態をご確認ください。',en:'The change was committed. Refresh to confirm the latest state.'}[language] : e.message === "RENEWAL_PROCESSING"
          ? cancelText.processing
          : cancelText.failed,
      );
    } finally {
      checkoutBusy.current = false;
      setCancelling(false);
    }
  }
  const [plan, setPlan] = useState("basic"),
    [months, setMonths] = useState(1),
    [dialogMode, setDialogMode] = useState(null),
    [consent, setConsent] = useState(false),
    [renew, setRenew] = useState(true);
  const extending =
    data?.source === "Buyna payments" &&
    Boolean(
      data?.subscriptionId &&
      data?.currentPeriodStart &&
      data?.currentPeriodEnd,
    ) &&
    ["basic", "pro"].includes(data?.planCode);
  const scheduledChange = data?.snapshot?.scheduledChange;
  const selectedPlan = scheduledChange ? scheduledChange.targetPlan : extending ? data.planCode : plan;
  const extensionRenew =
    data?.billingEnabled === true && data?.cancelAtPeriodEnd !== true;
  const checkoutMonths = scheduledChange ? scheduledChange.months : months;
  const renewalOptIn=data?.snapshot?.capabilities?.renewalOptIn===true;
  const checkoutRenew = scheduledChange&&!renewalOptIn ? data.snapshot.renewal.enabled : extending&&!renewalOptIn ? extensionRenew : renew;
  const dialog = useRef(null),
    dialogTrigger = useRef(null),
    dialogClose = useRef(null),
    quote = scheduledChange ?? data?.plans?.find(p=>p.code===selectedPlan)?.quotes?.find(q=>q.months===months)??{base:null,discount:null,subtotal:null,tax:null,gross:null};
  const dialogOpen = dialogMode !== null;
  const paidBills = (data?.snapshot?.billingHistory ?? []).filter(bill => bill.status === 'paid');
  const returnedBill = data?.snapshot?.billingHistory?.find(bill => bill.id === modalRequest?.returnId);
  const returnedPaid = returnedBill?.status === 'paid';
  const resultTitle = ({zh:'付款结果',ja:'お支払い結果',en:'Payment result'})[language];
  useEffect(() => {
    if (dialogMode === 'preview') void loadPaymentContext();
    return () => { contextRequest.current++; };
  }, [dialogMode]);
  useEffect(() => {
    if (!modalOnly) return;
    dialogTrigger.current = modalRequest?.trigger ?? dialogTrigger.current;
    setConsent(false);
    setPaymentError('');
    setCancelConfirm(false);
    setDialogMode(modalRequest?.mode ?? null);
  }, [modalRequest, modalOnly]);
  useEffect(() => {
    if (dialogOpen) {
      dialog.current?.showModal();
      dialogClose.current?.focus();
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    } else if (dialog.current?.open) {
      dialog.current.close();
      if (dialogTrigger.current?.isConnected) dialogTrigger.current.focus();
    }
  }, [dialogOpen]);
  useEffect(() => {
    if (!modalOnly && (loading || error)) setDialogMode(null);
  }, [loading, error, modalOnly]);
  useEffect(()=>{setConsent(false);},[data?.snapshot?.stateVersion, selectedPlan, checkoutMonths, renew, extensionRenew, JSON.stringify(data?.snapshot?.upgradePreview), JSON.stringify(scheduledChange)]);
  function openDialog(mode, event) {
    if (!dialog.current?.open) dialogTrigger.current = event.currentTarget;
    if (mode === "preview" || mode === 'upgrade') {
      setConsent(false);
      setPaymentError("");
    }
    setDialogMode(mode);
    if (dialog.current) dialog.current.scrollTop = 0;
    dialogClose.current?.focus();
  }
  function closeDialog() {
    if (checkoutBusy.current) return;
    setDialogMode(null);
    if (modalOnly) onDismiss?.();
  }
  function keepDialogFocus(event) {
    if (event.key !== "Tab") return;
    const controls = [
      ...event.currentTarget.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]',
      ),
    ].filter((element) => element.getClientRects().length > 0);
    const first = controls[0],
      last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  const active =
    String(data?.plan || "").toLowerCase() !== "free" &&
    state.key !== "not_started" &&
    state.key !== "ended" &&
    state.key !== "pending" &&
    state.key !== "unknown";
  const checkoutAllowed = scheduledChange ? canPayScheduledChange(data) : extending
    ? data.canExtend === true &&
      data.renewalProcessing !== true &&
      ["active", "cancel_at_period_end", "past_due", "cancelled"].includes(
        data.status,
      )
    : !active && data?.capabilities?.checkout === true;
  const priceReady=Number.isSafeInteger(quote.gross)&&quote.gross>0;
  const renewalResult=data?.snapshot?.renewalPreview?.options?.find(option=>option.months===checkoutMonths);
  const scheduledPaymentNote = scheduledChange && (Date.now() < Date.parse(scheduledChange.effectiveAt)
    ? ({zh:'已预约下一周期 Pro，当前不收费。到期后才可支付预约周期的全额费用。',ja:'次期Proを予約済みです。現在は請求せず、利用期限到来後に予約期間の料金を全額お支払いいただけます。',en:'Pro is reserved for the next cycle. No charge now; the full booked-cycle payment is available only at expiry.'})[language]
    : ({zh:'按已预约的 Pro 套餐与周期支付全额费用，套餐和周期不可更改。付款核验成功后才启用 Pro，自动续费设置保持不变。',ja:'予約済みのProプラン・期間の全額をお支払いいただきます。変更はできません。支払い確認後にProが有効になり、自動更新設定は維持されます。',en:'Pay the full reserved Pro cycle. The plan and term are locked. Pro activates after verified payment; auto-renewal stays unchanged.'})[language]);
  const extensionNotice = extending && (
    <p className="bs-info bs-extension-note">
      {t.end}: <strong>{serviceDay(data, language)}</strong>
      <br />
      {t.renewedEnd}: <strong>{day(renewalResult?.endAt,language)||'—'}</strong>
      <br />
      {t.cycle}: <strong>{checkoutMonths} {t.months}</strong>
      <br />
      {renewalOptIn&&checkoutRenew ? ({zh:'付款授权成功后开启自动续费',ja:'決済と承認の完了後に自動更新を開始',en:'Auto-renewal starts after payment and authorization'})[language] : extensionRenew ? t.extensionOn : t.extensionOff}
      <br />
      {t.renewedNext}: <strong>{checkoutRenew?(day(renewalOptIn?renewalResult?.endAt:renewalResult?.nextBillingAt,language)||'—'):t.noNext}</strong>
    </p>
  );
  const upgradeQuote = scheduledChange || data?.snapshot?.upgradePreview;
  const resumeQuote=scheduledChange??{subtotal:data?.snapshot?.fees?.subtotal,tax:data?.snapshot?.fees?.taxAmount,gross:data?.snapshot?.fees?.contractAmountGross};
  const resumeReady=data?.snapshot?.identity?.sellerId===config.identity.sellerId&&data?.status==='cancel_at_period_end'&&data?.billingEnabled===false&&!data?.snapshot?.review?.required&&!data?.renewalProcessing&&Date.parse(data?.currentPeriodEnd)>Date.now()&&[resumeQuote.subtotal,resumeQuote.tax,resumeQuote.gross].every(Number.isSafeInteger)&&resumeQuote.subtotal+resumeQuote.tax===resumeQuote.gross;
  const upgradeScheduled = scheduledChange?.status === 'scheduled' && validPlanChange(scheduledChange, data);
  const upgradeReady = canScheduleUpgrade(data);
  const upgradeDetails = <>
    <dl className="bs-costs">
      <div><dt>{t.end}</dt><dd>{serviceDay(data, language) || '—'}</dd></div>
      <div><dt>{t.renew}</dt><dd>{extensionRenew ? t.enabled : t.disabled}</dd></div>
    </dl>
    {validPlanChange(upgradeQuote, data) && <>
      <h4 className="bs-renewal-heading">{({zh:'下一周期 Pro 费用',ja:'次期Pro料金',en:'Next-cycle Pro price'})[language]}</h4>
      <dl className="bs-costs bs-renewal-costs">
        <div><dt>{({zh:'本次收费',ja:'今回の請求',en:'Charge now'})[language]}</dt><dd>{yen(upgradeQuote.chargeNow)}</dd></div>
        <div><dt>{({zh:'下一周期开始',ja:'次期の開始日',en:'Next cycle starts'})[language]}</dt><dd>{day(upgradeQuote.effectiveAt, language)}</dd></div>
        <div><dt>{t.term}</dt><dd>{upgradeQuote.months} {t.months}</dd></div>
        <div><dt>{({zh:'每期费用（税前）',ja:'更新料金（税抜）',en:'Renewal subtotal (before tax)'})[language]}</dt><dd>{yen(upgradeQuote.subtotal)}</dd></div>
        <div><dt>{t.tax}</dt><dd>{yen(upgradeQuote.tax)}</dd></div>
        <div className="bs-cost-total"><dt>{({zh:'每期费用（含税）',ja:'更新料金（税込）',en:'Renewal price (tax included)'})[language]}</dt><dd>{yen(upgradeQuote.gross)}</dd></div>
      </dl>
    </>}
    <p>{({zh:'今天不收费。当前服务到期后，付款成功启用 Pro。',ja:'本日の請求はありません。現在の利用期限後、お支払い確認後にProが有効になります。',en:'No charge today. Pro activates after payment for the next cycle at your current expiry.'})[language]}</p>
    <p>{extensionRenew ? ({zh:'自动续费开启时，下一周期按 Pro 全额扣款。',ja:'自動更新が有効な場合、次期にPro料金の全額を請求します。',en:'With auto-renewal on, the next cycle is charged at the full Pro price.'})[language] : ({zh:'自动续费已关闭，不会自动扣款；到期后需手动支付下一期 Pro 费用。',ja:'自動更新は停止中です。自動請求は行わず、期限到来後に次期Pro料金を手動でお支払いいただきます。',en:'Auto-renewal is off: no automatic charge. Pay manually for the next Pro cycle at expiry.'})[language]}</p>
    {upgradeScheduled ? <p role="status">{({zh:'已预约下期升级，本次未收费。当前套餐仍为 Basic。',ja:'次期への変更を予約しました。今回は請求されず、現在はBasicのままです。',en:'Upgrade reserved for the next cycle. No charge now; your current plan remains Basic.'})[language]}</p> : <>
      {!upgradeReady && <p role="status">{({zh:'当前无法预约升级，请重新读取最新订阅信息。',ja:'現在は予約できません。契約情報を再読み込みしてください。',en:'Upgrade reservation is unavailable. Refresh the subscription state.'})[language]}</p>}
      <label className="bs-checkbox"><input type="checkbox" checked={consent} disabled={paying || !upgradeReady} onChange={event=>setConsent(event.target.checked)}/><span>{({zh:'我确认下一周期费用及上述预约规则，并同意',ja:'次期料金と上記の予約条件を確認し、同意します：',en:'I confirm the next-cycle price and reservation rules and accept the'})[language]} <a href="https://www.buyna.jp/terms" target="_blank" rel="noreferrer">{t.terms}</a> · <a href="https://www.buyna.jp/privacy" target="_blank" rel="noreferrer">{t.privacy}</a></span></label>
      <button type="button" className="bs-primary bs-full" disabled={!upgradeReady || !consent || paying || !onScheduleUpgrade} onClick={scheduleUpgrade}>{paying ? ({zh:'正在保存…',ja:'保存中…',en:'Saving…'})[language] : ({zh:'确认更改套餐',ja:'プラン変更を確認',en:'Confirm plan change'})[language]}</button>
      {paymentError && <p role="alert">{paymentError}</p>}
    </>}
    <button type="button" className="bs-secondary" disabled={paying} onClick={()=>void onReload()}>{t.retry}</button>
    {upgradeScheduled && <button type="button" className="bs-primary" disabled={!canPayScheduledChange(data) || paying} onClick={event=>openDialog('preview',event)}>{t.confirm}</button>}
  </>;
  const planSelector = (
    <div className="bs-plans">
      <div className="bs-between">
        <h3>{t.choose}</h3>
        <div className="bs-segment">
          {["basic", "pro"].map((p) => (
            <button
              key={p}
              aria-pressed={selectedPlan === p}
              disabled={Boolean(scheduledChange) || (extending && selectedPlan !== p)}
              title={scheduledChange ? scheduledPaymentNote : extending ? t.extensionLocked : undefined}
              onClick={() => setPlan(p)}
            >
              {p === "basic" ? "Basic" : "Pro"}
            </button>
          ))}
        </div>
      </div>
      {extensionNotice}
      {scheduledChange && <p role="status" className="bs-info">{scheduledPaymentNote}</p>}
      <div className="bs-cards" role="radiogroup" aria-label={t.choose}>
        {[1, 6, 12].map((n, i) => (!scheduledChange || n === checkoutMonths) && (
          <label
            className={`bs-card ${checkoutMonths === n ? "selected" : ""}`}
            key={n}
          >
            <div className="bs-between">
              <span className="bs-card-mark">{["01", "06", "12"][i]}</span>
              <input
                type="radio"
                name="bs-term"
                checked={checkoutMonths === n}
                disabled={Boolean(scheduledChange)}
                onChange={() => setMonths(n)}
                aria-label={`${t.names[i]} ${n} ${t.months}`}
              />
            </div>
            <h4>{t.names[i]}</h4>
            {!scheduledChange && <p className="bs-card-copy">{t.notes[i]}</p>}
            <span className="bs-muted">
              {n} {t.months}
            </span>
            <strong className="bs-price">
              {yen(scheduledChange ? scheduledChange.subtotal : data?.plans?.find(p=>p.code===selectedPlan)?.quotes?.find(q=>q.months===n)?.subtotal)}
            </strong>
            {!scheduledChange && <span className={`bs-offer ${i === 0 ? "neutral" : ""}`}>
              {i === 0 ? t.flex : `${t.save} ${i === 1 ? "5" : "10"}%`}
            </span>}
            <small>{t.one}</small>
          </label>
        ))}
      </div>
      <div className="bs-plan-footer">
        <p>{scheduledChange ? scheduledPaymentNote : extending ? t.extensionLocked : t.preserve}</p>
        <button
          className="bs-primary"
          aria-haspopup="dialog"
          onClick={(event) => openDialog("preview", event)}
        >
          {t.confirm} →
        </button>
      </div>
    </div>
  );
  const overview = <>
      <div className="bs-top">
        <div>
          <h2>{t.title}</h2>
        </div>
        <div className="bs-tools">
          <div className="bs-language" aria-label="Language">
            {[
              ["zh", "中"],
              ["ja", "日"],
              ["en", "EN"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={language === key}
                onClick={() => setLanguage(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="bs-secondary"
            disabled={loading || refreshStatus === 'loading'}
            aria-busy={refreshStatus === 'loading'}
            onClick={refreshSubscription}
          >
            {refreshStatus === 'loading' ? refreshText.loading : t.retry}
          </button>
        </div>
      </div>
      {refreshStatus !== 'idle' && <p className="bs-action-feedback" role={refreshStatus === 'error' ? 'alert' : 'status'}>{refreshText[refreshStatus]}</p>}
      <div className="bs-binding">
        <span>{t.website} · {config.domain}</span>
        <a href="#top">{t.viewSite} ↗</a>
      </div>
      {loading ? (
        <div className="bs-empty" role="status">
          {t.loading}
        </div>
      ) : error ? (
        <div className="bs-alert" role="alert">
          <strong>{t.error}</strong>
          <p>
            <a href="mailto:info@buyna.jp">info@buyna.jp</a>
          </p>
        </div>
      ) : (
        <>
          <div className="bs-summary">
            <div className={`bs-between ${active ? 'bs-overview-grid' : ''}`}>
              <div>
                <span className="bs-muted">{t.current}</span>
                <h3>
                  {["ended", "not_started", "pending"].includes(state.key)
                    ? "Free"
                    : data?.plan || t.unknown}{" "}
                  <span className={`bs-status ${state.tone}`}>
                    {t[state.key] || t.unknown}
                  </span>
                </h3>
                {active && [1,6,12].includes(data?.billingMonths) && <p className="bs-renewal-line">{data.billingMonths} {t.months}</p>}
                {active && !data?.snapshot?.review?.required && <p className="bs-renewal-line">
                  {state.autoRenew === true
                    ? {zh:`预计于 ${day(data?.nextBillingAt,language)||'—'} 自动续费`,ja:`次回の自動更新予定日：${day(data?.nextBillingAt,language)||'—'}`,en:`Scheduled to renew on ${day(data?.nextBillingAt,language)||'—'}`}[language]
                    : `${t.disabled} · ${t.end}: ${serviceDay(data,language)||'—'}`}
                </p>}
              </div>
              {active && (
                <div className="bs-plan-actions">
                {data?.snapshot?.subscription?.planCode === 'basic' && <button className="bs-primary" aria-haspopup="dialog" onClick={event=>openDialog('upgrade',event)}>{({zh:'升级套餐',ja:'プランをアップグレード',en:'Upgrade plan'})[language]}</button>}
                <button
                  className="bs-secondary"
                  aria-haspopup="dialog"
                  onClick={(event) => openDialog("plans", event)}
                >
                  {t.offers}
                </button>
                </div>
              )}
            </div>
            {!active && <div className="bs-metrics">
              <div>
                <span>{t.term}</span>
                <strong>
                  {active && [1, 6, 12].includes(data?.billingMonths)
                    ? `${data.billingMonths} ${t.months}`
                    : "—"}
                </strong>
              </div>
              <div>
                <span>{t.currentAmount}</span>
                <strong>
                  {active && Number.isSafeInteger(data?.currentAmountGross)
                    ? yen(data.currentAmountGross)
                    : "—"}
                </strong>
              </div>
              <div>
                <span>{t.end}</span>
                <strong>
                  {serviceDay(data, language) || t.unknown}
                </strong>
              </div>
              <div>
                <span>{t.next}</span>
                <strong>
                  {state.autoRenew !== true
                    ? "—"
                    : day(data?.nextBillingAt, language) || t.unknown}
                </strong>
              </div>
              <div>
                <span>{t.amount}</span>
                <strong>
                  {state.autoRenew === true &&
                  Number.isSafeInteger(data?.nextAmountGross)
                    ? yen(data.nextAmountGross)
                    : "—"}
                </strong>
              </div>
            </div>}
            {(!active || data?.snapshot?.review?.required || state.key === 'payment_failed') && <p className="bs-summary-note">
              {state.key === "ended"
                ? cancelText.ended
                : state.key === "cancel_scheduled"
                  ? cancelText.note
                  : state.key === "not_started"
                    ? t.newNote
                    : state.key === "pending"
                      ? t.pendingNote
                      : state.key === "payment_failed"
                        ? t.failedNote
                        : data?.snapshot?.review?.required
                          ? t.preserve
                          : `${t.end}: ${serviceDay(data,language)||'—'}`}
            </p>}
            {upgradeScheduled && <p className="bs-summary-note">{({zh:'已预约下期升级至 Pro，当前套餐不变。下一周期开始：',ja:'次期Proへの変更を予約済みです。現在のプランは変更されません。次期開始：',en:'Pro is reserved for the next cycle; the current plan is unchanged. Next cycle starts: '})[language]}{day(scheduledChange.effectiveAt, language)}</p>}
            {upgradeScheduled && <button type="button" className="bs-secondary" disabled={paying||cancelling||data?.renewalProcessing||Date.parse(scheduledChange.effectiveAt)<=Date.now()} onClick={event=>{setPaymentError('');openDialog('cancel-change',event);}}>{changeText.cancel}</button>}
          </div>
          {active && (
            <div className="bs-management">
              <div className="bs-panel">
                <h3>
                  {t.renew}{" "}
                  <span className="bs-status">
                    {state.autoRenew === true
                      ? t.enabled
                      : state.autoRenew === false
                        ? t.disabled
                        : t.unknown}
                  </span>
                </h3>
                <p>
                  {state.autoRenew === null ? t.renewUnknown : state.autoRenew === true
                    ? `${t.next}: ${day(data?.nextBillingAt,language)||'—'} · ${t.amount}: ${Number.isSafeInteger(data?.nextAmountGross)?yen(data.nextAmountGross):'—'}`
                    : `${t.disabled} · ${t.end}: ${serviceDay(data,language)||'—'}`}
                </p>
                {data?.capabilities?.cancel && (
                  <button
                    className="bs-secondary"
                    onClick={() => setCancelConfirm(true)}
                  >
                    {t.cancel}
                  </button>
                )}
                {resumeReady && <button type="button" className="bs-secondary" onClick={event=>{setResumeMessage('');openDialog('resume',event);}}>{resumeText.title}</button>}
              </div>
            </div>
          )}
          {cancelConfirm && (
            <div
              className="bs-panel"
              role="alertdialog"
              aria-labelledby={cancelTitleId}
            >
              <h3 id={cancelTitleId}>{cancelText.title}</h3>
              <p>{cancelText.note}</p>
              {upgradeScheduled&&<p>{({zh:`下期 Pro 变更保留，到期后需手动付款 ${yen(scheduledChange.gross)}（含税）。`,ja:`次期Proへの変更は維持されます。期限後に ${yen(scheduledChange.gross)}（税込）を手動でお支払いください。`,en:`Your next-cycle Pro change stays scheduled. Pay ${yen(scheduledChange.gross)} including tax manually at expiry.`})[language]}</p>}
              <p>
                {t.end}: {serviceDay(data, language)}
              </p>
              <div className="bs-tools">
                <button
                  disabled={cancelling}
                  onClick={() => setCancelConfirm(false)}
                >
                  {cancelText.keep}
                </button>
                <button
                  className="bs-primary"
                  disabled={cancelling}
                  onClick={cancel}
                >
                  {cancelText.confirm}
                </button>
              </div>
            </div>
          )}
          {cancelMessage && (
            <p role="status" className="bs-alert">
              {cancelMessage}
            </p>
          )}
          {!active && planSelector}
          <div className="bs-panel">
            <h3>{t.bill}</h3>
            {paidBills.length?<div className="bs-billing-scroll"><table><thead><tr><th>{t.status}</th><th>{t.paid}</th><th>{t.date}</th></tr></thead><tbody>{paidBills.map(bill=><tr key={bill.id}><td>{({zh:'已付款',ja:'支払済み',en:'Paid'})[language]}</td><td>{yen(bill.amountGross)}</td><td>{day(bill.paidAt,language)||'—'}</td></tr>)}</tbody></table></div>:<div className="bs-empty">
              <span className="bs-empty-icon">▤</span>
              <strong>{t.noBill}</strong>
            </div>}
          </div>
        </>
      )}
      <div className="bs-payee">
        <span>
          <strong>{t.payee}：Buyna</strong>
          <br />
          {t.payeeNote}
        </span>
        <a href="mailto:info@buyna.jp">{t.support} ↗</a>
      </div>
  </>;
  return (
    <section className={`bs-root${modalOnly ? ' bs-modal-host' : ''}`} aria-label={t.title}>
      {!modalOnly && overview}
      <dialog
        ref={dialog}
        className={`bs-dialog${dialogMode === "plans" || dialogMode === 'overview' ? " bs-plan-dialog" : ""}`}
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
        onClose={() => { if (dialogMode !== null) closeDialog(); }}
        onKeyDown={keepDialogFocus}
        aria-labelledby={dialogTitleId}
        aria-modal="true"
      >
        <div className="bs-dialog-header">
          <h3 id={dialogTitleId}>
            {dialogMode === 'plan-result' ? changeText[planResult?.kind??'saved'] : dialogMode === 'cancel-change' ? changeText.cancel : dialogMode === 'resume' ? resumeText.title : dialogMode === 'result' ? resultTitle : dialogMode === 'overview' ? t.title : dialogMode === 'upgrade' ? changeText.title : dialogMode === "plans" ? t.renewalPlans : t.drawer}
          </h3>
          <button
            ref={dialogClose}
            disabled={paying || cancelling}
            onClick={closeDialog}
            aria-label={t.close}
          >
            ×
          </button>
        </div>
        <div className="bs-dialog-body">
          {modalOnly && !['overview', 'result'].includes(dialogMode) && !loading && !error && <button type="button" className="bs-secondary bs-modal-back" disabled={paying || cancelling} onClick={event => openDialog('overview', event)}>{t.current}</button>}
          {dialogMode==='resume' && <>
            <h4>{scheduledChange?.targetPlanName??data?.snapshot?.subscription?.planName}</h4>
            <dl className="bs-cost"><div><dt>{t.next}</dt><dd>{day(data?.currentPeriodEnd,language)}</dd></div><div><dt>{({zh:'套餐费用（税前）',ja:'料金（税抜）',en:'Subtotal'})[language]}</dt><dd>{yen(resumeQuote.subtotal)}</dd></div><div><dt>{({zh:'消费税（10%）',ja:'消費税（10%）',en:'Tax (10%)'})[language]}</dt><dd>{yen(resumeQuote.tax)}</dd></div><div className="bs-cost-total"><dt>{({zh:'每期合计（含税）',ja:'各期合計（税込）',en:'Total per cycle'})[language]}</dt><dd>{yen(resumeQuote.gross)}</dd></div></dl>
            <p>{resumeText.note}</p>
            {resumeMessage&&<p role="status">{resumeMessage}</p>}
            {resumeReady&&<button type="button" className="bs-primary" disabled={paying} onClick={resumeRenewal}>{paying?resumeText.checking:resumeText.confirm}</button>}
            <button type="button" className="bs-secondary" disabled={paying} onClick={closeDialog}>{t.close||'OK'}</button>
          </>}
          {dialogMode==='plan-result'&&planResult&&<div className="bs-change-result" role="status" aria-live="polite">
            <span className="bs-change-check" aria-hidden="true">✓</span>
            <h4>{changeText[planResult.kind]}</h4>
            <p>{changeText.noCharge}</p>
            <dl className="bs-costs">
              <div><dt>{t.current}</dt><dd>{planResult.snapshot.subscription?.planName}</dd></div>
              <div><dt>{t.end}</dt><dd>{day(planResult.snapshot.service.currentPeriodEnd,language)}</dd></div>
              <div><dt>{({zh:'下期套餐',ja:'次期プラン',en:'Next plan'})[language]}</dt><dd>{planResult.snapshot.scheduledChange?.targetPlanName??planResult.snapshot.subscription?.planName}</dd></div>
              <div><dt>{t.renew}</dt><dd>{planResult.snapshot.renewal.enabled?t.enabled:t.disabled}</dd></div>
              <div className="bs-cost-total"><dt>{({zh:'下期费用（含税）',ja:'次期料金（税込）',en:'Next-cycle total'})[language]}</dt><dd>{yen(planResult.snapshot.scheduledChange?.gross??planResult.snapshot.fees.contractAmountGross)}</dd></div>
            </dl>
            <p>{planResult.snapshot.renewal.enabled?({zh:'到期自动扣款。',ja:'更新日に自動請求します。',en:'Automatic payment at expiry.'})[language]:({zh:'自动续费已关闭，到期后手动付款。',ja:'自動更新は停止中です。期限後に手動でお支払いください。',en:'Auto-renewal is off. Pay manually at expiry.'})[language]}</p>
            <button type="button" className="bs-primary bs-full" onClick={closeDialog}>{changeText.done}</button>
          </div>}
          {dialogMode==='cancel-change'&&<>
            <h4>Pro → Basic</h4>
            <p>{({zh:'撤销下期 Pro，继续使用 Basic。当前服务期限和自动续费开关不变。',ja:'次期Proへの変更を取り消し、Basicを継続します。利用期限と自動更新設定は変わりません。',en:'Remove the next-cycle Pro change and keep Basic. Your paid term and auto-renewal setting stay unchanged.'})[language]}</p>
            <dl className="bs-costs">
              <div><dt>{t.end}</dt><dd>{serviceDay(data,language)}</dd></div>
              <div><dt>{t.renew}</dt><dd>{extensionRenew?t.enabled:t.disabled}</dd></div>
              <div><dt>{({zh:'Basic 费用（税前）',ja:'Basic料金（税抜）',en:'Basic subtotal'})[language]}</dt><dd>{yen(data?.snapshot?.fees?.subtotal)}</dd></div>
              <div><dt>{t.tax}</dt><dd>{yen(data?.snapshot?.fees?.taxAmount)}</dd></div>
              <div className="bs-cost-total"><dt>{({zh:'下期费用（含税）',ja:'次期料金（税込）',en:'Next-cycle total'})[language]}</dt><dd>{yen(data?.snapshot?.fees?.contractAmountGross)}</dd></div>
            </dl>
            <p>{extensionRenew?({zh:`下次扣款：${day(data?.currentPeriodEnd,language)} · ${yen(data?.snapshot?.fees?.contractAmountGross)}（含税）`,ja:`次回請求：${day(data?.currentPeriodEnd,language)} · ${yen(data?.snapshot?.fees?.contractAmountGross)}（税込）`,en:`Next charge: ${day(data?.currentPeriodEnd,language)} · ${yen(data?.snapshot?.fees?.contractAmountGross)} including tax`})[language]:({zh:'不会自动扣款，到期后需手动续费 Basic。',ja:'自動請求はありません。期限後にBasicを手動で更新してください。',en:'No automatic charge. Renew Basic manually at expiry.'})[language]}</p>
            {paymentError&&<p role="alert">{paymentError}</p>}
            <button type="button" className="bs-primary bs-full" disabled={paying||!upgradeScheduled||Date.parse(scheduledChange?.effectiveAt)<=Date.now()} onClick={cancelPlanChange}>{paying?'…':changeText.confirm}</button>
            <button type="button" className="bs-secondary" disabled={paying} onClick={closeDialog}>{changeText.keep}</button>
          </>}
          {['resume','plan-result','cancel-change'].includes(dialogMode) ? null : modalOnly && (loading || error || dialogMode === 'overview') ? overview : dialogMode === 'result' ? <>
            <p role="status">{returnedPaid ? ({zh:'付款已核验成功',ja:'お支払いを確認しました',en:'Payment verified'})[language] : t.pendingNote}</p>
            {returnedPaid && <dl className="bs-costs">
              <div><dt>{t.current}</dt><dd>{data?.snapshot?.subscription?.planName || t.unknown}</dd></div>
              <div><dt>{t.paid}</dt><dd>{yen(returnedBill.amountGross)}</dd></div>
              <div><dt>{t.end}</dt><dd>{day(returnedBill.servicePeriodEnd || data?.snapshot?.service?.currentPeriodEnd, language) || t.unknown}</dd></div>
            </dl>}
            <button type="button" className="bs-secondary" onClick={() => void onReload()}>{t.retry}</button>
          </> : dialogMode === 'upgrade' ? <>
            <h4>Basic → Pro</h4>
            {upgradeDetails}
          </> : dialogMode === "plans" ? (
            planSelector
          ) : (
            <>
              <p className="bs-eyebrow">{t.estimate}</p>
              <h4>
                {selectedPlan === "basic" ? "Basic" : "Pro"} /{" "}
                {t.names[[1, 6, 12].indexOf(checkoutMonths)]}
              </h4>
              <p>
                {checkoutMonths} {t.months}
              </p>
              {extensionNotice}
              {scheduledChange && <p role="status" className="bs-info">{scheduledPaymentNote}</p>}
              <dl className="bs-costs">
                <div>
                  <dt>{t.payee}</dt>
                  <dd>{catalog.payee}</dd>
                </div>
                <div>
                  <dt>{t.fee}</dt>
                  <dd>{yen(scheduledChange ? quote.subtotal : quote.base)}</dd>
                </div>
                {!scheduledChange && <div>
                  <dt>{t.discount}</dt>
                  <dd>−{yen(quote.discount)}</dd>
                </div>}
                <div>
                  <dt>{t.tax}</dt>
                  <dd>{yen(quote.tax)}</dd>
                </div>
                <div className="bs-cost-total">
                  <dt>{t.total}</dt>
                  <dd>{yen(quote.gross)}</dd>
                </div>
              </dl>
              <section aria-label={paymentText.billing}>
                <div className="bs-between">
                  <h4>{paymentText.billing}</h4>
                  {profileReady && !editingProfile && <button className="bs-secondary" disabled={paying} onClick={() => setEditingProfile(true)}>{paymentText.edit}</button>}
                </div>
                {contextStatus === 'ready' && contextSource === 'subscription_billing' && <p className="bs-caption">{paymentText.saved}</p>}
                {contextStatus === 'loading' && <p role="status">{paymentText.contextLoading}</p>}
                {contextStatus === 'error' && <div role="alert"><p>{paymentText.contextError}</p><button className="bs-secondary" onClick={loadPaymentContext}>{paymentText.contextRetry}</button></div>}
                {profileReady && !editingProfile && contextSource === 'subscription_billing' ? <p>{profile.company_name}<br />{profile.contact_name}<br />{profile.email}</p> :
                  ['company_name', 'contact_name', 'email', 'phone', 'company_address'].map((key, index) => <label className="bs-profile-field" key={key}>
                    <span>{[paymentText.company, paymentText.contact, emailOptional ? {zh:'电子邮箱（选填）',ja:'メールアドレス（任意）',en:'Email (optional)'}[language] : paymentText.email, {zh:'电话（选填）',ja:'電話番号（任意）',en:'Phone (optional)'}[language],{zh:'公司地址（选填）',ja:'会社住所（任意）',en:'Company address (optional)'}[language]][index]}</span>
                    <input type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} required={index<2 || key==='email'&&!emailOptional} disabled={paying || profileSaveStatus==='saving'} value={profile[key] || ''} autoComplete={['organization', 'name', 'email', 'tel', 'street-address'][index]}
                      onChange={event => {editedFields.current.add(key); setProfileSaveStatus('idle'); setEditingProfile(true); setProfile(current => ({...current, [key]: event.target.value}));}} />
                  </label>)}
                {onSaveBillingProfile && <button type="button" className="bs-secondary" disabled={!profileReady || paying || contextStatus!=='ready' || profileSaveStatus==='saving'} onClick={saveBillingProfile}>{profileSaveStatus==='saving'?profileText.saving:profileText.save}</button>}
                {profileSaveStatus!=='idle' && <p role={['failed','conflict'].includes(profileSaveStatus)?'alert':'status'}>{profileText[profileSaveStatus]}</p>}
              </section>
              <label className="bs-checkbox">
                <input
                  type="checkbox"
                  checked={checkoutRenew === true}
                  disabled={(extending&&!renewalOptIn) || paying}
                  onChange={(e) => setRenew(e.target.checked)}
                />
                <span>
                  {t.renewCheck}
                </span>
              </label>
              <label className="bs-checkbox">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={paying}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  {paymentText.accept}{" "}
                  <a
                    href="https://www.buyna.jp/terms"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t.terms}
                  </a>{" "}
                  ·{" "}
                  <a
                    href="https://www.buyna.jp/privacy"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t.privacy}
                  </a>
                </span>
              </label>
              <button
                className="bs-primary bs-full"
                disabled={
                  !checkoutAllowed || !priceReady || contextStatus !== 'ready' || !profileReady ||
                  !consent ||
                  (!extending && !renew) ||
                  paying
                }
                onClick={proceed}
                aria-describedby={checkoutNoteId}
              >
                {paying ? paymentText.progress : t.continue}
              </button>
              <p id={checkoutNoteId} className="bs-caption">
                {scheduledChange && !checkoutAllowed ? scheduledPaymentNote + ' ' + t.extensionUnavailable : extending
                  ? checkoutAllowed
                    ? paymentText.ready
                    : t.extensionUnavailable
                  : active
                    ? t.preserve
                    : !data?.capabilities?.checkout
                      ? t.unavailable
                      : !renew
                        ? paymentText.renew
                        : paymentText.ready}
              </p>
              {paymentError && (
                <p role="alert" className="bs-caption">
                  {paymentError}
                </p>
              )}
              <a className="bs-support" href="mailto:info@buyna.jp">
                {t.support} · info@buyna.jp
              </a>
            </>
          )}
        </div>
      </dialog>
    </section>
  );
}

export default function SubscriptionPanel({ api: transport, config, onUnauthorized, modalOnly = false, modalRequest, onDismiss }) {
  const api = React.useMemo(() => bindSubscriptionApi(transport, config), [transport, config]);
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [language, setLanguage] = useState("zh");
  const requestId = useRef(0), currentData=useRef(null), operation=useRef(false);
  function publish(snapshot){
    requestId.current++;
    const record={...merchantSubscriptionView(snapshot),domain:config.domain};
    currentData.current=record;setData(record);setLoading(false);setError(false);
  }
  async function load(background=false) {
    if(background===true&&operation.current)return null;
    const id = ++requestId.current;
    if(!currentData.current){setLoading(true);setError(false);}
    try {
      const snapshot = await api("/api/admin/subscription-state");
      const record = {...merchantSubscriptionView(snapshot),domain:config.domain};
      if (id === requestId.current){currentData.current=record;setData(record);setError(false);}
      return id===requestId.current?snapshot:null;
    } catch (e) {
      if (id === requestId.current) {
        if(!currentData.current||e.status===401||(modalOnly && background !== true)){currentData.current=null;setData(null);setError(true);}
        if (e.status === 401) onUnauthorized();
      }
      return null;
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (modalOnly && !modalRequest) return;
    if (modalOnly) {setLoading(true); setError(false);}
    void load();
    const reload=()=>{if(document.visibilityState!=='hidden')void load(true);};
    const timer=setInterval(reload,30000);addEventListener('focus',reload);addEventListener('online',reload);
    return () => {
      requestId.current++;
      clearInterval(timer);removeEventListener('focus',reload);removeEventListener('online',reload);
    };
  }, [modalOnly, modalRequest]);
  async function preflight(){
    const displayed=currentData.current?.snapshot?.stateVersion,id=++requestId.current;
    const snapshot=await api('/api/admin/subscription-state');
    if(id!==requestId.current)throw Error('SUBSCRIPTION_CHANGED');
    publish(snapshot);
    if(snapshot.stateVersion!==displayed)throw Error('SUBSCRIPTION_CHANGED');
    return snapshot;
  }
  async function checkout(input) {
    if (input.intent === 'upgrade' || input.quoteAt !== undefined) throw Error('UPGRADE_RESERVATION_UNAVAILABLE');
    if(operation.current)throw Error('SUBSCRIPTION_OPERATION_IN_PROGRESS');
    operation.current=true;
    try{
    const snapshot = await preflight();
    if(snapshot.stateVersion !== input.expectedVersion)throw Error('SUBSCRIPTION_CHANGED');
    if (snapshot.scheduledChange) {
      const change = snapshot.scheduledChange;
      if (!canPayScheduledChange(merchantSubscriptionView(snapshot)) || input.intent !== 'extend' ||
        input.plan !== change.targetPlan || input.months !== change.months || input.expectedTotalJpy !== change.gross ||
        input.autoRenew !== snapshot.renewal.enabled) throw Error('SCHEDULED_PLAN_NOT_PAYABLE');
    }
    const result = await api("/api/admin/subscription-checkout-direct", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (result.status === 'active') {
      if (!result.snapshot) throw Error('invalid_checkout_response');
      publish(result.snapshot);
      await load();
      return result;
    }
    const url = new URL(result.checkoutUrl);
    if (!["https://jp.globalfreepay.com", "https://pay.globepay.co.jp"].includes(url.origin) || url.username || url.password)
      throw Error("invalid_checkout_destination");
    window.location.assign(url.toString());
    }finally{operation.current=false;}
  }
  async function scheduleUpgrade(input) {
    if(operation.current)throw Error('SUBSCRIPTION_OPERATION_IN_PROGRESS');
    operation.current=true;
    const confirmed = snapshot => {
      const record = merchantSubscriptionView(snapshot);
      return record.subscriptionId === input.subscriptionId && record.planCode === 'basic' &&
        snapshot.scheduledChange?.status === 'scheduled' && snapshot.scheduledChange.requestId === input.requestId &&
        validPlanChange(snapshot.scheduledChange, record);
    };
    try {
      const snapshot = await preflight();
      if(snapshot.stateVersion !== input.expectedVersion || snapshot.subscription?.id !== input.subscriptionId ||
        !canScheduleUpgrade(merchantSubscriptionView(snapshot))) throw Error('SUBSCRIPTION_CHANGED');
      const result = await api('/api/admin/subscription-plan-change', {method:'POST',body:JSON.stringify(input)});
      if(result.status !== 'scheduled' || !result.snapshot || !confirmed(result.snapshot)) throw Error('INVALID_PLAN_CHANGE_RESPONSE');
      publish(result.snapshot);
      return result;
    } catch (error) {
      const recovered = await load();
      if(recovered && confirmed(recovered)) return {status:'scheduled',snapshot:recovered};
      throw error;
    } finally {operation.current=false;}
  }
  async function cancel(input) {
    if(operation.current)throw Error('SUBSCRIPTION_OPERATION_IN_PROGRESS');
    operation.current=true;
    try{
    await preflight();
    let result;
    try{result=await api("/api/admin/subscription-cancel", {
      method: "POST",
      body: JSON.stringify({...input,requestId:crypto.randomUUID()}),
    });}catch(error){
      const recovered=await load();
      if(recovered?.subscription?.id===input.subscriptionId&&recovered.renewal.enabled===false)return;
      throw error;
    }
    if(result.snapshot)publish(result.snapshot);
    await load();
    }finally{operation.current=false;}
  }
  async function resume(input){
    if(operation.current)throw Error('SUBSCRIPTION_OPERATION_IN_PROGRESS');
    operation.current=true;
    try{
      const snapshot=await preflight();
      if(snapshot.stateVersion!==input.expectedVersion||snapshot.subscription?.id!==input.subscriptionId)throw Error('SUBSCRIPTION_CHANGED');
      const result=await api('/api/admin/subscription-resume',{method:'POST',body:JSON.stringify(input)});
      if(result.status!=='renewal_enabled'||result.snapshot?.subscription?.id!==input.subscriptionId||result.snapshot?.identity?.sellerId!==config.identity.sellerId||result.snapshot?.renewal?.enabled!==true)throw Error('INVALID_RESUME_RESPONSE');
      publish(result.snapshot);await load();return result;
    }catch(error){await load();throw error;}
    finally{operation.current=false;}
  }
  async function cancelPlanChange(input){
    if(operation.current)throw Error('SUBSCRIPTION_OPERATION_IN_PROGRESS');
    operation.current=true;
    try{
      const snapshot=await preflight();
      if(snapshot.stateVersion!==input.expectedVersion||snapshot.subscription?.id!==input.subscriptionId||snapshot.scheduledChange?.requestId!==input.changeRequestId)throw Error('SUBSCRIPTION_CHANGED');
      const result=await api('/api/admin/subscription-plan-change-cancel',{method:'POST',body:JSON.stringify(input)});
      if(result.status!=='plan_change_cancelled'||result.snapshot?.subscription?.id!==input.subscriptionId||result.snapshot?.identity?.sellerId!==config.identity.sellerId||result.snapshot?.scheduledChange||result.snapshot?.renewal?.enabled!==snapshot.renewal.enabled)throw Error('INVALID_PLAN_CHANGE_RESPONSE');
      publish(result.snapshot);await load();return result;
    }catch(error){await load();throw error;}
    finally{operation.current=false;}
  }
  return (
    <SubscriptionView
      config={config}
      {...{ data, loading, error, language, setLanguage }}
      {...{ modalOnly, modalRequest, onDismiss }}
      onReload={load}
      onCheckout={checkout}
      onLoadPaymentContext={() => api('/api/admin/subscription-payment-context')}
      onSaveBillingProfile={input => api('/api/admin/subscription-billing-profile',{method:'POST',body:JSON.stringify(input)})}
      onCancel={cancel}
      onScheduleUpgrade={scheduleUpgrade}
      onResume={resume}
      onCancelPlanChange={cancelPlanChange}
    />
  );
}
