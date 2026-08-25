import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const readJson = (path) => JSON.parse(read(path));

const filesUnder = (directory) => readdirSync(new URL(directory, root), { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory()
    ? filesUnder(`${directory}/${entry.name}`)
    : [join(directory, entry.name).replaceAll("\\", "/")]);

const commerceStateModules = [
  "buyna-checkout-flow-core",
  "buyna-commerce-settlement-core",
];

test("website-builder installs the fixed checkout and trusted-settlement modules", () => {
  const manifest = readJson("repository-manifest.json");
  const profilePackages = manifest.profiles["website-builder"].packages;

  for (const moduleName of commerceStateModules) {
    assert.ok(manifest.packages.includes(moduleName), `${moduleName} is part of the installable inventory`);
    assert.ok(profilePackages.includes(moduleName), `${moduleName} is installed by the website-builder profile`);

    const pkg = readJson(`packages/${moduleName}/package.json`);
    assert.equal(pkg.name, `@buyna/${moduleName.replace(/^buyna-/, "")}`);
    const entrypoint = typeof pkg.exports === "string" ? pkg.exports : pkg.exports["."];
    assert.ok(entrypoint, `${moduleName} exposes its state interface`);
    assert.match(read(`packages/${moduleName}/${entrypoint.replace(/^\.\//, "")}`), /export\s+/);
  }
});

test("shared commerce-state modules do not contain styles or merchant-specific identifiers", () => {
  const merchantIdentifiers = /\b(?:medinance|asuka|sanwa|tuyipaiban|bluesequoia)\b/i;

  for (const moduleName of commerceStateModules) {
    const files = filesUnder(`packages/${moduleName}`);
    assert.ok(!files.some((file) => file.endsWith(".css")), `${moduleName} does not bundle CSS`);

    for (const file of files.filter((candidate) => /\.(?:mjs|js|json)$/i.test(candidate))) {
      assert.doesNotMatch(read(file), merchantIdentifiers, `${file} contains no merchant-specific identifier`);
    }
  }
});

test("team docs preserve fixed commerce behavior while projects generate presentation and Adapters", () => {
  const readme = read("README.md");
  const operationsManual = read("docs/OPERATIONS_MANUAL.md");

  for (const document of [readme, operationsManual]) {
    assert.match(document, /checkout.*settlement.*固定|固定.*checkout.*settlement/is);
    assert.match(document, /表单.*展示|表单.*呈现|form presentation/i);
    assert.match(document, /provider.*(?:Adapter|适配)|(?:Adapter|适配).*provider/i);
    assert.match(document, /database.*(?:Adapter|适配)|(?:Adapter|适配).*database/i);
    assert.match(document, /项目.*生成|generated per project/i);
  }
});

test("operations manual continues approved bounded work packages without per-node confirmation", () => {
  const operationsManual = read("docs/OPERATIONS_MANUAL.md");

  assert.match(operationsManual, /已批准.*有边界.*工作包.*最低测试.*(?:连续|继续)/is);
  assert.doesNotMatch(operationsManual, /每个节点完成后都要保存结果并等待用户明确确认/);
});
