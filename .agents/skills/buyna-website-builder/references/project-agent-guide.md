# Project AGENTS.md generation

Create or refresh the project-root `AGENTS.md` after recording the website task,
after an approved scope change, and at phase handoff. Use the managed generator;
preserve all existing project instructions outside its markers. Do not install
or synchronize unrelated projects or user Skills as part of generation.

## Task schema

Required: `projectId` (letters, digits, underscore, hyphen), `objective`.
Optional `siteType`: `content`, `commerce`, `service`, or `mixed`. This is
descriptive intent only; intake must confirm and persist the actual capabilities.
Never infer payment, cart, inventory, coupons, or notifications from this hint.
Optional `sopIds`: a non-empty array of unique SOP IDs from `sop/manifest.json`.
Choose only the applicable process (`merchant-onboarding`, `website-delivery`,
`commerce-payment-refund`, `service-booking`, `change-and-maintenance`,
`incident-and-recovery`). The default is `website-delivery`; this selection is
instruction context, never a capability approval or workflow transition.
Optional arrays of strings: `deliverables`, `constraints`, `acceptance`,
`recordPaths` (references to inspect, never authorization). Unknown fields fail.
Record only the user's actual scope; omit unresolved details rather than inventing
them. Never include credentials, secrets, personal data, or approval flags.

```json
{
  "projectId": "example_shop",
  "siteType": "commerce",
  "objective": "创建中文商品网站，支持商品与分类管理",
  "deliverables": ["商品列表与详情", "分类创建与编辑"],
  "constraints": ["先完成本地验收"],
  "acceptance": ["图片保存后刷新仍可见", "商品删除使用删除功能"],
  "recordPaths": ["docs/website-handoff.md"]
}
```

## Booking/service example

```json
{
  "projectId": "example_booking",
  "siteType": "service",
  "objective": "创建预约服务网站，先支持到店付款",
  "deliverables": ["服务项目展示", "可预约时段", "预约记录管理"],
  "constraints": ["不启用在线支付", "人员安排、名额、取消和改期规则待确认"],
  "acceptance": ["不可用时段不能预约", "确认并发预约不会超过名额"],
  "recordPaths": ["docs/website-handoff.md"]
}
```

Use `mixed` only when the user needs both product commerce and booking services;
confirm each capability independently. Existing routing already selects
`buyai-booking-service-backend` when verified `requiresBooking` is true. Follow
its current contracts and implement project-specific scheduling adapters as needed;
do not claim that a dedicated scheduling core exists without checking the manifest.
For a new future business type, extend the capability schema, router and tests
before using it. Keep AGENTS generation independent of those business algorithms.

## Bootstrap

Run the script from the resolved Builder Skill directory; `project-root` must
already exist. This generates instructions only, without creating workflow
approval or assuming which later Skills/modules apply.

```powershell
node scripts/project-agent-guide.mjs --project-root "C:/projects/example_shop" --task "C:/projects/example_shop/task.json"
```

## Refresh from the real route

In the existing trusted workflow host, import `writeProjectAgentGuide` from
`scripts/project-agent-guide.mjs`. Pass the freshly loaded verified state and
the same route request used by Builder (without a second workflowState field):

```js
const workflowState = await store.loadVerifiedWorkflow();
writeProjectAgentGuide({ projectRoot, task, workflowState, routeRequest });
```

Use the actual store return contract to obtain its trusted state; never parse a
JSON copy or fabricate prior history. The generator calls `planWebsiteRoute`
internally and records only its advisory action, gate, reason, Skills and modules.
Every new execution must reload and reroute. A blocked snapshot is not permission
to execute listed work. CLI deliberately accepts task data only.

Existing managed content can be regenerated for the same project. Malformed or
duplicate markers, another project's block, symbolic-link targets, or concurrent
generator writes fail without replacing the instructions. Resolve those actual
conflicts before retrying; do not delete the existing AGENTS.md. Keep task files
and guide updates under the project's normal version-control review.

## SOP installation and task pinning

The repository installer includes SOP rules for both normal and `-SkillsOnly`
installation. Project rules live at `.agents/buyna/sop/<content-sha256>/` and user
rules at `~/.codex/buyna/sop/<content-sha256>/`. The namespaced
`sop-installation.json` points to the most recently installed snapshot; old
snapshots are retained for active tasks. Node.js is required by the installer.

When generating a project guide from user Skills or repository sources, the
generator copies the verified SOP snapshot into the project's namespace. It
records version, content digest, optional verified source commit, selected SOPs,
and portable local links in the managed block. Shared index, execution contract,
and AI interface rules are always included. No running stage or authorization is
created. In source worktrees without verified source metadata, the guide says
that the source commit is unverified and pins the actual content digest.

Existing guides keep their snapshot even after reinstalling newer Skills/SOPs.
Missing snapshots or integrity mismatches fail; do not silently substitute newer
rules. After reviewing compatibility for an explicitly requested rule update,
call `writeProjectAgentGuide({ projectRoot, task, refreshSopPin: true })` to select
the latest project-installed SOP. The normal CLI intentionally preserves pins.
Changing `task.sopIds` selects a different SOP within the pinned version.

Snapshot documents retain their canonical text and hashes. Repository-relative
links to `skills/`, `packages/` or the repository manifest must be resolved through
the installed namespaced manifest and actual Skill/module roots, not relative to
the immutable SOP snapshot. These hashes detect mismatched files; they are not
signatures, authorization proofs, or a substitute for trusted workflow storage.
