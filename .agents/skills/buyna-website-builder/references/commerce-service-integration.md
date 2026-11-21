# Existing Commerce checkout integration

Read this at intake and before checkout implementation when the registered store uses the shared Commerce platform. Preserve existing `fixed-cores` and `legacy-globepay-service` projects; installing this update does not migrate them.

Use `packages/commerce-storefront` version 0.1.0 (`@buyna/commerce-storefront`). Resolve tenant, store and site binding from the authenticated Commerce control plane, never from a copied example store or browser-supplied identity. Keep secrets and provider adapters in the existing Commerce service.

| Deployment | Delivered interface | Required boundary |
| --- | --- | --- |
| Existing Commerce same-origin store | Catalog, quotes, order/booking creation, payment requests and provider refresh | Server prices, stock reservation, stable retry key, order access proof and store-owned credentials |
| Independent frontend gateway | Public catalog/pages, quotes and payment availability | Fixed upstream and store; no forwarded cookies or authorization; no order or payment creation |
| Independent hosted checkout handoff | Not delivered in SDK 0.1.0 | Do not claim cart transfer, invent a pay domain, or generate a second billing engine |

For an independent frontend, the existing store link does not transfer its cart. Report this limitation before offering that architecture. The workflow currently accepts only its two registered legacy payment architecture values; do not force a shared service through either value. Shared-Commerce workflow support needs its own verified interface and schema/route tests before becoming a default.

The SDK contains no separately packaged checkout UI. Reuse the existing Commerce checkout where available. A future UI extraction must carry its actual dependencies, URL validation and tests; do not label this SDK as that extraction.

Payment completion requires server verification of provider status, signature, ownership, amount, currency and idempotency. A successful redirect is not payment evidence. BUYNA service subscriptions use `buyna-service-subscription` and the official subscription authority, not storefront credentials.
