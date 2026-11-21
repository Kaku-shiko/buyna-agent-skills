# Subscription Module 0.3.0

## Ownership

- `src/`: canonical snapshot, browser transport and identity validation.
- `ui/`: shared subscription dialogs, renewal reminders and scoped styles.
- Merchant adapters: authenticated same-origin server routes and a small frontend configuration.
- Official backend: pricing, provider authorization, payment verification, CRM state and debit scheduling. UI installation never grants billing authority.

EC is the only validated pilot. Other merchants are not enabled by this extraction.

## React Host

Install React 18 or 19 as a peer dependency. In a Vite monorepo, deduplicate `react` and `react-dom` to use the host instance.

```jsx
import SubscriptionPanel from '@buyna/service-subscription-core/react';
import SubscriptionReminder from '@buyna/service-subscription-core/reminder';
import {defineSubscriptionIntegration} from '@buyna/service-subscription-core/integration';

const config = defineSubscriptionIntegration({
  identity: {projectId: 'registered-project', sellerId: 'registered-seller', shopId: 'default'},
  domain: 'merchant.example.com',
});
// api must use the host's authenticated same-origin transport.
// Mount only inside the authenticated merchant admin.
<SubscriptionPanel config={config} api={api} onUnauthorized={logout}/>;
<SubscriptionReminder config={config} api={api} view={view} onUnauthorized={logout}/>;
```

The panel supports `modalOnly`, `modalRequest` (`mode`, `trigger`) and `onDismiss` for embedding in existing admin layouts. Reminders open the same dialogs rather than navigating to another subscription page. Default host view keys are `dashboard` and `subscription`.

## Server Contract

Same-origin routes under `/api/admin/subscription-`:

| Suffix | Method | Purpose |
| --- | --- | --- |
| state | GET | Canonical API 1.1 snapshot |
| payment-context | GET | Owned company/billing details |
| checkout-direct | POST | Verified hosted checkout URL |
| plan-change | POST | Schedule next-cycle plan change |
| plan-change-cancel | POST | Cancel pending plan change |
| cancel | POST | Disable automatic renewal |
| resume | POST | Verify authorization and enable renewal |

The host server must derive identity from its own session/configuration, validate origin and tenant scope, and keep credentials server-side. The browser checks all three identity fields on read and mutation snapshots. Do not replace this with seller ID alone. Keep the official server allowlist unchanged until each merchant is separately accepted.

## Behavioral Standard

- Payment goes directly to the allowlisted GlobePay hosted checkout; no card data enters this module.
- Basic remains active until its paid-through date. Scheduled Pro activates only after verified next-cycle payment.
- Cancelling a plan change keeps the renewal switch unchanged and restores the current plan's next-cycle price.
- Cancelling renewal removes the next debit, preserves the paid-through date and does not cancel a pending plan change.
- Successful changes show a distinct result dialog, not an immediate-upgrade claim.
- Unknown prices remain unknown; never synthesize a successful bill or authorization.
- Renewal reminders use JST daily dismissal, tenant-scoped keys, and the existing 7/3/1-day stages.

## Validation and Release

Run package tests, the EC production build, `subscription-direct-browser.mjs` and `subscription-modal-browser.mjs`. Browser tests use fixture APIs and must not create real charges. A module build does not establish provider settlement, receipt delivery or other-merchant readiness. Retain the existing deployed version until the EC-only release is explicitly performed and verified.
# Version 0.3.1

Mobile-first single-column layouts and first credit-card renewal opt-in are available in this release. Keep existing installations pinned; this version does not activate itself.

The server snapshot may explicitly grant `capabilities.renewalOptIn`. Only a confirmed legacy service with no card agreement and no queued plan change is eligible in the BlueSequoia rollout. The checkout checkbox defaults to selected and remains editable; the separate terms/amount confirmation still defaults to unchecked. Selection is not an active authorization. Only verified payment plus the matching ACTIVE provider agreement may atomically enable renewal and its next billing date. Existing merchant subscriptions without this capability keep their current behavior.
