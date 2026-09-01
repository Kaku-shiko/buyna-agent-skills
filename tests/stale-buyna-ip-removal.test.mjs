import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateResourceRecord } from '../skills/buyna-aws-data-layer/scripts/inspect-existing-resources.mjs';

const root = new URL('../', import.meta.url);
const retiredAddress = ['35', '73', '127', '215'].join('.');

function existingResource(instanceIp) {
  return {
    project: { id: 'shop-a', seller_id: 'seller-a' },
    database: {
      mode: 'existing', engine: 'postgresql',
      instance_identifier: 'shared-prod-postgres', connection_source: 'DATABASE_URL',
      name: 'shared', schema: 'shop_a', allow_create_rds: false,
      allow_create_database: false, allow_create_schema: false,
    },
    storage: {
      mode: 'existing', bucket_source: 'AWS_STORAGE_BUCKET_NAME',
      region: 'ap-northeast-1', prefix: 'projects/shop-a/', allow_create_bucket: false,
    },
    deployment: {
      instance_id: 'i-existing', instance_ip: instanceIp,
      allow_create_instance: false, allow_create_port: false,
    },
    release_limits: { new_ec2_instances: 0, new_databases: 0, new_buckets: 0, new_ports: 0 },
  };
}

test('resource validation accepts a confirmed registered IPv4 without a global hard-coded address', () => {
  assert.equal(validateResourceRecord(existingResource('203.0.113.10')).status, 'pass');
  const invalid = validateResourceRecord(existingResource('not-an-ip'));
  assert.equal(invalid.status, 'blocked');
  assert.ok(invalid.errors.includes('INSTANCE_IP_MISSING_OR_INVALID'));
});

test('current tracked rules and tests contain no retired Buyna instance address', () => {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
  const offenders = [];
  for (const file of files) {
    try {
      if (readFileSync(new URL(file.replaceAll('\\', '/'), root), 'utf8').includes(retiredAddress)) {
        offenders.push(file);
      }
    } catch {
      // Binary or transient test artifact: not an active text rule.
    }
  }
  assert.deepEqual(offenders, []);
});

test('release guidance resolves the shared target from registration and live AWS evidence', () => {
  const files = [
    '../skills/aws-project-deployer/SKILL.md',
    '../skills/aws-project-deployer/references/architecture.md',
    '../skills/buyna-aws-release/SKILL.md',
    '../skills/buyna-website-builder/references/phase-08-release.md',
  ];
  for (const file of files) {
    const content = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(content, /resource record|registered target|registered shared EC2/i);
    assert.match(content, /AWS|live/i);
    assert.doesNotMatch(content, new RegExp(retiredAddress.replaceAll('.', '\\.')));
  }
});

test('resource contract declares instance id stable and IP address mutable', () => {
  const content = readFileSync(new URL(
    '../skills/buyna-project-resource-registry/references/resource-contract.md',
    import.meta.url,
  ), 'utf8');
  assert.match(content, /instance_id.*stable|stable.*instance_id/is);
  assert.match(content, /IP.*mutable|mutable.*IP/is);
});
