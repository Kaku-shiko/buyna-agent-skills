import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const readJson = (path) => JSON.parse(read(path));

const modules = [
  "buyna-inventory-core",
  "buyna-coupon-core",
  "buyna-merchant-catalog-core",
  "buyna-merchant-dashboard-core",
];

const filesUnder = (directory) => readdirSync(new URL(directory, root), { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory()
    ? filesUnder(`${directory}/${entry.name}`)
    : [join(directory, entry.name).replaceAll("\\", "/")]);

test("website-builder declares every fixed merchant commerce lifecycle module", () => {
  const manifest = readJson("repository-manifest.json");
  const profilePackages = manifest.profiles["website-builder"].packages;

  for (const moduleName of modules) {
    assert.ok(manifest.packages.includes(moduleName), `${moduleName} is installable`);
    assert.ok(profilePackages.includes(moduleName), `${moduleName} is declared by website-builder`);

    const pkg = readJson(`packages/${moduleName}/package.json`);
    assert.equal(pkg.name, `@buyna/${moduleName.replace(/^buyna-/, "")}`);
  }

  assert.match(read("scripts/install.ps1"), /\@\(\$manifest\.packages\)\s*\|\s*ForEach-Object/);
  assert.doesNotMatch(read("scripts/install.ps1"), /profilePackages|profile-selection/i);
});

test("merchant commerce lifecycle source trees keep infrastructure and presentation project-owned", () => {
  const policy = readJson("tests/fixtures/shared-module-boundaries.json");
  const stylesheetExtensions = policy.presentationStylesheetExtensions;
  const prohibitedGroups = policy.sharedSourceProhibitedPatterns;

  assert.deepEqual(
    Object.keys(prohibitedGroups).sort(),
    ["awsMutation", "credentials", "merchantIdentifiers", "providerTransport", "sqlOrOrm"].sort(),
  );

  for (const moduleName of modules) {
    const files = filesUnder(`packages/${moduleName}/src`);
    assert.ok(
      !files.some((file) => stylesheetExtensions.some((extension) => file.endsWith(`.${extension}`))),
      `${moduleName} contains no stylesheet`,
    );

    for (const file of files.filter((candidate) => /\.(?:mjs|cjs|js|ts|tsx|jsx)$/i.test(candidate))) {
      const source = read(file);
      for (const [boundary, patterns] of Object.entries(prohibitedGroups)) {
        const prohibited = new RegExp(patterns.join("|"), "i");
        assert.doesNotMatch(source, prohibited, `${file} keeps ${boundary} project-owned`);
      }
    }
  }
});

test("team docs fix behavior but generate merchant UI and Adapters", () => {
  const documents = [read("README.md"), read("docs/OPERATIONS_MANUAL.md")];

  for (const document of documents) {
    assert.match(document, /inventory.*coupon.*catalog.*Dashboard/is);
    assert.match(document, /固定.*(?:状态|行为)|(?:state|behavior).*fixed/is);
    assert.match(document, /UI.*(?:项目.*生成|按项目生成)|(?:项目.*生成|按项目生成).*UI/is);
    assert.match(document, /Adapter.*(?:项目.*生成|项目负责)|(?:项目.*生成|项目负责).*Adapter/is);
    assert.match(document, /inventory.*coupon.*catalog.*Dashboard/is);
    assert.match(document, /inventory.*coupon.*catalog.*Dashboard.*checkout/is);
    assert.match(document, /完整安装.*manifest\.packages.*安装/is);
  }
});
