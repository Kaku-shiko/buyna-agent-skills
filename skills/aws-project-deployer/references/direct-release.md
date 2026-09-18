# Direct release of an existing project

This route is for a user-authorized release performed directly through the
operator's AWS CLI session on a registered, existing project. It does not
activate or authorize Builder/Workflow automation. Select the route from the
actual execution context before checking signing configuration; never select it
as a fallback after a platform authority, signature, or approval check fails.

## Required evidence for this release

1. Load the project's resource record and existing release procedure. Inspect
   the actual commands, not just the procedure's name. Confirm the requested
   change, registered account/region/resource identifiers and zero-create policy.
2. Use the existing AWS profile to query current caller identity and the exact
   registered resources. Reconcile account, region, target, ownership, DNS and
   routing with the record. Historical audit notes are pointers, not current proof.
3. Inspect the affected runtime through the existing management channel without
   printing secrets: service, active release directory, assigned port/socket,
   host route, environment source path and log path. Stop on conflicting ownership
   or unavailable required evidence. For static/serverless targets inspect their
   corresponding bucket/distribution/function/API identities and routes.
4. Verify the artifact and relevant tests, tenant isolation, exact write scope
   and a usable rollback artifact/version/path. Review any migration separately.
   Do not run an old deployment script unchanged if it creates infrastructure,
   deletes unrelated objects or expands the authorized scope.
5. Save a secret-free release record with command outcomes, observation time,
   resource/artifact/plan digests, target identifiers, approval context and
   rollback location in the project's protected execution storage. Label it
   `executionMode: direct_operator` and `evidenceScope: current_release_only`.
   An AI-authored record is an audit record, not an independent authority.
6. Perform only the authorized update. Verify HTTPS, primary route, affected
   API/service, logs and rollback readiness. Report prepared, deployed and
   live-verified states accurately.

## Boundaries

This route does not require `BUYNA_DEPLOYMENT_INSPECTION_PUBLIC_KEY_FILE` or
write a `projectDeploymentBaseline`. Do not stamp unsigned evidence as a
confirmed baseline, self-sign an inspection receipt, reuse this release record
as trusted cross-task evidence, or feed it into platform gates. A later direct
release repeats the necessary live checks unless a valid signed baseline is
available. Do not delete an existing baseline or suppress its validation errors;
investigate identity mismatches and suspected tampering before any mutation.

A project that explicitly uses a signed inspection service still requires its
pinned inspection authority and signed baseline. Preserve any actual runtime
Workflow signature checks and release/traffic approval provenance. The mere use
of Builder or AWS does not imply adoption of a signed inspection service. Missing platform
configuration must report the exact missing dependency and its operator-owned
provisioning step; it cannot be solved by changing execution mode, asking for
the same approval again, or running a legacy script.
