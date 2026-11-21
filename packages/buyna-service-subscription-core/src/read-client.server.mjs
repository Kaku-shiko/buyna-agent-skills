import {assertSubscriptionIdentity} from './snapshot.server.mjs';

// Identity must come from server configuration, never browser query parameters.
export function createSubscriptionReader({identity,token,fetchImpl=fetch}) {
  assertSubscriptionIdentity(identity);
  const scope={...identity};
  return async function read(sellerId) {
    if(sellerId!==scope.sellerId)throw Object.assign(Error('subscription_scope_denied'),{status:403});
    if(typeof token!=='string'||!token.startsWith('bsr1.'))throw Object.assign(Error('subscription_connection_not_configured'),{status:503});
    const url=new URL('https://www.buyna.jp/api/internal/subscription-state');
    url.searchParams.set('sellerId',scope.sellerId);
    let response,data;
    try {
      response=await fetchImpl(url,{headers:{authorization:`Bearer ${token}`,accept:'application/json'},signal:AbortSignal.timeout(8000),redirect:'error',cache:'no-store'});
      data=await response.json();
    } catch {throw Object.assign(Error('subscription_status_unavailable'),{status:503});}
    if(!response.ok||data?.apiVersion!=='1.1'||!/^sv1_[a-f0-9]{64}$/.test(data.stateVersion||''))throw Object.assign(Error('subscription_status_unavailable'),{status:503});
    if(['projectId','sellerId','shopId'].some(key=>data.identity?.[key]!==scope[key]))throw Object.assign(Error('subscription_scope_mismatch'),{status:502});
    if(!data.review||typeof data.review.required!=='boolean'||!data.service||!data.payment||!data.renewal||!Array.isArray(data.billingHistory))throw Object.assign(Error('subscription_status_unavailable'),{status:503});
    return data;
  };
}
