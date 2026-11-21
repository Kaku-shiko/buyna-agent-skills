const operations: Record<string, {method: string; endpoint: string; action?: string}> = {
  'subscription-state': {method: 'GET', endpoint: 'subscription-state'},
  'subscription-payment-context': {method: 'GET', endpoint: 'subscription-payment', action: 'context'},
  'subscription-billing-profile': {method: 'POST', endpoint: 'subscription-payment', action: 'save-profile'},
  'subscription-checkout-direct': {method: 'POST', endpoint: 'subscription-payment', action: 'start'},
  'subscription-plan-change': {method: 'POST', endpoint: 'subscription-payment', action: 'schedule-upgrade'},
  'subscription-plan-change-cancel': {method: 'POST', endpoint: 'subscription-payment', action: 'cancel-plan-change'},
  'subscription-resume': {method: 'POST', endpoint: 'subscription-payment', action: 'resume-renewal'},
  'subscription-cancel': {method: 'POST', endpoint: 'subscription-cancel'},
};
type Dependencies = {
  seller(): Promise<string | null>;
  readToken?: string;
  checkoutToken?: string;
  request?: typeof fetch;
};
const json = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'private, no-store'}});
export function createSubscriptionProxy(identity: {projectId:string;sellerId:string;shopId:string}, origin:string) {
if(new URL(origin).origin!==origin || !origin.startsWith('https://'))throw Error('INVALID_SUBSCRIPTION_ORIGIN');
function validSnapshot(value: any) {
  return value?.apiVersion === '1.1' && /^sv1_[a-f0-9]{64}$/.test(value.stateVersion ?? '') &&
    Object.entries(identity).every(([key, expected]) => value.identity?.[key] === expected);
}

return async function subscriptionProxy(request: Request, operation: string, deps: Dependencies): Promise<Response> {
  const spec = operations[operation];
  if (!spec) return json({error: 'NOT_FOUND'}, 404);
  if (request.method !== spec.method) return json({error: 'METHOD_NOT_ALLOWED'}, 405);
  if (new URL(request.url).origin !== origin) return json({error: 'INVALID_HOST'}, 403);
  try {
    if (await deps.seller() !== identity.sellerId) return json({error: 'UNAUTHORIZED'}, 401);
    let input: Record<string, unknown> = {};
    if (request.method === 'POST') {
      if (request.headers.get('origin') !== origin) return json({error: 'INVALID_ORIGIN'}, 403);
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({error: 'JSON_REQUIRED'}, 415);
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      if (reader) while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 6000) { await reader.cancel(); return json({error: 'REQUEST_TOO_LARGE'}, 413); }
        chunks.push(value);
      }
      const data = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
      input = JSON.parse(new TextDecoder().decode(data));
      if (!input || Array.isArray(input) || typeof input !== 'object' || ['projectId', 'sellerId', 'shopId', 'action'].some(key => key in input)) return json({error: 'INVALID_REQUEST'}, 400);
    }
    const read = operation === 'subscription-state';
    const token = read ? deps.readToken : deps.checkoutToken;
    if (!token || !token.startsWith(read ? 'bsr1.' : 'bsc1.')) return json({error: 'SUBSCRIPTION_NOT_CONFIGURED'}, 503);
    const url = new URL(`/api/internal/${spec.endpoint}`, 'https://www.buyna.jp');
    if (read) url.searchParams.set('sellerId', identity.sellerId);
    const response = await (deps.request ?? fetch)(url, {
      method: read ? 'GET' : 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25000),
      headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-buyna-subscription-api': '1.1'},
      ...(read ? {} : {body: JSON.stringify({...input, ...(spec.action ? {action: spec.action} : {}), sellerId: identity.sellerId})}),
    });
    const result = await response.json();
    if (!response.ok) return json({error: /^[A-Z_]{1,80}$/.test(result?.error) ? result.error : 'SUBSCRIPTION_UNAVAILABLE', ...(result?.operationCommitted === true ? {operationCommitted: true} : {})}, [400,401,403,409,428,503].includes(response.status) ? response.status : 502);
    if (read ? !validSnapshot(result) : result?.snapshot && !validSnapshot(result.snapshot)) return json({error: 'SUBSCRIPTION_IDENTITY_MISMATCH'}, 502);
    if (spec.action === 'context' && (!result?.profile || !['subscription_billing', 'empty'].includes(result.source))) return json({error: 'INVALID_PROFILE_RESPONSE'}, 502);
    if (spec.action === 'save-profile' && (!result?.profile || !Number.isSafeInteger(result.revision) || result.revision<1 || result.source!=='subscription_billing')) return json({error:'INVALID_PROFILE_RESPONSE'},502);
    if (['schedule-upgrade', 'cancel-plan-change', 'resume-renewal'].includes(spec.action ?? '') && !validSnapshot(result?.snapshot)) return json({error: 'INVALID_OPERATION_RESPONSE'}, 502);
    if (spec.action === 'start') {
      if (result?.status === 'active') {
        if (!validSnapshot(result.snapshot)) return json({error: 'INVALID_OPERATION_RESPONSE'}, 502);
      } else {
        const destination = new URL(result?.checkoutUrl);
        if (!['https://jp.globalfreepay.com', 'https://pay.globepay.co.jp'].includes(destination.origin) || destination.username || destination.password || destination.hash) return json({error: 'INVALID_CHECKOUT_DESTINATION'}, 502);
      }
    }
    if (spec.endpoint === 'subscription-cancel' && !validSnapshot(result?.snapshot)) return json({error: 'STATE_RELOAD_REQUIRED', operationCommitted: true}, 503);
    return json(result);
  } catch (error) {
    return json({error: error instanceof SyntaxError ? 'INVALID_JSON' : 'SUBSCRIPTION_UNAVAILABLE'}, error instanceof SyntaxError ? 400 : 503);
  }
}
}
