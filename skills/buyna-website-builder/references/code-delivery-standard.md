# Code Delivery Standard

Apply this standard to Phases 4-11. Phases 1-3 produce approved requirement,
design, and structure records; do not invent code during those phases.

## Required Delivery Record

Before completing a phase, record:

1. `DELIVERED_FILES`: created or modified project-relative file paths;
2. `IMPLEMENTED_SCOPE`: only the functions completed in the current phase;
3. `VERIFICATION`: commands or direct checks run and their results;
4. `NOT_CONNECTED`: mock, deferred, or intentionally unconnected behavior;
5. `PHASE_RESULT`: `PASS` only when the phase gate is satisfied.

Use `NOT_APPLICABLE` with a reason when a phase legitimately requires no new
file. A description, plan, prompt, screenshot, design image, or code shown only
in chat is not a code delivery.

## Sequential Gate

- Inspect the prior phase's approved delivery record before changing files.
- Write code only for the current approved phase.
- Save changes in the real project and preserve approved existing code.
- Run checks appropriate to the changed files.
- Do not claim completion when required files are absent or checks have not run.
- Stop for user review after reporting the delivery record.
- Do not enter the next phase until the user explicitly approves the current
  phase in a later message.

Do not require a Git commit or push as evidence unless the user explicitly asks
for Git work. File paths and verification results are the default evidence.
