import {
  deepFreeze,
  fail,
  isoInstant,
  requiredText,
  safeNonNegativeInteger,
} from './errors.mjs';

function verifyScope(row, scope) {
  if (row?.projectId !== scope.projectId || row?.sellerId !== scope.sellerId) {
    fail('READ_MODEL_SCOPE_MISMATCH');
  }
}

function verifyCurrency(row, currency) {
  if (row?.currency !== currency) fail('READ_MODEL_CURRENCY_UNSUPPORTED');
}

function money(value) {
  return safeNonNegativeInteger(value, 'READ_MODEL_MONEY_INVALID');
}

function safeAdd(left, right) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail('READ_MODEL_MONEY_INVALID');
  return result;
}

export function normalizePendingRows(rows, scope, currency, asOf) {
  const orderIds = new Set();
  return deepFreeze(rows.map((row) => {
    verifyScope(row, scope);
    verifyCurrency(row, currency);
    if (row?.status !== 'pending_payment') fail('READ_MODEL_FACT_INVALID');
    const orderId = requiredText(row.orderId);
    if (orderIds.has(orderId)) fail('READ_MODEL_FACT_INVALID');
    orderIds.add(orderId);
    const createdAt = isoInstant(row.createdAt);
    const updatedAt = isoInstant(row.updatedAt);
    if (createdAt > updatedAt || updatedAt > asOf) fail('READ_MODEL_FACT_INVALID');
    return {
      orderId,
      ...scope,
      status: 'pending_payment',
      payableAmount: money(row.payableAmount),
      currency,
      createdAt,
      updatedAt,
    };
  }));
}

export function normalizeSettlementEvents(rows, scope, currency) {
  const eventIds = new Set();
  const capturedOrders = new Set();
  return deepFreeze(rows.map((row) => {
    verifyScope(row, scope);
    verifyCurrency(row, currency);
    if (row?.settlementSource !== 'trusted_settlement') {
      fail('READ_MODEL_SETTLEMENT_UNTRUSTED');
    }
    const eventId = requiredText(row.eventId);
    if (eventIds.has(eventId)) fail('READ_MODEL_DUPLICATE_EVENT');
    eventIds.add(eventId);
    const orderId = requiredText(row.orderId);
    if (row.type !== 'capture' && row.type !== 'refund') fail('READ_MODEL_FACT_INVALID');
    if (row.type === 'capture') {
      if (capturedOrders.has(orderId)) fail('READ_MODEL_DUPLICATE_CAPTURE');
      capturedOrders.add(orderId);
    }
    const amount = money(row.amount);
    if (amount === 0) fail('READ_MODEL_MONEY_INVALID');
    return {
      eventId,
      orderId,
      ...scope,
      type: row.type,
      amount,
      currency,
      occurredAt: isoInstant(row.occurredAt),
      settlementSource: 'trusted_settlement',
    };
  }));
}

export function summarizeCommerceFacts({ pendingRows, settlementEvents }) {
  const paidOrders = new Set();
  const refundedOrders = new Set();
  let pendingAmount = 0;
  let grossAmount = 0;
  let refundAmount = 0;
  for (const row of pendingRows) pendingAmount = safeAdd(pendingAmount, row.payableAmount);
  for (const event of settlementEvents) {
    if (event.type === 'capture') {
      paidOrders.add(event.orderId);
      grossAmount = safeAdd(grossAmount, event.amount);
    } else {
      refundedOrders.add(event.orderId);
      refundAmount = safeAdd(refundAmount, event.amount);
    }
  }
  const netAmount = grossAmount - refundAmount;
  if (!Number.isSafeInteger(netAmount)) fail('READ_MODEL_MONEY_INVALID');
  return deepFreeze({
    pendingOrders: new Set(pendingRows.map((row) => row.orderId)).size,
    paidOrders: paidOrders.size,
    refundedOrders: refundedOrders.size,
    pendingAmount,
    grossAmount,
    refundAmount,
    netAmount,
  });
}
