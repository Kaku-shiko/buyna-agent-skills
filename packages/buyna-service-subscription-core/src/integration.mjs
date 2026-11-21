const identityKeys = ['projectId', 'sellerId', 'shopId'];
const paths = new Set(['state', 'checkout-direct', 'plan-change', 'cancel', 'resume', 'plan-change-cancel', 'payment-context', 'billing-profile'].map(name => `/api/admin/subscription-${name}`));

// Browser configuration checks isolation, but never grants server authorization.
export function defineSubscriptionIntegration({identity, domain}) {
  if (identityKeys.some(key => typeof identity?.[key] !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(identity[key]))) throw Error('INVALID_SUBSCRIPTION_IDENTITY');
  if (typeof domain !== 'string' || !/^[a-z0-9.-]+$/i.test(domain) || !domain.includes('.')) throw Error('INVALID_SUBSCRIPTION_DOMAIN');
  return Object.freeze({identity: Object.freeze(Object.fromEntries(identityKeys.map(key => [key, identity[key]]))), domain});
}

export function assertSubscriptionIdentity(snapshot, config) {
  if (snapshot?.apiVersion !== '1.1' || identityKeys.some(key => snapshot?.identity?.[key] !== config.identity[key])) throw Error('SUBSCRIPTION_IDENTITY_MISMATCH');
  return snapshot;
}

export function bindSubscriptionApi(transport, input) {
  const config = defineSubscriptionIntegration(input);
  if (typeof transport !== 'function') throw Error('SUBSCRIPTION_TRANSPORT_REQUIRED');
  return async (path, options) => {
    if (!paths.has(path)) throw Error('UNSUPPORTED_SUBSCRIPTION_ENDPOINT');
    const result = await transport(path, options);
    if (path === '/api/admin/subscription-state') assertSubscriptionIdentity(result, config);
    if (result?.snapshot) assertSubscriptionIdentity(result.snapshot, config);
    return result;
  };
}
