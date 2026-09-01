import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('one confirmed project deployment baseline is reused across AI tasks and releases', () => {
  const deployer = read('skills/aws-project-deployer/SKILL.md');
  const release = read('skills/buyna-aws-release/SKILL.md');
  const quality = read('skills/buyna-testing-quality/SKILL.md');
  const resource = read('skills/buyna-project-resource-registry/references/resource-contract.md');
  const phase = read('skills/buyna-website-builder/references/phase-08-release.md');
  const dashboardPhase = read('skills/buyna-website-builder/references/phase-05-dashboard-integration.md');
  const builderCopy = read('.agents/skills/buyna-website-builder/references/phase-08-release.md');
  const contract = `${deployer}\n${release}\n${quality}\n${resource}\n${phase}`;

  for (const text of [deployer, release, quality, resource, phase]) {
    assert.match(text, /projectDeploymentBaseline/, 'missing persistent project baseline contract');
  }
  assert.match(contract, /reuse[^]*(?:AI task|later task|subsequent release)/i);
  assert.match(contract, /do not (?:rerun|repeat)[^]*(?:STS|account)[^]*(?:instance|SSM|zero)/i);
  assert.doesNotMatch(contract, /STS[^]*fresh for every release|ownership fresh for every release/i);
  assert.match(contract, /invalidat[^]*(?:resourceRecordDigest|resource record digest)[^]*(?:account|region)[^]*(?:instance_id|target)[^]*architecture/i);
  assert.match(contract, /SSM[^]*(?:execution|connection)[^]*(?:not|does not)[^]*invalidat/i);
  assert.match(contract, /post-deploy[^]*health[^]*(?:each|every|current) release/i);
  assert.match(contract, /before (?:writing|any real write)[^]*(?:runtime-slot|directory)[^]*(?:process|service)[^]*(?:Nginx|host route)/i);
  assert.match(contract, /RUNTIME_SLOT_CONFLICT/);
  assert.match(resource, /inspection receipt[^]*(?:STS account|account)[^]*ownership[^]*runtime/i);
  assert.match(resource, /Ed25519-signed[^]*pinned public key/i);
  assert.match(resource, /recovery journal[^]*(?:restores|rolled back)/i);
  assert.match(resource, /atomically[^]*--require-deployment-baseline/i);
  assert.doesNotMatch(contract, /--account-id/);
  assert.equal(builderCopy, phase);
  assert.match(dashboardPhase, /projectDeploymentBaseline[^]*(?:reuse|do not repeat)/i);
  assert.doesNotMatch(dashboardPhase, /resource evidence and expiry remain valid/i);
});

test('unchanged v41 replacement uses the baseline without another full deployment gate', () => {
  const deployer = read('skills/aws-project-deployer/SKILL.md');
  const release = read('skills/buyna-aws-release/SKILL.md');
  const contract = `${deployer}\n${release}`;

  assert.match(contract, /unchanged[^]*(?:application files|runtime artifact)[^]*(?:reuse|baseline)/i);
  assert.match(contract, /rollback[^]*(?:snapshot|version|path)/i);
  assert.match(contract, /zero-create[^]*(?:policy|counters)[^]*(?:reuse|baseline)/i);
  assert.doesNotMatch(contract, /Every release still performs fresh STS/i);
});
