import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  buildAuthParams,
  buildIdempotencyKey,
  evaluateProviderStatus,
  planCheckout,
  validateConfig,
  validateRecurring,
} from './globepay-core.mjs';

test('config validation accepts only the GlobePay Japan API base and reports secret presence safely',()=>{
  assert.deepEqual(validateConfig({
    baseUrl:'https://pay.globepay.co.jp/api/v1.0/',partnerCode:'partner',credentialCode:'secret',
    notifyUrl:'https://shop.example/api/payment/notify',returnUrl:'https://shop.example/payment/result',currency:'JPY',
  }),{status:'pass',code:'CONFIG_VALID',baseUrl:'https://pay.globepay.co.jp/api/v1.0',currency:'JPY',partnerCodeConfigured:true,credentialCodeConfigured:true,notifyUrlConfigured:true,returnUrlConfigured:true,errors:[]});
  const invalid=validateConfig({baseUrl:'https://pay.globepay.co/api/v1.0',partnerCode:'partner',credentialCode:'secret',notifyUrl:'http://shop.example/notify',returnUrl:'https://shop.example/result',currency:'USD'});
  assert.equal(invalid.status,'blocked');
  assert.deepEqual(invalid.errors.map(item=>item.code),['INVALID_BASE_URL','INVALID_CURRENCY','INVALID_NOTIFY_URL']);
  assert.equal(JSON.stringify(invalid).includes('secret'),false);
});

test('auth params use the documented signing order without exposing the credential',()=>{
  const result=buildAuthParams({partnerCode:'P100',credentialCode:'C200',time:1700000000000,nonce:'abc_123'});
  assert.deepEqual(result,{partner_code:'P100',time:'1700000000000',nonce_str:'abc_123',sign:'a54437ae884bc7ff464e54d0db1ef53e8d3ae5905011aebfd53bce106963307a'});
  assert.equal(JSON.stringify(result).includes('C200'),false);
});

test('checkout planning preserves the selected method and routes by trusted context',()=>{
  assert.equal(planCheckout({paymentMethod:'wechat',context:'desktop'}).endpointFamily,'gateway');
  assert.equal(planCheckout({paymentMethod:'wechat',context:'mobile'}).endpointFamily,'h5_payment');
  assert.equal(planCheckout({paymentMethod:'wechat',context:'wechat_browser'}).endpointFamily,'jsapi_gateway');
  assert.equal(planCheckout({paymentMethod:'alipay',context:'alipay_browser'}).endpointFamily,'jsapi_gateway');
  assert.equal(planCheckout({paymentMethod:'card',context:'mobile'}).endpointFamily,'pre_card_orders');
  assert.throws(()=>planCheckout({paymentMethod:'wechat',context:'alipay_browser'}),/PAYMENT_CONTEXT_MISMATCH/);
  assert.throws(()=>planCheckout({paymentMethod:'cash',context:'desktop'}),/INVALID_PAYMENT_METHOD/);
});

test('provider status evaluation never treats redirect or order creation as paid',()=>{
  assert.deepEqual(evaluateProviderStatus({currentStatus:'pending_payment',eventType:'redirect',resultCode:'PAY_SUCCESS'}),{status:'blocked',code:'UNTRUSTED_PAYMENT_EVENT',currentStatus:'pending_payment',nextStatus:'pending_payment',effects:[]});
  assert.equal(evaluateProviderStatus({currentStatus:'expired',eventType:'query',resultCode:'PAY_SUCCESS'}).nextStatus,'paid');
  assert.equal(evaluateProviderStatus({currentStatus:'paid',eventType:'notify',resultCode:'FULL_REFUND'}).nextStatus,'refunded');
  assert.equal(evaluateProviderStatus({currentStatus:'refunded',eventType:'query',resultCode:'PAY_SUCCESS'}).nextStatus,'refunded');
  assert.equal(evaluateProviderStatus({currentStatus:'pending_payment',eventType:'notify',resultCode:'CLOSED'}).nextStatus,'cancelled');
});

test('idempotency keys are stable across object key order',()=>{
  const first=buildIdempotencyKey({providerOrderId:'GP-1',eventType:'notify',resultCode:'PAY_SUCCESS',payload:{b:2,a:1}});
  const second=buildIdempotencyKey({providerOrderId:'GP-1',eventType:'notify',resultCode:'PAY_SUCCESS',payload:{a:1,b:2}});
  assert.equal(first,second);
  assert.match(first,/^[a-f0-9]{64}$/);
});

test('recurring validation requires explicit subscription terms and server-only identifiers',()=>{
  assert.equal(validateRecurring({description:'Plan',currency:'JPY',price:1000,expire:'30m',notifyUrl:'https://shop.example/notify',redirectUrl:'https://shop.example/result',merchantAgreementId:'agreement-1',consumerConsent:true}).status,'pass');
  const invalid=validateRecurring({description:'Plan',currency:'JPY',price:0,expire:'=30m',notifyUrl:'=https://shop.example/notify',redirectUrl:'http://shop.example/result',merchantAgreementId:'',consumerConsent:false});
  assert.equal(invalid.status,'blocked');
  assert.deepEqual(invalid.errors.map(item=>item.code),['INVALID_PRICE','INVALID_EXPIRE','INVALID_NOTIFY_URL','INVALID_REDIRECT_URL','MISSING_MERCHANT_AGREEMENT_ID','CONSUMER_CONSENT_REQUIRED']);
});

test('CLI rejects a missing operation and never prints the credential',()=>{
  const cli=fileURLToPath(new URL('./globepay-cli.mjs',import.meta.url));
  const missing=spawnSync(process.execPath,[cli],{encoding:'utf8'});
  assert.equal(missing.status,1);
  assert.equal(JSON.parse(missing.stdout).code,'MISSING_OPERATION');

  const credential='credential-must-not-appear';
  const checked=spawnSync(process.execPath,[cli,'--operation','config.validate'],{
    encoding:'utf8',
    input:JSON.stringify({currency:'JPY'}),
    env:{...process.env,GLOBEPAY_BASE_URL:'https://pay.globepay.co.jp/api/v1.0',GLOBEPAY_PARTNER_CODE:'partner',GLOBEPAY_CREDENTIAL_CODE:credential,GLOBEPAY_NOTIFY_URL:'https://shop.example/notify',GLOBEPAY_RETURN_URL:'https://shop.example/result'},
  });
  assert.equal(checked.status,0);
  assert.equal(JSON.parse(checked.stdout).status,'pass');
  assert.equal(checked.stdout.includes(credential),false);
});
