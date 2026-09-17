# GMV core 0.2 migration

The storefront display currency, actual payment currency and CRM reporting currency are separate concepts. This module records actual provider-confirmed payment currency only. It does not convert currencies or change payment-provider capabilities.

- Every new event requires `currency: 'JPY' | 'CNY'`. `amount` is a positive safe integer in minor units: JPY 100 means 100 yen; CNY 9990 means 99.90 yuan. Use `decimalToMinor('99.90', 'CNY')` only when the trusted input is in major units; do not multiply provider minor-unit amounts again.
- Existing persisted JPY events retain their currency, amounts and event IDs. Do not relabel historical amounts or infer missing currencies from current storefront settings.
- `refundCompleted` additionally requires `originalPayment` and `completedRefundAmount` (prior completed refunds in the same minor unit). Fetch and lock these in the payment/refund transaction; deduplicate provider callbacks before adding to the cumulative amount.
- `summarizeGmvByCurrency` returns separate currency totals. `summarizeGmv` rejects mixed currencies; an empty input has `currency: null`. Any converted reporting total requires a separate explicit exchange-rate policy and cannot replace the original ledger.
- `createGmvClient` defaults to a JPY-only receiver. Configure `acceptedCurrencies: ['JPY', 'CNY']` on the server only after verifying the receiver's schema, ledger, summaries and UI support both currencies. Unsupported events remain in the outbox and never fail the customer's payment. Configuration alone does not upgrade a CRM receiver.

Version 0.2 deliberately rejects calls that omit payment currency or refund provenance. Upgrade producer adapters together with this package. Provider-specific JPY checkout rules remain valid when the provider actually charges JPY, even if product prices are displayed in CNY.
