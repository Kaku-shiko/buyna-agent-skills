import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSopBundle, loadSopBundle, resolveSopContext } from './sop-context.mjs';
import { writeProjectAgentGuide } from './project-agent-guide.mjs';
const source = fileURLToPath(new URL('../../../sop', import.meta.url));
function fixture(t) { const root = mkdtempSync(join(tmpdir(), 'buyna-sop-')); t.after(() => rmSync(root, { recursive: true, force: true })); return root; }
test('installs a verified immutable snapshot and rejects tampering', t => {
  const root = fixture(t);
  const receipt = installSopBundle({ sourceRoot: source, destinationRoot: root, sourceRevision: 'a'.repeat(40) });
  assert.equal(receipt.version, '1.0.0');
  assert.match(receipt.digest, /^[a-f0-9]{64}$/);
  const bundle = loadSopBundle(join(root, 'sop', receipt.digest));
  assert.equal(bundle.digest, receipt.digest);
  assert.equal(installSopBundle({ sourceRoot: source, destinationRoot: root }).digest, receipt.digest);
  writeFileSync(join(root, 'sop', receipt.digest, 'website-delivery.md'), 'tampered');
  assert.throws(() => resolveSopContext({ installationRoot: root }), /SOP_INTEGRITY_MISMATCH/);
});
test('task guide pins selected SOPs and retains its snapshot after upgrade', t => {
  const projectRoot = fixture(t);
  const task = { projectId: 'sample', objective: 'repair existing site', sopIds: ['change-and-maintenance'] };
  const result = writeProjectAgentGuide({ projectRoot, task });
  const original = readFileSync(result.path, 'utf8');
  assert.match(original, /change-and-maintenance.md/);
  assert.match(original, /buyna:sop-pin:/);
  assert.match(original, /ai-context-and-interfaces.md/);
  assert.match(original, /SOP.*不.*授权/);
  const alternate = join(fixture(t), 'sop'); cpSync(source, alternate, { recursive: true });
  writeFileSync(join(alternate, 'website-delivery.md'), readFileSync(join(alternate, 'website-delivery.md'), 'utf8') + '\nChanged later.\n');
  installSopBundle({ sourceRoot: alternate, destinationRoot: join(projectRoot, '.agents', 'buyna') });
  assert.equal(writeProjectAgentGuide({ projectRoot, task }).changed, false);
  assert.equal(readFileSync(result.path, 'utf8'), original);
  assert.equal(writeProjectAgentGuide({ projectRoot, task, refreshSopPin: true }).changed, true);
  assert.notEqual(readFileSync(result.path, 'utf8'), original);
});
test('unknown and path traversal SOP IDs are rejected before modifying AGENTS', t => {
  const projectRoot = fixture(t);
  for (const sopIds of [['../../evil'], ['made-up'], []]) {
    assert.throws(() => writeProjectAgentGuide({ projectRoot, task: { projectId: 'sample', objective: 'test', sopIds } }), /SOP_SELECTION_INVALID/);
  }
});
