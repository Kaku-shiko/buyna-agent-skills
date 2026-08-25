import { failDelivery } from './errors.mjs';

export const DEFAULT_DELIVERY_RETRY_POLICY = Object.freeze({
  maxAttempts: 5,
  delaysSeconds: Object.freeze([60, 300, 900, 3600]),
});

export function normalizeRetryPolicy(policy = DEFAULT_DELIVERY_RETRY_POLICY) {
  if (
    Object.getPrototypeOf(policy ?? {}) !== Object.prototype
    || !Number.isSafeInteger(policy.maxAttempts)
    || policy.maxAttempts < 1
    || policy.maxAttempts > 10
    || !Array.isArray(policy.delaysSeconds)
    || policy.delaysSeconds.length !== policy.maxAttempts - 1
    || policy.delaysSeconds.some((delay) => !Number.isSafeInteger(delay) || delay < 0)
  ) failDelivery('DELIVERY_RETRY_POLICY_INVALID');
  return Object.freeze({
    maxAttempts: policy.maxAttempts,
    delaysSeconds: Object.freeze([...policy.delaysSeconds]),
  });
}

export function normalizeLeaseSeconds(value) {
  if (!Number.isSafeInteger(value) || value < 5 || value > 900) {
    failDelivery('DELIVERY_LEASE_INVALID');
  }
  return value;
}
