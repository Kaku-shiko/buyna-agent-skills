# Website Skill Routing Map

Use only the current gate or approved interaction slice.

The core route policy is defined in `../SKILL.md` and uses capability-driven flow control.  
Route only the current gate by default, but do not force linear completion when capability can skip it.  
Design and page structure share one approval. Gate 4 selects existing-resource, merchant-file, product/service, and frontend-integration Skills for one slice.  
Gates 4 and 5 may be `NOT_APPLICABLE` only when the intake capability record permits it.

Do not call every Skill. Code phases require real files, applicable verification, a delivery record, and explicit later approval.

The merchant file module belongs only to Phase 5: create a new local merchant
layout through `buyna-merchant-onboarding`; route approved file/image actions to
`buyna-s3-storage`. Phase 4 must not provision storage or persistence.
