import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const quality = read('skills/buyna-testing-quality/SKILL.md');
const release = read('skills/buyna-aws-release/SKILL.md');
const phase = read('skills/buyna-website-builder/references/phase-07-testing.md');
const thresholds = read('skills/buyna-website-builder/references/elastic-thresholds.md');
const workflow = read('skills/buyna-website-builder/references/workflow-state-contract.md');
const readme = read('README.md');
const validationWorkflow = read('.github/workflows/validate-skills.yml');

test('normal releases default to a small fast-release gate', () => {
  for (const contract of [quality, release, phase, thresholds]) {
    assert.match(contract, /FAST_RELEASE/);
    assert.match(contract, /FULL_VERIFICATION/);
  }

  assert.match(quality, /FAST_RELEASE[^]*default/i);
  assert.match(release, /deploy[^]*minimum[^]*verif/i);
  assert.match(phase, /优先上线|上线优先/);
  assert.match(readme, /快速发布检查/);
});

test('fast release keeps only essential safety and operability checks', () => {
  const contract = `${quality}\n${release}\n${phase}`;
  for (const required of [
    /secret/i,
    /registered target|verified target/i,
    /health/i,
    /rollback/i,
    /tenant isolation|租户隔离/i,
    /runtime artifact|运行产物/i,
  ]) assert.match(contract, required);

  assert.match(quality, /package size[^]*FULL_VERIFICATION|FULL_VERIFICATION[^]*package size/i);
  assert.match(quality, /duplicate assets[^]*FULL_VERIFICATION|FULL_VERIFICATION[^]*duplicate assets/i);
  assert.doesNotMatch(release, /Stop the release when the pre-upload package gate is missing or failed/i);
});

test('manual payment verification does not block the website release or become a false live claim', () => {
  const contract = `${quality}\n${release}\n${phase}\n${thresholds}`;
  assert.match(contract, /PAYMENT_VERIFICATION:\s*USER_OWNED_PENDING/);
  assert.match(contract, /does not block|不阻断/i);
  assert.match(contract, /must not.*payment.*live|不得.*支付.*上线|不能.*支付.*上线/is);
});

test('full verification is opt-in while the canonical gate id remains compatible', () => {
  const contract = `${quality}\n${release}\n${phase}\n${thresholds}`;
  assert.match(contract, /explicitly requests|明确要求|要完整验证/i);
  assert.match(workflow, /`testing_upload_gate` \| FAST_RELEASE essential checks PASS/);
  assert.match(read('repository-manifest.json'), /"testing_upload_gate"/);
});

test('repository CI runs declared package tests and keeps root contract coverage', () => {
  assert.match(validationWorkflow, /scripts\.test/);
  assert.match(validationWorkflow, /node --test tests/);
  assert.doesNotMatch(validationWorkflow, /Get-ChildItem packages -Directory \| ForEach-Object \{\s*npm test/s);
});
