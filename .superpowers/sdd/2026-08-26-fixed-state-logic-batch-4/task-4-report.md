## BASELINE_SCENARIOS

Fresh baseline: `aa67c13`, clean worktree, 2026-08-26.

| Input | Observed route | Expected route | Mismatch |
|---|---|---|---|
| Dashboard overview (`dashboard`) | Existing Dashboard/auth/context/catalog/inventory modules | Add `buyna-commerce-read-model-core` exactly once | Read-model module missing; metrics would remain project-regenerated |
| Inventory low-stock (`inventory`) | Existing inventory/Dashboard/auth/context modules | Existing inventory path only | No new read/delivery module; correct boundary |
| Product orders (`orders`) | Existing order/product/Dashboard/auth/context modules | Existing order path; delivery only for an approved explicit operation | `notificationOperation` is ignored; delivery module and approval provenance are missing |
| Booking records (`bookings`) | Existing Dashboard/auth/context modules under the supplied commerce fixture | Existing booking path; delivery only for approved booking operation | No delivery approval or module selection exists |
| Paid customers (`paid_customers`) | Existing Dashboard/auth/context modules | Existing customer path only | No new read/delivery module; correct boundary |
| Product image-only (`products`) | Existing catalog/inventory/Dashboard/auth/context/file modules | Existing file-capable path only | No new read/delivery module; correct boundary |
| Static/local preview | Frontend plus existing lifecycle modules | No new read/delivery module | Correct boundary; no Git/AWS intent |
| Checkout-only GlobePay repair | Existing checkout/payment route | No new read/delivery module | Correct boundary; payment work remains separate |
| Cross-seller notification repair request | Request field is ignored; ordinary Dashboard route executes | Block unless operation is persisted, slice-matched, and domain-matched | No authoritative notification operation or seller-safe route exists |

The baseline adds no extra confirmation and exposes no fixed UI, Git/AWS intent,
GMV label, provider, or template choice. Its failure is missing fixed read-model
selection and missing provenance-backed notification-operation authorization.

## RED_GREEN_EVIDENCE

- RED routing: 0/8 passed. Failures were the missing overview dependency,
  missing `setApprovedNotificationOperations`, ignored request field, and absent
  stable notification output.
- RED Skill contract: 1/4 passed. Adapter contracts and fixed-state child Skill
  guidance were absent; canonical Builder equality was the only passing check.
- GREEN routing: 8/8 passed.
- GREEN Skill contract: 4/4 passed.
- Workflow state core: 63/63 passed, including verified-store serialization.
- Commerce read model: 26/26 passed. Delivery state: 20/20 passed.
- Repository validation and all six requested Skill validators passed.
- No UI, SQL/ORM implementation, provider selection, live AWS, payment, Git
  publication, or merchant-specific value was introduced.
