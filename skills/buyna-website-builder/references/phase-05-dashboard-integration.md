# Phase 5: Dashboard Functional Integration

Require the approved Phase 4 code record and API contract. Use `buyai-dashboard-data-interaction` to complete one page or related slice at a time: executable API foundation, merchant identity, Existing Resource Gate, database/S3 when needed, domain endpoint/service, mock-adapter replacement, and persistence/error/public-site verification.

When the current slice creates a new merchant project directory, route its file
layout to `buyna-merchant-onboarding`, which must call
`packages/buyna-merchant-file-core` `scaffoldMerchantProject` after preflight.
When the current slice uploads, replaces, deletes, or cleans images/files, route
to `buyna-s3-storage`, which must call the same package's fixed lifecycle service.
Never regenerate the layout for an existing project.

Save frontend and backend code and tests. Stop for approval before the next
slice. Complete the phase only when all approved Dashboard slices have no
unexplained mock business actions.
