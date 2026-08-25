export function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function requiredText(value, code = 'READ_MODEL_FACT_INVALID') {
  if (typeof value !== 'string' || value.trim() === '') fail(code);
  return value.trim();
}

export function safeNonNegativeInteger(value, code = 'READ_MODEL_FACT_INVALID') {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
  return value;
}

export function isoInstant(value, code = 'READ_MODEL_FACT_INVALID') {
  if (!(typeof value === 'string' || value instanceof Date)) fail(code);
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) fail(code);
  return new Date(epoch).toISOString();
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}
