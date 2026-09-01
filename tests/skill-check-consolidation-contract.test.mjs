import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const builder = read('skills/buyna-website-builder/SKILL.md');
const policy = read('skills/buyna-website-builder/references/execution-check-policy.md');
const childPaths = [
  'skills/buyai-merchant-builder/SKILL.md',
  'skills/buyai-product-merchant-backend/SKILL.md',
  'skills/buyai-booking-service-backend/SKILL.md',
  'skills/buyai-dashboard-data-interaction/SKILL.md',
  'skills/buyna-aws-data-layer/SKILL.md',
  'skills/buyna-s3-storage/SKILL.md',
];
const children = childPaths.map(read);

test('Builder owns one reusable execution check receipt for an approved slice', () => {
  assert.match(builder, /executionCheckReceipt/);
  assert.match(builder, /execution-check-policy\.md/);
  assert.match(policy, /frontendContractDigest/);
  assert.match(policy, /manifestDigest/);
  assert.match(policy, /resourceEvidenceDigest/);
  assert.match(policy, /testEvidence/);
  assert.match(policy, /scope expansion|范围扩大/i);
});

test('Builder-invoked child Skills reuse evidence instead of rerunning static gates', () => {
  for (let index = 0; index < children.length; index += 1) {
    const skill = children[index];
    assert.match(skill, /executionCheckReceipt/, childPaths[index]);
    assert.match(skill, /do not (?:rerun|repeat)|不得重复|不再重复/i, childPaths[index]);
    assert.match(skill, /standalone/i, childPaths[index]);
  }

  const product = children[1];
  const booking = children[2];
  assert.doesNotMatch(product, /Read the approved Phase 4 frontend code completion record/);
  assert.doesNotMatch(booking, /Read the approved Phase 4 frontend code completion record/);
});

test('only five immediate blocker classes remain in the shared policy', () => {
  for (const code of [
    'SECRET_EXPOSURE',
    'TENANT_WRITE_ISOLATION',
    'UNREGISTERED_OR_NEW_COST_TARGET',
    'DESTRUCTIVE_CHANGE_WITHOUT_ROLLBACK',
    'UNVERIFIED_PAYMENT_LIVE_CLAIM',
  ]) assert.match(policy, new RegExp(code));

  assert.match(policy, /all other checks[^]*DEFERRED/i);
  assert.match(policy, /check is not a confirmation/i);
});

test('runtime and changed-artifact checks remain fresh while unchanged evidence is reused', () => {
  assert.match(policy, /every protected request[^]*auth[^]*merchant context/i);
  assert.match(policy, /changed migration[^]*validate/i);
  assert.match(policy, /unchanged[^]*(?:reuse|reused)/i);
  assert.match(policy, /package source digest/i);
});

test('canonical Builder installation copy contains the same policy', () => {
  assert.equal(
    read('skills/buyna-website-builder/references/execution-check-policy.md'),
    read('.agents/skills/buyna-website-builder/references/execution-check-policy.md'),
  );
});
