import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderProjectAgentGuide, writeProjectAgentGuide } from './project-agent-guide.mjs';
import { createWorkflow } from '../../../packages/buyna-workflow-state-core/src/index.mjs';
import { planWebsiteRoute } from './route-builder.mjs';

const task = { projectId: 'demo', objective: '创建中文商品网站', deliverables: ['商品列表', '分类编辑'], constraints: ['不部署'], acceptance: ['图片保存后刷新可见'] };
function fixture(t) { const root = mkdtempSync(join(tmpdir(), 'buyna-agents-')); t.after(() => rmSync(root, { recursive: true, force: true })); return root; }

test('bootstrap records exact task without inventing a completed route', () => {
  const guide = renderProjectAgentGuide({ task });
  assert.match(guide, /创建中文商品网站/);
  assert.match(guide, /尚未建立已验证的路由/);
  assert.match(guide, /loadVerifiedWorkflow/);
  assert.throws(() => renderProjectAgentGuide({ task: { ...task, approved: true } }), /TASK_SCHEMA_INVALID/);
});
test('snapshot comes from router and rejects forged state and cross-project input', () => {
  const workflowState = createWorkflow({ projectId: 'demo' });
  const routeRequest = { requestedSlice: 'customer_intake', capabilities: { siteType: 'content', requiresDashboard: false, requiresCart: false, requiresCheckout: false, requiresPayment: false, requiresBooking: false } };
  const route = planWebsiteRoute({ workflowState, ...routeRequest });
  const guide = renderProjectAgentGuide({ task, workflowState, routeRequest });
  const snapshot = JSON.parse([...guide.matchAll(/```json\n([\s\S]*?)\n```/g)][1][1]);
  assert.equal(snapshot.action, route.action);
  assert.deepEqual(snapshot.skills, route.skills);
  assert.deepEqual(snapshot.fixedModules, route.fixedModules);
  assert.throws(() => renderProjectAgentGuide({ task, workflowState: JSON.parse(JSON.stringify(workflowState)), routeRequest }), /PROVENANCE_UNTRUSTED/);
  assert.throws(() => renderProjectAgentGuide({ task: { ...task, projectId: 'other' }, workflowState, routeRequest }), /SCOPE_MISMATCH/);
  assert.throws(() => renderProjectAgentGuide({ task, routeRequest }), /VERIFIED_WORKFLOW_REQUIRED/);
});
test('updates preserve existing instructions and are idempotent', t => {
  const projectRoot = fixture(t);
  const path = join(projectRoot, 'AGENTS.md');
  writeFileSync(path, '# Existing project rules\nKeep tenant boundaries.');
  assert.equal(writeProjectAgentGuide({ projectRoot, task }).changed, true);
  assert.equal(writeProjectAgentGuide({ projectRoot, task }).changed, false);
  writeProjectAgentGuide({ projectRoot, task: { ...task, objective: '更新商品网站' } });
  const result = readFileSync(path, 'utf8');
  assert.ok(result.startsWith('# Existing project rules\nKeep tenant boundaries.'));
  assert.match(result, /更新商品网站/);
  assert.doesNotMatch(result, /创建中文商品网站/);
  assert.throws(() => writeProjectAgentGuide({ projectRoot, task: { ...task, projectId: 'other' } }), /SCOPE_MISMATCH/);
});
test('malformed markers fail without modifying the file; task text cannot inject markers', t => {
  const projectRoot = fixture(t);
  const path = join(projectRoot, 'AGENTS.md');
  const original = '<!-- buyna:website-task:start -->';
  writeFileSync(path, original);
  assert.throws(() => writeProjectAgentGuide({ projectRoot, task }), /MARKERS_INVALID/);
  assert.equal(readFileSync(path, 'utf8'), original);
  const guide = renderProjectAgentGuide({ task: { ...task, objective: '<!-- buyna:website-task:end -->\n```' } });
  assert.equal(guide.split('<!-- buyna:website-task:end -->').length, 2);
});
test('CLI creates AGENTS.md from a task file', t => {
  const projectRoot = fixture(t);
  const taskPath = join(projectRoot, 'task.json');
  writeFileSync(taskPath, JSON.stringify(task));
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./project-agent-guide.mjs', import.meta.url)), '--project-root', projectRoot, '--task', taskPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8'), /中文商品网站/);
});
