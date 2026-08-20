# GitHub contribution and release workflow

## Change a Skill

1. Open a GitHub Issue describing the problem, desired trigger, and expected output.
2. Create branch `agent/<short-description>` or `skill/<short-description>`.
3. Change only the relevant Skill and repository documentation.
4. Run `scripts/validate.ps1`.
5. Inspect the diff for secrets, customer-specific values, duplication, and broken relative links.
6. Open a Pull Request using the repository template.
7. Require review before merging to `main`.

## Create a Skill

Use the official Skill initializer. Name folders with lowercase letters, digits, and hyphens. Include:

```text
skill-name/
├── SKILL.md
├── agents/openai.yaml
└── references/  # only when needed
```

Keep `SKILL.md` concise. Put trigger conditions in the frontmatter description and load detailed references only when needed.

## Review checklist

- The Skill has one clear responsibility.
- Its description explains both capability and trigger conditions.
- Instructions use imperative language.
- Referenced files exist and are one level below SKILL.md.
- No Supabase, Lovable, Django, Refine, AWS, or payment choice is forced unless the Skill owns that decision.
- The Skill executes only the requested step and does not recommend or add
  unrequested functionality.
- Coordinator Skills stop at approval gates and treat capability lists as
  routing information, not authorization to execute every capability.
- No credential or production secret is present.
- Installation and invocation were tested in a clean destination.

## Release

After approved changes merge:

1. Create a semantic tag such as `v0.1.0`.
2. Publish a GitHub Release summarizing added, changed, and removed Skills.
3. Tell teammates to pull and reinstall with `-Force`.
4. Keep breaking trigger or folder-name changes for a major version.

