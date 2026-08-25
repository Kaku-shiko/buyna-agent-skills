import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("repository installs dashboard core and headless packages instead of the legacy fixed UI package", () => {
  const manifest = readJson("repository-manifest.json");
  assert.ok(manifest.packages.includes("buyna-merchant-dashboard-core"));
  assert.ok(manifest.packages.includes("buyna-merchant-dashboard-headless"));
  assert.ok(!manifest.packages.includes("buyna-merchant-dashboard-ui"));
});

test("headless dashboard package has no bundled visual stylesheet", () => {
  const pkg = readJson("packages/buyna-merchant-dashboard-headless/package.json");
  assert.equal(pkg.name, "@buyna/merchant-dashboard-headless");
  assert.ok(!Object.keys(pkg.exports).some((key) => key.endsWith(".css")));
  const source = read("packages/buyna-merchant-dashboard-headless/src/dashboard-components.tsx");
  assert.doesNotMatch(source, /import\s+[^;]*\.css/);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i);
});

test("frontend skill requires an approved project theme instead of dashboard defaults", () => {
  const skill = read("skills/buyna-frontend-builder/SKILL.md");
  const reference = read("skills/buyna-frontend-builder/references/merchant-dashboard-functional-core.md");
  assert.match(skill, /buyna-merchant-dashboard-core/);
  assert.match(skill, /buyna-merchant-dashboard-headless/);
  assert.match(reference, /approved project dashboard theme/i);
  assert.match(reference, /must not import a fixed dashboard stylesheet/i);
});
