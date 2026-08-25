export function deliveryError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function failDelivery(code) {
  throw deliveryError(code);
}

export function requireDeliveryMethod(owner, name, code) {
  if (typeof owner?.[name] !== 'function') failDelivery(code);
  return owner[name].bind(owner);
}
