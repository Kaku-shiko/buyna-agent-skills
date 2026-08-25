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

// Maintainers: extend this one fixture when a reviewed shared-module boundary changes.
const sharedModuleBoundaryPolicy = () => readJson("tests/fixtures/shared-module-boundaries.json");

test("website-builder declares the fixed checkout and trusted-settlement modules", () => {
  const manifest = readJson("repository-manifest.json");
  const profilePackages = manifest.profiles["website-builder"].packages;

  for (const moduleName of commerceStateModules) {
    assert.ok(manifest.packages.includes(moduleName), `${moduleName} is part of the installable inventory`);
    assert.ok(profilePackages.includes(moduleName), `${moduleName} is declared by the website-builder profile`);

    const pkg = readJson(`packages/${moduleName}/package.json`);
    assert.equal(pkg.name, `@buyna/${moduleName.replace(/^buyna-/, "")}`);
    const entrypoint = typeof pkg.exports === "string" ? pkg.exports : pkg.exports["."];
    assert.ok(entrypoint, `${moduleName} exposes its state interface`);
    assert.match(read(`packages/${moduleName}/${entrypoint.replace(/^\.\//, "")}`), /export\s+/);
  }

  const installer = read("scripts/install.ps1");
  assert.match(installer, /\@\(\$manifest\.packages\)\s*\|\s*ForEach-Object/);
});

test("shared commerce-state modules obey the authoritative presentation and production-boundary policy", () => {
  const policy = sharedModuleBoundaryPolicy();
  const prohibitedIdentifiers = new RegExp(
    [...policy.merchantIdentifierPatterns, ...policy.productionIdentifierPatterns].join("|"),
    "i",
  );

  for (const moduleName of commerceStateModules) {
    const files = filesUnder(`packages/${moduleName}`);
    assert.ok(
      !files.some((file) => policy.presentationStylesheetExtensions
        .some((extension) => file.toLowerCase().endsWith(`.${extension}`))),
      `${moduleName} does not bundle a presentation stylesheet`,
    );

    for (const file of files.filter((candidate) => /\.(?:mjs|js|json)$/i.test(candidate))) {
      assert.doesNotMatch(read(file), prohibitedIdentifiers, `${file} contains no merchant or production identifier`);
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
    assert.match(document, /website-builder.*(?:声明|declared)/is);
    assert.match(document, /完整安装.*manifest\.packages.*安装/is);
  }
});

test("operations manual continues approved bounded work packages without per-node confirmation", () => {
  const operationsManual = read("docs/OPERATIONS_MANUAL.md");

  assert.match(operationsManual, /已批准.*有边界.*工作包.*最低测试.*(?:连续|继续)/is);
  assert.doesNotMatch(operationsManual, /每个节点完成后都要保存结果并等待用户明确确认/);
});
