export const DELIVERY_STATES = Object.freeze({
  PENDING: 'pending',
  SENDING: 'sending',
  DELIVERED: 'delivered',
  FAILED: 'failed',
});

export const DELIVERY_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['sending']),
  sending: Object.freeze(['delivered', 'failed']),
  failed: Object.freeze(['sending']),
  delivered: Object.freeze([]),
});

export function canTransition(from, to) {
  return DELIVERY_TRANSITIONS[from]?.includes(to) === true;
}
