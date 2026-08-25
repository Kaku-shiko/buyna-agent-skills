function fail(code) {
  throw new Error(code);
}

function method(owner, name) {
  if (typeof owner?.[name] !== 'function') {
    fail(`MISSING_ADAPTER_${name.toUpperCase()}`);
  }
}

function requiredText(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value;
}

function validateAmount(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
}

function validateCurrency(value, code) {
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) fail(code);
}

export const SETTLEMENT_STATUSES = Object.freeze({
  PENDING_PAYMENT: 'pending_payment',
  PAID: 'paid',
  FAILED: 'failed',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  PARTIALLY_REFUNDED: 'partially_refunded',
  REFUNDED: 'refunded',
});

export const SETTLEMENT_TRANSITIONS = Object.freeze({
  pending_payment: Object.freeze([
    SETTLEMENT_STATUSES.PAID,
    SETTLEMENT_STATUSES.FAILED,
    SETTLEMENT_STATUSES.EXPIRED,
    SETTLEMENT_STATUSES.CANCELLED,
  ]),
  paid: Object.freeze([
    SETTLEMENT_STATUSES.PARTIALLY_REFUNDED,
    SETTLEMENT_STATUSES.REFUNDED,
  ]),
  failed: Object.freeze([]),
  expired: Object.freeze([]),
  cancelled: Object.freeze([]),
  partially_refunded: Object.freeze([
    SETTLEMENT_STATUSES.PARTIALLY_REFUNDED,
    SETTLEMENT_STATUSES.REFUNDED,
  ]),
  refunded: Object.freeze([]),
});

export const PROVIDER_EVENT_SOURCES = Object.freeze({
  NOTIFY: 'provider_notify',
  QUERY: 'provider_query',
  SCHEDULED: 'provider_scheduled',
});

const ALLOWED_PROVIDER_EVENT_SOURCES = new Set(
  Object.values(PROVIDER_EVENT_SOURCES),
);

const REFUND_STATUSES = new Set([
  SETTLEMENT_STATUSES.PARTIALLY_REFUNDED,
  SETTLEMENT_STATUSES.REFUNDED,
]);

function validateTrustedEvent(verified) {
  if (verified?.trusted !== true) fail('PROVIDER_EVENT_NOT_TRUSTED');
  if (!ALLOWED_PROVIDER_EVENT_SOURCES.has(verified.source)) {
    fail('PROVIDER_EVENT_SOURCE_NOT_ALLOWED');
  }
  requiredText(verified.eventId, 'PROVIDER_EVENT_ID_REQUIRED');
  requiredText(verified.provider, 'PROVIDER_ID_REQUIRED');
  requiredText(verified.orderId, 'ORDER_ID_REQUIRED');
  if (!Object.hasOwn(SETTLEMENT_TRANSITIONS, verified.status)) {
    fail('SETTLEMENT_STATUS_UNSUPPORTED');
  }
}

function validateScope(scope, verified, order) {
  const projectId = requiredText(scope.projectId, 'MERCHANT_SCOPE_REQUIRED');
  const sellerId = requiredText(scope.sellerId, 'MERCHANT_SCOPE_REQUIRED');
  if (
    verified.projectId !== projectId
    || verified.sellerId !== sellerId
    || order.projectId !== projectId
    || order.sellerId !== sellerId
  ) {
    fail('MERCHANT_SCOPE_MISMATCH');
  }
}

function validateOrder(verified, order) {
  if (order.id !== verified.orderId) fail('ORDER_ID_MISMATCH');
  validateAmount(order.amount, 'ORDER_AMOUNT_INVALID');
  validateAmount(verified.amount, 'PAYMENT_EVENT_AMOUNT_INVALID');
  validateCurrency(order.currency, 'ORDER_CURRENCY_INVALID');
  validateCurrency(verified.currency, 'PAYMENT_EVENT_CURRENCY_INVALID');
  if (verified.amount !== order.amount) fail('PAYMENT_AMOUNT_MISMATCH');
  if (verified.currency !== order.currency) fail('PAYMENT_CURRENCY_MISMATCH');
  if (!SETTLEMENT_TRANSITIONS[order.status]?.includes(verified.status)) {
    fail('SETTLEMENT_INVALID_TRANSITION');
  }
}

