# BUYNA service subscription core - 0.3.0 EC candidate

This package owns the safe subscription snapshot projection and the browser's
versioned cancellation/revalidation flow. The existing official AWS payment
services still own provider transport, settlement, extensions and renewal.

## Entry points

- `ui/`: shared React panel, confirmation/result dialogs and renewal reminder.
- `src/integration.mjs`: immutable host configuration and full identity checks.
- [Integration contract](INTEGRATION.md): host setup, endpoint contract, behavior and release boundaries.

- `src/snapshot.server.mjs`: server-only projection, source revision, scoped
  ledger and entitlement fields. Never bundle this crypto/server entry for a UI.
- `src/client.mjs`: authenticated same-origin client, ordered refresh, versioned
  cancellation, post-write revalidation and compatibility projection.
- `src/model.mjs`: historical display model. Its static catalog is not an
  authoritative API and must not be used by new API-driven subscription panels.

Official routes: `/api/merchant/subscription-state` and
`/api/internal/subscription-state`. The merchant's backend provides its own
authenticated same-origin proxy and never exposes read/management tokens.

The official merchant page, CRM subscription view and EC pilot consume the
shared reader. EC uses its protected `/api/admin/subscription-state` adapter.
Do not deploy frontend, official API and merchant adapter at mismatched versions.

`stateVersion` identifies persisted state, not time. Send the selected row's
`stateVersion` as `expectedVersion` with a request ID for cancellation. Publish
the successful response's full `snapshot`, then re-read. An already committed
operation followed by a read outage is not a reason to start another payment.

See `.agents/skills/buyna-service-subscription` in the source repository for the
repeatable workflow and configuration-only planner. These files do not create
resources, enable billing, migrate all merchants or certify deployment.

The CRM command coordinator updates service dates and renewal schedules together.
Current limits: bounded 100-item transactional read; no independent paginated
history, server-push invalidation or complete durable alert delivery yet. Unknown
legacy dates retain rights without new debits. Direct provider checkout and the
reminder UI are still EC-scoped, not a portable all-merchant payment release.

Run `node --test test/*.test.mjs` with a supported Node runtime. Test fixtures
never contact the live provider or send email. The integration-plan tests also
need the sibling Skill source tree present.

## Repeatable EC acceptance

From the repository root, using Node 24:

```sh
node packages/buyna-service-subscription-core/scripts/verify-ec-pilot.mjs
```

Build the EC frontend before testing changed UI. The command runs local unit and
browser fixture tests, saves individual logs and a receipt under
`.codex-tmp/subscription-acceptance/`, and exits nonzero on any failed suite.
It never deploys, creates a provider order, sends mail or charges a card.
Its passing result is not provider acceptance or authorization to release other
merchants. See [acceptance and rollout](ACCEPTANCE.md).
