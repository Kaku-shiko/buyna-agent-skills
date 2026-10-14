# Paid PWA capability contract

This is a future integration contract, not a live API or implemented fixed module.
Inspect existing CRM/subscription models before mapping fields or adding endpoints.

## Offer

Represent PWA as an optional capability (suggested key pwa), independently of plan
names. Only an operator-approved mapping grants it through a plan or add-on. Do
not assume Basic excludes it or Pro includes it. Price/currency, setup fee, renewal
interval, trial, grace period and refund policy remain commercial decisions.
Base delivery: branded install metadata/icons, installation guidance, public offline
notice, safe updates and tested maintenance/retirement. Push, offline transactions,
app-store listing and native apps require separate scope and implementation.

Browsers may install/create shortcuts without a custom prompt. Hiding a button or
manifest cannot enforce a paywall. Sell the configured service and support; enforce
premium server capabilities on the server. Do not promise revocable installed icons.

## Authority

Keep offer, entitlement and delivery distinct:
- Offer: approved capability, plan/add-on, price and term.
- Entitlement: server-owned project/merchant scope, grant source, subscription,
  effective interval, status and authoritative revision/event identity.
- Delivery: configured/built/deployed/verified capabilities, version and evidence.
  Subscription success does not prove deployment readiness.

CRM is the intended management surface backed by the existing authoritative
subscription service. Only authorized server operations grant/change/revoke access.
Resolve merchant/project from authenticated server context, not client seller IDs.
Frontend flags and generated config are display hints, never payment proof.
Reuse provider verification, exact amount/currency, idempotency and event ordering
from existing payment/subscription modules. Never grant from a checkout return URL.
Use effective cancellation/expiry dates; partial refunds and payment failures do
not automatically revoke everything. Audit overrides without inventing payments.

Provision only with current entitlement or explicit approved provisioning authority.
Enforce premium APIs on every protected request. Public worker/static assets cannot
be trusted entitlement stores. Unknown status must not grant new paid capabilities;
use the agreed outage policy for existing users without deleting data.

## Expiry and renewal

Apply agreed term/grace/cancellation policy. Stop new paid provisioning and premium
server actions when due, preserving separately entitled website access, login,
orders, records and drafts. Do not break the ordinary website or wipe business data
as a billing tactic. Installed clients retain login/renewal information and functions
they remain authorized to use. Retirement is a separately requested scoped lifecycle.
Renewal is idempotent; never recreate a merchant/database/site to restore capability.
Test real state transitions before claiming automated paid activation is delivered.
