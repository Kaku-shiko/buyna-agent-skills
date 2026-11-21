import {assertSlug, assertId, tokenPattern, contractVersion} from './contract.mjs';

export class CommerceError extends Error {
  constructor(message, status = 0, code = 'COMMERCE_REQUEST_FAILED') {
    super(message); this.name = 'CommerceError'; this.status = status; this.code = code;
  }
}

// Persist this complete object in session storage BEFORE submitting, and reuse on retry.
export function createSubmission(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || 'idempotencyKey' in input) throw Error('INVALID_SUBMISSION');
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
  return {token, input: JSON.parse(JSON.stringify({...input, idempotencyKey: crypto.randomUUID()}))};
}

export function createStorefrontClient({siteSlug, mode = 'commerce', fetchImpl = globalThis.fetch, timeoutMs = 15000} = {}) {
  assertSlug(siteSlug);
  if (!['commerce', 'gateway'].includes(mode) || typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw Error('INVALID_CLIENT_CONFIG');
  const base = mode === 'commerce' ? '/api/public/' + siteSlug : '/commerce/v1';
  async function request(path, body, proof) {
    const headers = {Accept: 'application/json'};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (proof) {
      if (!tokenPattern.test(proof.token)) throw Error('INVALID_ORDER_PROOF');
      headers[proof.kind === 'booking' ? 'X-Booking-Token' : 'X-Order-Token'] = proof.token;
    }
    let response;
    try {
      response = await fetchImpl(base + path, {method: body === undefined ? 'GET' : 'POST', headers,
        credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
        body: body === undefined ? undefined : JSON.stringify(body)});
    } catch {
      throw new CommerceError('请求未确认，请保留原请求后重试。', 0, 'NETWORK_UNCONFIRMED');
    }
    let data;
    try {data = await response.json();} catch {throw new CommerceError('服务暂时无法响应。', response.status, 'INVALID_RESPONSE');}
    if (!response.ok) throw new CommerceError(typeof data?.error === 'string' ? data.error.slice(0, 300) : '请求失败。', response.status, data?.code || 'COMMERCE_REQUEST_FAILED');
    return data;
  }
  const transaction = (path, body, token, kind = 'order') => {
    // External frontends hand off to the existing storefront checkout until a
    // one-time hosted checkout session and return contract have been delivered.
    if (mode !== 'commerce') throw new CommerceError('请在店铺收银流程中完成预订和付款。', 501, 'HOSTED_CHECKOUT_REQUIRED');
    if (typeof token !== 'string' || !tokenPattern.test(token)) throw Error('INVALID_ORDER_PROOF');
    return request(path, body, {token, kind});
  };
  return Object.freeze({
    contractVersion, siteSlug, mode,
    config: () => mode === 'gateway' ? request('/config') : Promise.resolve({contractVersion, siteSlug, checkoutMode:'same-origin'}),
    catalog: async () => {
      const data = await request('/catalog');
      if (data.siteSlug !== siteSlug || data.schemaVersion !== 1) throw new CommerceError('店铺绑定不匹配。', 409, 'STORE_BINDING_MISMATCH');
      return data;
    },
    page: slug => request('/pages/' + assertSlug(slug)),
    quote: lines => request('/quote', {lines}),
    bookingQuote: selection => request('/booking-quote', selection),
    paymentOptions: () => request('/payment-options'),
    createOrder: submission => transaction('/orders', submission.input, submission.token),
    order: (id, token) => transaction('/orders/' + assertId(id), undefined, token),
    createBooking: submission => transaction('/bookings', submission.input, submission.token, 'booking'),
    booking: (id, token) => transaction('/bookings/' + assertId(id), undefined, token, 'booking'),
    createPayment: (id, token, input) => transaction('/orders/' + assertId(id) + '/payments', input, token),
    refreshPayment: (id, attemptId, token) => transaction('/orders/' + assertId(id) + '/payments/' + assertId(attemptId) + '/refresh', {}, token),
    vouchers: (id, token) => transaction('/orders/' + assertId(id) + '/vouchers', undefined, token),
  });
}
