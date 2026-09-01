# Skill writing standard

## Purpose

Write each Skill so a fresh Codex instance can decide when to use it, execute a stable workflow, preserve boundaries, and verify completion without relying on prior chat context.

## Required structure

```text
skill-name/
├── SKILL.md
├── agents/openai.yaml
└── references/  # only when needed
```

Use lowercase hyphenated names. Match the folder name and frontmatter `name`.

## Frontmatter

Keep only `name` and `description`. Make the description state both capability and trigger conditions because it drives discovery.

## Body

Use imperative language. Prefer:

1. A one-sentence objective.
2. `First Move` for required inspection.
3. `Workflow` or `Route To` for execution.
4. `Boundaries` for ownership.
5. `Validate` for observable completion.

Explain why a rule matters when that helps Codex generalize. Avoid excessive all-caps commands and generic programming explanations.

## Progressive disclosure

Keep the core workflow in `SKILL.md`; place detailed schemas, rules, and variants in directly linked `references/`. Create deterministic scripts only for repeated or fragile operations. Avoid deep reference chains.

## Context and routing

Give one Skill one responsibility. Route to other Skills instead of copying their rules. Pass only approved outputs needed by the next Skill. Keep customer-specific names, prices, domains, and environment values in project records.

## Mandatory scope control

Every workflow or coordinator Skill must explicitly require:

- execute all connected steps explicitly included in the user's current request
  or approved bounded work package;
- do not add or recommend unrequested functionality;
- use the minimum Skill and tool set needed for that authorized scope;
- continue automatically through unchanged, already approved steps and reuse
  their evidence instead of asking again;
- stop only at a real user decision, authority or scope expansion, external
  production mutation not already approved, or an immediate security,
  data-loss, payment, or execution blocker;
- report only the minimum action required to resolve a stop.

Capability lists describe what a Skill can do. They are not permission to add
unrequested work. The current request and bounded work package are the
authorization; do not turn remaining possibilities into suggestions.

## Test before review

Test realistic should-trigger and should-not-trigger prompts, a normal workflow, and a missing-input or failure case. Validate installation in a clean destination and confirm the Skill is discoverable in a new Codex task.

