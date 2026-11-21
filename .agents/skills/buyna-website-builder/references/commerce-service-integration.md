# Existing Commerce checkout integration

Read this at intake and before checkout implementation when the registered store uses the shared Commerce platform. Preserve existing `fixed-cores` and `legacy-globepay-service` projects; installing this update does not migrate them.

Use `packages/commerce-storefront` version 0.2.0 (`@buyna/commerce-storefront`). Resolve tenant, store and site binding from the authenticated Commerce control plane, never from a copied example store or browser-supplied identity. Keep secrets and provider adapters in the existing Commerce service.

| Deployment | Delivered interface | Required boundary |
| --- | --- | --- |
| Existing Commerce same-origin store | Catalog, quotes, order/booking creation, payment requests and provider refresh | Server prices, stock reservation, stable retry key, order access proof and store-owned credentials |
| Independent frontend gateway | Public catalog/pages, quotes and payment availability | Fixed upstream and store; no forwarded cookies or authorization; no order or payment creation |
| Independent hosted checkout handoff | Not delivered in SDK 0.1.0 | Do not claim cart transfer, invent a pay domain, or generate a second billing engine |

For an independent frontend, the existing store link does not transfer its cart. Report this limitation before offering that architecture. The workflow currently accepts only its two registered legacy payment architecture values; do not force a shared service through either value. Shared-Commerce workflow support needs its own verified interface and schema/route tests before becoming a default.

For new same-origin Commerce storefronts, install the registered commerce-storefront package and automatically mount CatalogCheckout from @buyna/commerce-storefront/react on checkout. Pass the bound slug, current quoted total, line IDs and fulfillment requirements. Mount FeedbackHost once and PaymentReturn on the configured Commerce return route. Use project theme styling around the shared checkout. Verify the full order, retry, payment-method selection, hosted redirect, verified result and voucher path before release.

Payment completion requires server verification of provider status, signature, ownership, amount, currency and idempotency. A successful redirect is not payment evidence. BUYNA service subscriptions use `buyna-service-subscription` and the official subscription authority, not storefront credentials.
