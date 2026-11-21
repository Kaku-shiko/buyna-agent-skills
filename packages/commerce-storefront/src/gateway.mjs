import {assertSlug, contractVersion, publicRoute} from './contract.mjs';

function origin(value, development) {
  const url = new URL(value);
  const loopback = ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.origin !== value || url.username || url.password || (url.protocol !== 'https:' && !(development && loopback && url.protocol === 'http:'))) throw Error('INVALID_GATEWAY_ORIGIN');
  return url;
}

// Bind this configuration from server deployment data, never URL/query/body input.
export function createStorefrontGateway({siteSlug, frontendOrigin, commerceOrigin, development = false, fetchImpl = globalThis.fetch, timeoutMs = 15000} = {}) {
  assertSlug(siteSlug);
  if (typeof development !== 'boolean' || typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw Error('INVALID_GATEWAY_CONFIG');
  const frontend = origin(frontendOrigin, development), upstream = origin(commerceOrigin, development);
  if (!['https://shops.buynacommerce.com', 'https://sites-staging.buynacommerce.com'].includes(upstream.origin) && !(development && upstream.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(upstream.hostname))) throw Error('UNAPPROVED_COMMERCE_ORIGIN');
  const config = Object.freeze({contractVersion, siteSlug, mediaOrigin: upstream.origin, checkoutMode:'hosted-storefront',
    checkoutUrl: upstream.origin + '/sites/' + siteSlug + '/catalog'});
  return async function storefrontGateway(req, res) {
    function json(status, value) {
      res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
      res.end(JSON.stringify(value));
    }
    if (!(req.url || '').startsWith('/commerce/')) return false;
    if (req.headers.host !== frontend.host) {json(403, {code:'INVALID_HOST', error:'访问地址未登记。'}); return true;}
    const path = req.url.slice('/commerce/v1'.length);
    if (!req.url.startsWith('/commerce/v1/') || /[%?\\#]/.test(path) || path.includes('//') || path.split('/').includes('..')) {json(404, {error:'接口不存在。'}); return true;}
    if (req.method === 'GET' && path === '/config') {json(200, config); return true;}
    if (!publicRoute(path, req.method)) {json(404, {error:'接口不存在。'}); return true;}
    if ((req.headers.origin && req.headers.origin !== frontend.origin) || (req.method === 'POST' && req.headers.origin !== frontend.origin)) {json(403, {code:'INVALID_ORIGIN', error:'请求来源无效。'}); return true;}
    try {
      let body;
      if (req.method === 'POST') {
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {json(415, {error:'仅支持 JSON。'}); return true;}
        const chunks = []; let size = 0;
        for await (const chunk of req) {size += chunk.length; if (size > 65536) {json(413, {error:'请求过大。'}); return true;} chunks.push(chunk);}
        try {body = JSON.stringify(JSON.parse(Buffer.concat(chunks).toString('utf8')));} catch {json(400, {error:'请求格式无效。'}); return true;}
      }
      // Cookies, Authorization, caller scope headers and forwarded hosts are never forwarded.
      const response = await fetchImpl(upstream.origin + '/api/public/' + siteSlug + path, {method:req.method,
        headers:{Accept:'application/json', ...(body === undefined ? {} : {'Content-Type':'application/json', Origin:upstream.origin})},
        body, redirect:'error', credentials:'omit', signal:AbortSignal.timeout(timeoutMs)});
      if (!response.headers.get('content-type')?.includes('application/json')) throw Error('INVALID_UPSTREAM_RESPONSE');
      if (response.status >= 500) throw Error('UPSTREAM_FAILURE');
      json(response.status, await response.json());
    } catch {json(502, {code:'COMMERCE_UNAVAILABLE', error:'店铺服务暂时不可用。'});}
    return true;
  };
}
