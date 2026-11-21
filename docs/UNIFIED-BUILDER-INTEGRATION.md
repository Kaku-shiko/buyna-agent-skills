# Unified Builder integration

The canonical reusable source is this repository. Builder carries the same Skills, SOPs and fixed packages plus its own runtime packages. Its `ops/verify-guidance-source.mjs SOURCE_CHECKOUT` checks shared content before publication. Cloud publication creates an immutable, content-addressed guidance release. New tasks use the current release; interrupted tasks retain their captured version.

## Included

- Backend foundation and component/resource routing, UI terminology and knowledge/tool boundaries previously present only in Builder.
- Existing CRM linkage and workflow authorization checks.
- Commerce Storefront SDK 0.1.0 and explicit same-origin versus external gateway limits.
- Service subscription source 0.5.11 candidate: cloud 0.5.10 base, checkbox layout correction, access-mode projection and existing EC refund observation. This is a source integration, not a promotion of merchant channels.
- A separately approved `subscription` dashboard slice. Subscription billing is separate from storefront provider adapters.
- Source/project installation path resolution, private-registry installation and rollback helpers.

The subscription panel is an explicitly requested shared presentation module. This does not change the project-owned presentation policy for storefront carts, checkout or general dashboards.

## Delivery boundaries

The referenced Commerce project had no Git repository at inspection. Its existing checkout UI remains in that application's `src/checkout-payment.tsx` and `src/catalog-checkout.tsx`, with application-specific feedback, redemption and styles. The imported SDK is not an extraction of that UI or a complete external checkout handoff. Do not infer otherwise from the package name.

Private enrollment records and operator credentials are not published here. Obtain the reviewed private registry through the existing authorized cloud connection and set `BUYNA_MODULE_REGISTRY_FILE` before installation. An example registry grants no authority. Publishing guidance does not run migrations, enable payment collection, activate overdue-account enforcement, or update existing merchant channels.

Original working copies, unrelated official-site edits, merchant deployments, and Commerce application source are preserved. Only reviewed reusable content is reconciled through this change. Real provider payment/refund acceptance and the subscription channel acceptance receipt remain separate from code tests.
