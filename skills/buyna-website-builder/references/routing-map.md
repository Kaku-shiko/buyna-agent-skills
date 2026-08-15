# Website Skill Routing Map

Use only the current gate or approved interaction slice.

The authoritative eight-phase order is defined in `../SKILL.md`. Route only the current gate. Treat Phases 2 and 3 as one continuous design-and-structure gate with one approval after Phase 3. Phase 5 selects existing-resource, merchant-file, product/service, and frontend-integration Skills for one slice. Phase 6 may be `NOT_APPLICABLE`.

Do not call every Skill. Code phases require real files, applicable verification, a delivery record, and explicit later approval.

The merchant file module belongs only to Phase 5: create a new local merchant
layout through `buyna-merchant-onboarding`; route approved file/image actions to
`buyna-s3-storage`. Phase 4 must not provision storage or persistence.
