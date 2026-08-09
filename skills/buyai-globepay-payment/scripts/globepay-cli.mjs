#!/usr/bin/env node
import process from 'node:process';
import {buildAuthParams,buildIdempotencyKey,evaluateProviderStatus,planCheckout,validateConfig,validateRecurring} from './globepay-core.mjs';

const operationIndex=process.argv.indexOf('--operation');
const operation=operationIndex>=0?process.argv[operationIndex+1]:null;
if(!operation||operation.startsWith('--'))fail('MISSING_OPERATION');
let input={};
if(!process.stdin.isTTY){const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);const text=Buffer.concat(chunks).toString('utf8').trim();if(text)input=JSON.parse(text)}
try{
  let result;
  if(operation==='config.validate')result=validateConfig({baseUrl:process.env.GLOBEPAY_BASE_URL||process.env.GLOBEPAY_API_BASE_URL,partnerCode:process.env.GLOBEPAY_PARTNER_CODE,credentialCode:process.env.GLOBEPAY_CREDENTIAL_CODE,notifyUrl:process.env.GLOBEPAY_NOTIFY_URL,returnUrl:process.env.GLOBEPAY_RETURN_URL,currency:input.currency||process.env.GLOBEPAY_CURRENCY});
  else if(operation==='auth.sign')result=buildAuthParams({partnerCode:process.env.GLOBEPAY_PARTNER_CODE,credentialCode:process.env.GLOBEPAY_CREDENTIAL_CODE,time:input.time,nonce:input.nonce});
  else if(operation==='checkout.plan')result=planCheckout(input);
  else if(operation==='status.evaluate')result={...evaluateProviderStatus(input),idempotencyKey:input.providerOrderId?buildIdempotencyKey(input):null};
  else if(operation==='recurring.validate')result=validateRecurring(input);
  else fail('UNKNOWN_OPERATION');
  console.log(JSON.stringify({operation,...result}));
  if(result.status==='blocked')process.exitCode=2;
}catch(error){fail(error.code||error.message||'GLOBEPAY_CORE_FAILED')}

function fail(code){console.log(JSON.stringify({status:'failed',code,operation:operation||null}));process.exit(1)}