function refundAmounts(verified, order) {
  if (!REFUND_STATUSES.has(verified.status)) return undefined;
  const paidAmount = Object.hasOwn(order, 'paidAmount')
    ? order.paidAmount
    : order.amount;
  const refundedAmount = order.refundedAmount;
  const cumulativeRefundAmount = verified.refundAmount;
  validateAmount(paidAmount, 'ORDER_PAID_AMOUNT_INVALID');
  validateAmount(refundedAmount, 'ORDER_REFUND_AMOUNT_INVALID');
  validateAmount(cumulativeRefundAmount, 'REFUND_AMOUNT_INVALID');
  if (refundedAmount > paidAmount) fail('ORDER_REFUND_AMOUNT_INVALID');
  if (cumulativeRefundAmount > paidAmount) fail('REFUND_AMOUNT_EXCEEDS_PAID');
  if (cumulativeRefundAmount <= refundedAmount) {
    fail('REFUND_AMOUNT_NOT_INCREASED');
  }
  if (
    (verified.status === SETTLEMENT_STATUSES.PARTIALLY_REFUNDED
      && cumulativeRefundAmount >= paidAmount)
    || (verified.status === SETTLEMENT_STATUSES.REFUNDED
      && cumulativeRefundAmount !== paidAmount)
  ) {
    fail('REFUND_STATUS_MISMATCH');
  }
  return { paidAmount, refundedAmount, cumulativeRefundAmount };
}

function settlementAdapterMethods(status, capabilities) {
  const names = [
    'claimEvent',
    'getOrderForSettlement',
    'upsertPayment',
    'setOrderStatus',
  ];
  if (status === SETTLEMENT_STATUSES.PAID) {
    names.push('applyInventoryOnce', 'upsertPaidCustomer', 'appendGmvOutbox');
    if (capabilities.coupon) names.push('applyCouponOnce');
    if (capabilities.cart) names.push('markCartClearOnce');
  } else if (REFUND_STATUSES.has(status)) {
    names.push('recordRefund', 'appendGmvOutbox');
    if (capabilities.refundCoupon) {
      names.push('applyRefundCouponPolicyOnce');
    }
  }
  return names;
}

export function createSettlementModule({ provider, store, capabilities } = {}) {
  method(provider, 'verify');
  method(store, 'transaction');
  const enabledCapabilities = Object.freeze({
    coupon: capabilities?.coupon === true,
    refundCoupon: capabilities?.refundCoupon === true,
    cart: capabilities?.cart === true,
  });

  return {
    async settle(input = {}) {
      const verified = await provider.verify(input);
      validateTrustedEvent(verified);

      const scope = {
        projectId: input.projectId,
        sellerId: input.sellerId,
      };
      requiredText(scope.projectId, 'MERCHANT_SCOPE_REQUIRED');
      requiredText(scope.sellerId, 'MERCHANT_SCOPE_REQUIRED');
      if (
        verified.projectId !== scope.projectId
        || verified.sellerId !== scope.sellerId
      ) {
        fail('MERCHANT_SCOPE_MISMATCH');
      }

      return store.transaction(async (tx) => {
        for (const name of settlementAdapterMethods(verified.status, enabledCapabilities)) {
          method(tx, name);
        }
        const claimed = await tx.claimEvent({
          eventId: verified.eventId,
          provider: verified.provider,
        });
        if (!claimed) {
          return { status: 'duplicate', eventId: verified.eventId };
        }

        const order = await tx.getOrderForSettlement({
          ...scope,
          orderId: verified.orderId,
        });
        if (!order) fail('ORDER_NOT_FOUND');
        validateScope(scope, verified, order);
        validateOrder(verified, order);
        const refund = refundAmounts(verified, order);

        await tx.upsertPayment({ order, verified });
        await tx.setOrderStatus({ order, status: verified.status });

        if (verified.status === SETTLEMENT_STATUSES.PAID) {
          await tx.applyInventoryOnce({ order, eventId: verified.eventId });
          if (enabledCapabilities.coupon) {
            await tx.applyCouponOnce({ order, eventId: verified.eventId });
          }
          await tx.upsertPaidCustomer({ order, verified });
          await tx.appendGmvOutbox({ order, verified });
          if (enabledCapabilities.cart) {
            await tx.markCartClearOnce({ order, eventId: verified.eventId });
          }
        } else if (REFUND_STATUSES.has(verified.status)) {
          const refundDelta = refund.cumulativeRefundAmount - refund.refundedAmount;
          const refundEffect = {
            order,
            verified,
            refundDelta,
            cumulativeRefundAmount: refund.cumulativeRefundAmount,
          };
          await tx.recordRefund(refundEffect);
          if (enabledCapabilities.refundCoupon) {
            await tx.applyRefundCouponPolicyOnce(refundEffect);
          }
          await tx.appendGmvOutbox(refundEffect);
        }

        return {
          status: 'applied',
          orderId: order.id,
          paymentStatus: verified.status,
          eventId: verified.eventId,
        };
      });
    },
  };
}
