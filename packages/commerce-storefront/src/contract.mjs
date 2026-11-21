export const contractVersion = '1';
export const slugPattern = /^[a-z][a-z0-9-]{1,79}$/;
export const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const tokenPattern = /^[a-f0-9]{64}$/;

// This gateway exposes public commerce data, never merchant administration.
export function publicRoute(path, method) {
  if (method === 'GET' && (['/catalog', '/payment-options'].includes(path) || /^\/pages\/[a-z][a-z0-9-]{1,79}$/.test(path))) return true;
  return method === 'POST' && ['/quote', '/booking-quote'].includes(path);
}

export function assertSlug(value) {
  if (typeof value !== 'string' || !slugPattern.test(value)) throw Error('INVALID_STORE_SLUG');
  return value;
}

export function assertId(value) {
  if (typeof value !== 'string' || !idPattern.test(value)) throw Error('INVALID_RESOURCE_ID');
  return value;
}
