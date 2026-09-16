# Merchant access core

Fixed merchant profile, channel activation and subscription view rules. `src/index.mjs` is framework-neutral. CRM remains the source of platform subscription data; this module never changes provider agreements, verifies a payment, or stores credentials.

## CRM adapter

`adapters/crm/` contains the deployed integration source for the existing Buyna CRM TanStack application. Copy its folders into `official-frontend/src/` and copy `src/index.mjs` to `src/lib/merchant-access-core.mjs`. Mount `MerchantAccessEditor` in the existing subscription customer detail using the selected CRM customer id. Existing authenticated CRM subscription edits remain the plan authority.

The adapter reuses `CRM_CUSTOMERS_TABLE`. Each access record is bound to one immutable `projectId + ownerActor + customerId`; changes and audit history use one DynamoDB transaction with a revision condition. No database creation or customer migration is needed. New bindings are made by CRM administrators using the project and account identifiers displayed in Builder. Existing subscriptions are read, not copied.

The internal POST endpoint `/api/internal/merchant-access` requires a dedicated `BUILDER_CRM_ACCESS_SECRET`, HMAC SHA256 over `merchant-access-v1\n<timestamp>\n<body>`, and a 60-second timestamp window. Only server-owned Builder identities may be signed. Merchant writes are restricted to profile fields. Optimistic revisions prevent write replay. Never send this key to the browser or commit its value.

Current adapter scope: administrator access configuration, merchant profile edits, plan/status/date reads and capacity display. Credential provisioning, provider verification, recurring agreement changes and storage enforcement remain separate existing adapters. Automatic renewal is metadata and does not authorize a new provider charge.
