# Cloud rules, retrieval and tools

Workflow transitions, required rules, schemas and business validation are deterministic.
Optional search results never replace a required rule or grant execution authority.

Builder publishes skills, SOPs, packages and a generated knowledge-index.json as
one hash-verified release. New tasks resolve the active version once. Automatic
retries and explicit continuation of a failed task retain the recorded version.
Publishing newer rules does not change an in-flight task or its input snapshot.
Never silently substitute the latest release when a recorded version is missing.

Required UI routing and terminology are provided in full by the context loader.
Optional reference retrieval applies selected-skill scope before ranking, uses
keyword and local sparse TF-IDF similarity with bilingual aliases, and records
file hashes, line ranges and the index digest. This is not hosted semantic
embedding search. Explicit metadata filters require matching registered tags.
No customer uploads, credentials or live order data enter the shared index.
No match means no supplementary evidence; do not invent a successful case.

Only tools supplied by the active runtime can be called. The server binds project,
actor, selected skills and release; tool arguments cannot change them. Read-page
and search-reference tools are read-only and have bounded calls and audit records.
External HTTPS MCP requires a verified connection, exact operator-approved tools,
published Skill bindings and matching project scope. The adapter also requires
the tool's read-only declaration and validates arguments against its schema.
Revoked permissions apply immediately, even to a pinned rule version.
Tools/list success is connection evidence, not tools/call success.

Local stdio plugins, OAuth onboarding, arbitrary uploaded scripts and external
write tools are not automatically executable. Component search does not install
React code into an HTML preview. Use a compatible build adapter for installation.
Payment, refunds, inventory, migrations and production publication remain fixed
server API operations with their own authorization, validation and idempotency.

The task detail shows release identity, references and actual tool outcomes.
Never report that a tool ran, a database changed or a site was published merely
because a Skill, package or plugin appears in the task context.
