import { createHash } from 'node:crypto';
import { failDelivery } from './errors.mjs';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function compareCodePoints(left, right) {
  const a = Array.from(left, (character) => character.codePointAt(0));
  const b = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function normalize(value, ancestors) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.normalize('NFC');
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) failDelivery('DELIVERY_INTENT_INVALID');
    return value;
  }
  if (typeof value !== 'object') failDelivery('DELIVERY_INTENT_INVALID');
  if (ancestors.has(value)) failDelivery('DELIVERY_INTENT_INVALID');

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) failDelivery('DELIVERY_INTENT_INVALID');
    return value.map((entry) => normalize(entry, nextAncestors));
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    failDelivery('DELIVERY_INTENT_INVALID');
  }

  const normalizedEntries = [];
  const normalizedKeys = new Set();
  for (const key of Object.keys(value)) {
    const normalizedKey = key.normalize('NFC');
    if (FORBIDDEN_KEYS.has(normalizedKey) || normalizedKeys.has(normalizedKey)) {
      failDelivery('DELIVERY_INTENT_INVALID');
    }
    normalizedKeys.add(normalizedKey);
    normalizedEntries.push([normalizedKey, normalize(value[key], nextAncestors)]);
  }
  normalizedEntries.sort(([left], [right]) => compareCodePoints(left, right));
  return Object.fromEntries(normalizedEntries);
}

export function canonicalizeDeliveryIntent(value) {
  return JSON.stringify(normalize(value, new Set()));
}

export function digestDeliveryIntent(value) {
  return createHash('sha256')
    .update(canonicalizeDeliveryIntent(value), 'utf8')
    .digest('hex');
}

export function normalizeDeliveryValue(value) {
  return normalize(value, new Set());
}
