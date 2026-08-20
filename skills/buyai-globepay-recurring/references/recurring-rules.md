# GlobePay WorldPay Recurring Rules

Official section: `https://pay.globepay.co.jp/docs/cn/#api-WorldPay_Recurring-RecurringPreOrder`.

WorldPay Recurring is for subscription/periodic credit-card billing. It is independent from old `bind_card_orders`, tokenize, and `pay_anytime` flows.

## First CIT

- Create preorder: `PUT /gateway/partners/{partner_code}/recurring/pre_orders/{client_order_id}`
- Required JSON includes `description`, `currency`, `price`, `preauth=false`, `expire`, `notify_url`, `redirect`, `operator`, and `agreement`.
- `agreement.merchant_agreement_id` must be merchant-unique.
- `agreement.type=subscription`.
- `agreement.consumer_consent=true`.
- Response includes `pay_url`, `platform_agreement_id`, `merchant_agreement_id`.
- Customer must be redirected to hosted 3DS checkout.

Agreement query:

- `GET /gateway/partners/{partner_code}/recurring/agreements/{merchant_agreement_id}`
- Status can be `PENDING`, `ACTIVE`, or `FAILED`.
- Only `ACTIVE` is ready for MIT charges.

## Later MIT

- Charge: `PUT /gateway/partners/{partner_code}/recurring/agreements/{platform_agreement_id}/charges/{charge_id}`
- Query charge: `GET /gateway/partners/{partner_code}/recurring/agreements/{platform_agreement_id}/charges/{charge_id}`
- Only `result_code=PAY_SUCCESS` marks monthly charge paid.
- `charge_id` must be idempotent.

Use `expire: "30m"` where recurring docs expect string expiry. If GlobePay says merchant has not activated 3DS, stop code changes and ask GlobePay to enable 3DS/WorldPay Recurring for that partner code.
