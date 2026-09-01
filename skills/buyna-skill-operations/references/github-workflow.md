# GitHub contribution and release workflow

## Change a Skill

1. Fetch cloud `main` and create a branch from `origin/main`.
2. Change only the relevant Skill, fixed Module contract, tests, and directly
   affected repository documentation.
3. Run focused tests, `scripts/validate.ps1`, and the official Skill validator.
4. Inspect the diff for secrets, customer-specific values, duplication, and broken relative links.
5. Open a Pull Request and require its cloud checks before merging to `main`.

An Issue is optional for a normal bounded fix. Use one when the problem needs
team discussion, spans multiple releases, or should remain independently
tracked after the Pull Request.

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

For a versioned or breaking Skill release after approved changes merge:

1. Create a semantic tag such as `v0.1.0`.
2. Publish a GitHub Release summarizing added, changed, and removed Skills.
3. Tell teammates to pull and reinstall with `-Force`.
4. Keep breaking trigger or folder-name changes for a major version.

Routine compatible fixes require the merged Pull Request and passing cloud
checks; they do not require a tag or GitHub Release.

