# Subscription Distribution API

Live control plane: `https://admin.buyna.jp`. Subscription delivery: `https://www.buyna.jp`.
Inspect the authenticated catalog and channel endpoints for current versions and enrolled projects. Do not publish merchant enrollment records in the public Skills repository or global AI context. Publishing code does not promote a channel or create an acceptance receipt.

## Operations

All admin routes require the existing signed administrator session. POST requests additionally require `Origin: https://admin.buyna.jp`, `Content-Type: application/json`, and `X-Buyna-Module-Operation: 1`.

| Route | Meaning |
| --- | --- |
| GET /api/admin/modules | Cloud catalog and enrolled projects |
| POST /api/admin/module-releases | Verify an already built, tested and uploaded release; does not run a build |
| POST /api/admin/module-deployments/preflight | Verify project, explicit version, asset hashes and API compatibility |
| POST /api/admin/module-deployments | Conditional per-project channel switch |
| GET /api/admin/module-deployments/:id | Recorded channel publication result |
| POST /api/admin/module-deployments/:id/rollback | Restore that channel's previous version, provided it is still current |

Preflight body: `{ "project": "shop_sanwa_life", "version": "0.5.2" }`.
Publish adds the returned `expectedDeploymentId`, a stable UUID `requestId`, and `confirm: true`.
Rollback takes `project`, a new stable UUID `requestId`, and `confirm: true`.

Successful publication means `CHANNEL_PUBLISHED`, not verified payment or already reloaded browsers. Existing pages update on their next load, avoiding interruption of a payment form. Duplicate publication requests reuse the same result; concurrent channel updates are rejected. A channel commit survives an audit write failure and reports `auditPending`.

## Build vs Publish

`publish-subscription.mjs` currently builds the private package from repository sources, runs tests, uploads immutable artifacts, and conditionally updates the catalog. It is an operator/build-runner command, not a remotely executable build API. Never accept arbitrary commands, source paths or repository URLs from the HTTP endpoints.

The public loader resolves only an enrolled channel, then imports immutable compiled JS/CSS whose hashes were verified. Private raw package sources and credentials are not served. Design, copy and component behavior travel together. Trusted merchant identity and authentication stay in the merchant-local adapter; prices, dates, authorization, CRM and payment settlement stay in the official API.

Compatible component updates require only a channel switch, not a merchant rebuild. Backend API changes still require a coordinated backend release and compatibility testing before publication. A component rollback does not revert customer data, payment transactions, CRM history or database schemas.

## Safety and Rollback

Package compatibility is independent of merchant enrollment. New versions do not contain a merchant-specific install allowlist. Installation still requires a verified local compatibility receipt. Enrollment and channel publication remain explicit operations; other merchants are not automatically enrolled.

The Lambda role can read delivery artifacts and the catalog, and write only the enrolled Sanwa, BlueSequoia, chameleon, xinghe and kaihou channels and publication audit prefix. It can list the bucket to distinguish missing idempotency records from inaccessible records; it cannot read other objects through this policy. No shell execution or provider charge permissions were added.

Sanwa local fallback release: `/var/www/shop_sanwa_life/releases/20261019Tsubscription050`.
Cloud delivery release: `/var/www/shop_sanwa_life/releases/20261019Tsubscription052`.
Previous non-subscription release: `/var/www/shop_sanwa_life/releases/20261019TcouponCommerce3`.

Real credit-card charges and recipient email/PDF delivery remain user-owned acceptance. No real charges or test emails were sent.
