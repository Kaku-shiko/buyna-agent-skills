import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('team writing standard continues an approved request instead of pausing after every step', () => {
  const standard = read('skills/buyna-skill-operations/references/writing-standard.md');
  assert.doesNotMatch(standard, /require a later explicit instruction before continuing/i);
  assert.doesNotMatch(standard, /stop after the requested step is validated and reported/i);
  assert.match(standard, /continue[^]*(?:current request|approved work package|authorized scope)/i);
  assert.match(standard, /stop only[^]*(?:decision|authority|scope|blocker)/i);
});

test('normal Skill changes do not require an Issue, tag, or GitHub Release', () => {
  const workflow = read('skills/buyna-skill-operations/references/github-workflow.md');
  assert.match(workflow, /Issue[^]*(?:optional|when needed)/i);
  assert.match(workflow, /tag[^]*(?:versioned|breaking|release)/i);
  assert.doesNotMatch(workflow, /1\. Open a GitHub Issue/);
});

test('onboarding groups read-only work and uses one write approval instead of per-step pauses', () => {
  const onboarding = read('skills/buyna-merchant-onboarding/SKILL.md');
  const registry = read('skills/buyna-project-resource-registry/SKILL.md');
  assert.doesNotMatch(onboarding, /Complete exactly one numbered step[^]*stop[^]*explicit approval/i);
  assert.match(onboarding, /read-only[^]*(?:continue automatically|without confirmation)/i);
  assert.match(onboarding, /one (?:grouped )?(?:write|mutation) approval/i);
  assert.match(registry, /same request[^]*(?:continue|next action)/i);
});

test('all commerce children reuse the Builder receipt and unchanged package test evidence', () => {
  const paths = [
    'skills/buyai-coupon-commerce/SKILL.md',
    'skills/buyai-checkout-address-ux/SKILL.md',
    'skills/buyai-globepay-payment/SKILL.md',
    'skills/buyai-globepay-status-sync/SKILL.md',
    'skills/buyna-gmv-commerce/SKILL.md',
  ];
  for (const path of paths) {
    const skill = read(path);
    assert.match(skill, /executionCheckReceipt/, path);
    assert.match(skill, /package source digest/i, path);
    assert.match(skill, /do not (?:rerun|repeat)|reuse/i, path);
    assert.match(skill, /standalone/i, path);
  }
});

test('release chain reuses static evidence while identity ownership and health stay fresh', () => {
  const paths = [
    'skills/buyna-aws-release/SKILL.md',
    'skills/aws-project-deployer/SKILL.md',
    'skills/buyna-aws-data-layer/SKILL.md',
    'skills/buyna-testing-quality/SKILL.md',
  ];
  const content = paths.map(read).join('\n');
  for (const path of paths) assert.match(read(path), /releaseCheckReceipt/, path);
  for (const field of ['resourceRecordDigest', 'artifactDigest', 'releasePlanDigest']) assert.match(content, new RegExp(field));
  assert.match(content, /STS[^]*(?:fresh|every release)|(?:fresh|every release)[^]*STS/i);
  assert.match(content, /ownership[^]*(?:fresh|every release)|(?:fresh|every release)[^]*ownership/i);
  assert.match(content, /post-deploy[^]*health|health[^]*post-deploy/i);
});

test('generic Skill guidance contains no bare IPv4 or project-specific merchant host', () => {
  const docs = [
    'skills/buyna-aws-data-layer/SKILL.md',
    'skills/aws-project-deployer/SKILL.md',
    'skills/buyna-aws-release/SKILL.md',
    'skills/buyna-merchant-onboarding/SKILL.md',
  ].map(read).join('\n');
  assert.doesNotMatch(docs, /\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  assert.doesNotMatch(docs, /\b(?!admin\.)[a-z0-9-]+\.buyna\.(?:ai|jp)\b/i);
});

test('cloud manifest can prune only declared obsolete Buyna Skills in Skills-only mode', () => {
  const manifest = JSON.parse(read('repository-manifest.json'));
  assert.deepEqual([...manifest.obsoleteSkills].sort(), [
    'buyai-coupon-mobile-wechat',
    'buyai-lovable-project-builder',
    'buyna-project-framework',
    'medinance-commerce-operations',
  ]);

  const project = mkdtempSync(join(tmpdir(), 'buyna-skill-cleanup-'));
  try {
    const skillRoot = join(project, '.agents', 'skills');
    const packageRoot = join(project, 'packages');
    for (const name of [...manifest.obsoleteSkills, 'personal-skill']) {
      mkdirSync(join(skillRoot, name), { recursive: true });
      writeFileSync(join(skillRoot, name, 'SKILL.md'), name);
    }
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(join(packageRoot, 'keep.txt'), 'unchanged');
    mkdirSync(join(packageRoot, 'buyna-gmv-core'), { recursive: true });
    const installedPackage = join(packageRoot, 'buyna-gmv-core', 'package.json');
    writeFileSync(installedPackage, '{"name":"@installed/gmv-core","version":"legacy-local"}');
    const installedPackageBefore = readFileSync(installedPackage, 'utf8');
    const run = spawnSync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      fileURLToPath(new URL('../scripts/install.ps1', import.meta.url)),
      '-Scope', 'Project', '-ProjectPath', project, '-SkillsOnly', '-Force',
    ], { encoding: 'utf8' });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    for (const name of manifest.obsoleteSkills) {
      assert.equal(existsSync(join(skillRoot, name)), false, name);
    }
    assert.equal(readFileSync(join(skillRoot, 'personal-skill', 'SKILL.md'), 'utf8'), 'personal-skill');
    assert.equal(readFileSync(join(packageRoot, 'keep.txt'), 'utf8'), 'unchanged');
    assert.equal(readFileSync(installedPackage, 'utf8'), installedPackageBefore);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
