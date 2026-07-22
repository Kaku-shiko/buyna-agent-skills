# GlobePay Config And Signing Rules

- Host: `https://pay.globepay.co.jp/`
- API base URL: `https://pay.globepay.co.jp/api/v1.0`
- If base URL includes `/api/v1.0`, append endpoint paths such as `/gateway/...`, `/h5_payment/...`, `/web_gateway/...`, `/channels/...`.
- Never generate `/api/v1.0/api/v1.0/...`.
- Required secrets: `GLOBEPAY_PARTNER_CODE`, `GLOBEPAY_CREDENTIAL_CODE`, notify URL, return URL.
- `credential_code` must exist only in server code or server functions.
- Signing string: `partner_code&time&nonce_str&credential_code`.
- `time` is UTC millisecond timestamp and must be fresh.
- `nonce_str` should be URL-safe.
- `sign=hex(sha256(valid_string)).toLowerCase()`.
- Do not URL-encode the signing string before hashing.

Currency:

- JPY API amount is yen.
- CNY API amount is cents.
- UI display is separate from API units.
- JPY display has zero decimals.

Errors:

- `400`: business parameter/payload problem.
- `401/403`: credential, signature, permission, or merchant account problem.
- `404`: wrong host/path/API version/endpoint.
- `SIGN_TIMEOUT`: clock or stale `time`.
- `INVALID_SIGN`: signing order/credential/nonce/time problem.
- `INVALID_CHANNEL`: channel case or not enabled.
- `NOT_PERMITTED`: merchant permission missing.
- `Partner Code is invalid`: bad/not-enabled partner code or mismatched credential.
