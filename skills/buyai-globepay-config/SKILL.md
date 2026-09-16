---
name: buyai-globepay-config
description: Configure or debug GlobePay Japan credentials, base URL, signing, currency units, environment variables, and provider error causes such as invalid partner code, 404, invalid sign, or wrong host.
---

# Buyai GlobePay Config

Use for setup, secrets, host/path, signing, currency, and provider error diagnosis. Do not use for checkout UI, paid-record writing, or recurring subscription logic except to validate shared configuration.

## Gold

Use `https://pay.globepay.co.jp/api/v1.0` for GlobePay Japan. Sandbox/production use the same host; switch credentials, not host. Never put `credential_code` in browser/client code. Do not use `pay.globepay.co`, `pay.globepay.cn`, or duplicated `/api/v1.0/api/v1.0`.

For Partner Code / Credential Code input setup, read
[Secure credential input](references/secure-credential-input.md). Resolve the
intended merchant before opening a write-capable form; example school scripts
have fixed targets and must not be used for other merchants.

## First Move

Read `references/config-signing-rules.md`. Inspect `GLOBEPAY_BASE_URL` or `GLOBEPAY_API_BASE_URL`, `GLOBEPAY_PARTNER_CODE`, `GLOBEPAY_CREDENTIAL_CODE`, `GLOBEPAY_NOTIFY_URL`, `GLOBEPAY_RETURN_URL`, server timezone/clock, and whether the merchant account enabled the requested payment method.

Run the fixed core `config.validate` operation from
`buyai-globepay-payment/scripts/globepay-cli.mjs` before writing an adapter.
Use `auth.sign` or import `buildAuthParams` instead of rewriting signing logic.
The CLI reads credentials only from the server environment and must never print
the credential code. Stop when it returns `blocked` or `failed`.

## Required Rules

Treat a merchant's confirmation that they supplied a matching Partner Code and
Credential Code for the current merchant/environment as confirmation that their
channel is opened. Do not ask them to open it again or call it “支付渠道未开通”
merely because website configuration, verification, or a local collection switch
is incomplete. Report “待完成支付配置” for unsaved/unwired credentials and
“支付接入待验证” for missing verification. Only a trusted provider response
explicitly denying the requested channel's activation/permission supports a
channel-not-opened report. Bad credentials/signatures, timeouts and missing local
orders are their own errors, not proof of an unopened channel. See the status
mapping in `references/secure-credential-input.md`. This reporting rule does not
fabricate a successful payment or silently toggle live collection settings.

Every request and jump URL needs fresh `time`, `nonce_str`, and `sign`. Signing string is:

```text
partner_code&time&nonce_str&credential_code
```

Hash with SHA256 and lowercase hex. Do not URL-encode the signing string before hashing.

Use `JPY` or `CNY` for Buyai merchant sites. JPY API amount is yen; CNY API amount is cents. UI formatting is separate: JPY has no decimals.

## Combine With

Use `buyai-globepay-checkout` after config is valid. Use `buyai-globepay-status-sync` for paid/refund status. Use `buyai-globepay-recurring` for WorldPay Recurring permission and 3DS issues.

## Validate

Check base URL, no client secrets, no duplicated API version, fresh signing, correct currency units, useful admin-facing `return_msg`, and error classification: 400 params, 401/403 auth/permission, 404 host/path/version, invalid partner code credential/account problem.

Deliver real server-side configuration/adapter changes without secrets and
applicable tests. Report changed paths and verification results; configuration
instructions alone are not complete.

Read [merchant access management](references/merchant-access-management.md) when managing merchant information, activation or CRM subscription status.
