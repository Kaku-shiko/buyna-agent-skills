# Dashboard Data Interaction

Start only after the Dashboard UI source, mock interactions, API contract,
frontend checks, and user approval are complete.

## Development Sequence

1. Lock approved routes, fields, actions, states, and the API contract.
2. Establish the executable server/API boundary and environment configuration.
   In the same Phase 5 slice, deliver frontend types/contracts, an API
   client/repository adapter boundary, endpoint configuration, and
   loading/error wiring while retaining mock business data.
3. Implement merchant login, session, authorization, and ownership.
4. Implement AWS database schemas and reversible migrations.
5. When the approved UI contains image/file actions, call `buyna-s3-storage`
   and use `packages/buyna-merchant-file-core`. Do not hand-write merchant
   directory keys, replacement ordering, deletion, or orphan cleanup.
6. Implement real APIs and business rules for the current Dashboard slice.
   The `支付/订阅设置` slice combines two visually separate cards: unchanged
   GlobePay safe configuration and the current merchant's Buyna.ai subscription
   summary. Fetch subscription data server-to-server and return only plan,
   status, start date, and bound domain. The merchant backend must take its
   `project_id` and `seller_id` from server configuration plus the authenticated
   session, never from a browser query parameter. Register each new seller in
   the CRM subscription-read allowlist during merchant onboarding.
7. Replace its mock adapter without redesigning the page.
8. Verify loading, empty, validation, success, error, permission, refresh, and
   persistence behavior.
9. Verify approved merchant changes on the public website when required.

## Required Boundaries

- Keep business rules and credentials on the server.
- Use the approved AWS database for structured data and S3 for files.
- Do not introduce Supabase, Lovable, platform administration, merchant
  switching, or multi-merchant behavior.
- Do not replace mock adapters until endpoints and error behavior pass.
- Do not silently change approved Dashboard UI.
- Do not mark payment paid from the browser or redirect alone.
- Do not expose CRM credentials, other merchants, GMV, or subscription write
  controls in a merchant Dashboard.
- Do not use MEDINANCE or any other case project as a default identity. Case
  projects are fixtures only; the same contract must work for every onboarded
  merchant.

## Delivery Record

For each completed slice, report:

- frontend adapter files changed;
- backend endpoint/service files changed;
- schema/migration or S3 files changed;
- tests and commands run;
- persistence and refresh evidence;
- remaining mock or unconnected behavior.

Phase 5 cannot pass without changed frontend source paths and passing frontend
build/type checks.

Stop for approval before starting the next slice.
