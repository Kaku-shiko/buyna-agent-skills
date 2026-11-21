# Fixed module delivery

The repository contains reviewable source; the private cloud registry contains approved immutable installation artifacts. These are separate release states.

Run `node shared-modules/cli.mjs install service-subscription --project PROJECT --version VERSION` from this repository. Use `verify`, `upgrade --version VERSION` and `rollback` through the same CLI. Keep AWS credentials on the build server. Installation never changes subscription dates, payment authorization, merchant enrollment or production channels.

The live private registry was inspected on 2026-11-21 and approves versions through 0.5.10. Merchant enrollment records remain private. Set `BUYNA_MODULE_REGISTRY_FILE` to an operator-reviewed local copy of the authenticated cloud registry; `registry.example.json` grants no installation authority. Source 0.5.11 is a candidate with the checkbox layout correction and explicit access-mode projection; it is not an approved channel release. Do not edit `validatedProjects` or synthesize acceptance receipts to install it.

For cloud UI publication use [the release contract](RELEASE-API.md) and [batch release procedure](BATCH-RELEASE.md). Existing subscribed channels update on their next page load after an authenticated compatible release. Backend changes still require host adapter validation and a coordinated backend release. APEX remains outside this rollout.

Commerce storefront payments and BUYNA service subscription billing use separate services and credentials. `packages/commerce-storefront/README.md` documents the Commerce SDK's same-origin transactions and read/quote-only external gateway.
