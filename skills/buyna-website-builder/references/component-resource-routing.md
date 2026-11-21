# Component and design resource routing

This contract belongs to the existing website-builder entrypoint, not a separate
Agent or a second approval workflow. Read it when the router returns `resourceRoute`.
Only `action=execute` activates its steps. Never advance a workflow gate from a
resource lookup, installation, connection test or generated preview alone.

## Fixed trigger points

| Gate / owner | Required action | Output |
| --- | --- | --- |
| design_and_structure / buyna-website-design | Reuse intake, brand assets and locked design. For a new visual direction, evaluate the approved Hallmark design adapter; reuse established design for ordinary repairs. | Theme tokens, design decisions and asset references |
| design_and_structure / buyna-page-structure | Map the design to registered sections; preserve required and conditional commerce regions, stable IDs and configurable quantities. | Section configuration and editable fields |
| frontend_code / buyna-frontend-builder | Resolve project components first, then approved versioned registry items. Inspect dependencies, license, stack and actual build capability before installation. | Component/version lock, data bindings, revision-aware edits and preview |
| dashboard_integration / buyai-dashboard-data-interaction | Reuse dashboard core/headless behavior and project theme; bind selected presentation to existing authenticated APIs. | Working read/write/error states without replacing business cores |
| testing_upload_gate / buyna-testing-quality | Verify changed interactions, keyboard focus, responsive layout and persisted fields. Add applicable visual checks without duplicating previous evidence. | Actual checks, failures and explicitly unexecuted checks |

## Resource selection

Before section selection or component resolution, read [UI terminology](ui-terminology.md).
Preserve the original request, normalize the interaction meaning, then resolve the
actual installed framework component. Keep customer-facing labels natural.

Prefer existing project components. For a compatible React project with no selected
library, evaluate shadcn/ui as the default candidate; use TanStack Table when the
screen needs substantial table behavior and no equivalent exists. Preserve a
project already using another library. Magic UI is optional for a requested brand
effect. Do not install Mantine, Refine, React-admin, Puck, Open SaaS or a replacement
application framework merely because this route is active. Those remain explicit
architecture choices. Preserve Buyna order, inventory, payment, refund, booking,
identity and file-storage contracts; component examples are not business truth.

Record each selected resource's ID, exact version/commit, source, license reference,
stack compatibility, dependencies, editable schema, project scope and validation
evidence in the protected project execution record. Reference it from the project
AGENTS handoff. Never represent a candidate as installed or tested.

## Hallmark adapter boundary

Upstream candidate: https://github.com/Nutlope/hallmark . Pin and inspect the exact
release before use. This route does not install it or claim it is available.
Use its design guidance under buyna-website-design and its relevant checks under
buyna-testing-quality. Do not run its whole build workflow during the design-only
gate. Reuse intake rather than interviewing twice. Existing-site redesign requires
an explicit redesign request; ordinary content, price, payment and bug fixes retain
the approved design. Do not randomly redraw a theme on resume or retry.

An approved project design and required commerce sections take precedence over
upstream aesthetic preferences. Do not invent products, prices, stock, testimonials
or payment readiness. Keep photos' individual license and attribution records;
store approved assets through the project's existing storage adapter. Retain the
public-copy rule against unsolicited AI marketing. Do not automatically introduce
Together credentials, generation costs, hooks or subagents through this adapter.
If Hallmark is absent, use the current design skill and record that Hallmark was
not run; absence of an optional design resource does not block unrelated work.

## Runtime and MCP capability checks

Check actual exposed tools, credentials and supported transport. `tools/list` is
discovery, not execution. A local stdio MCP cannot be entered as a remote HTTPS
connection. Search/docs retrieval and installing code are separate capabilities.
Run installation/build only in the approved project workspace with pinned
dependencies and applicable execution authorization. Never enable broad shell
access or bypass an executor boundary to satisfy this route.

An HTML-only preview cannot execute imported React components. Keep the HTML path
for such projects and explicitly report the missing React build adapter when the
requested deliverable requires it. Do not substitute a look-alike HTML mock and
claim the actual component was integrated. Missing required tools block only the
dependent operation and return the precise missing adapter or credential reference.

AI and visual edits must use the same current page revision and stable section IDs.
Apply bounded field/section changes, reject stale saves and retain the last valid
preview. Changing a resource version affects new selections, not every existing
merchant site. Public release remains the existing release gate.

For cloud execution, follow [knowledge and tool boundaries](cloud-knowledge-tools.md).
