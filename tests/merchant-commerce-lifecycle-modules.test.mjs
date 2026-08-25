import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
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

const violationsIn = (files, policy, readSource) => {
  const violations = [];
  const stylesheetExtensions = new Set(policy.presentationStylesheetExtensions);
  const sourceExtensions = new Set(policy.sharedSourceExtensions);

  for (const file of files) {
    const extension = extname(file).slice(1).toLowerCase();
    if (stylesheetExtensions.has(extension)) violations.push({ file, boundary: "presentationStylesheet" });
    if (!sourceExtensions.has(extension)) {
      violations.push({ file, boundary: "unscannedSourceExtension" });
      continue;
    }

    const source = readSource(file);
    for (const [boundary, patterns] of Object.entries(policy.sharedSourceProhibitedPatterns)) {
      if (new RegExp(patterns.join("|"), "i").test(source)) violations.push({ file, boundary });
    }
  }

  return violations;
};

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
  const prohibitedGroups = policy.sharedSourceProhibitedPatterns;

  assert.deepEqual(
    Object.keys(prohibitedGroups).sort(),
    ["awsMutation", "credentials", "merchantIdentifiers", "providerTransport", "sqlOrOrm", "uiImplementation"].sort(),
  );
  assert.deepEqual(
    [...policy.sharedSourceExtensions].sort(),
    ["cjs", "css", "cts", "js", "json", "jsx", "less", "mjs", "mts", "sass", "scss", "styl", "stylus", "svelte", "ts", "tsx", "vue"].sort(),
  );

  for (const moduleName of modules) {
    const files = filesUnder(`packages/${moduleName}/src`);
    assert.deepEqual(violationsIn(files, policy, read), [], `${moduleName} keeps UI and infrastructure project-owned`);
  }
});

test("boundary policy catches executable mutations without rejecting domain identifiers", () => {
  const policy = readJson("tests/fixtures/shared-module-boundaries.json");
  const directory = mkdtempSync(join(tmpdir(), "buyna-boundary-mutations-"));
  const mutations = [
    ["theme.css", ".root { color: red; }", "presentationStylesheet"],
    ["react.ts", "import React from 'react';", "uiImplementation"],
    ["component.tsx", "export const Card = () => <Card />;", "uiImplementation"],
    ["markup.tsx", "export const Card = () => <section />;", "uiImplementation"],
    ["inline-style.jsx", "export const Card = () => <div style={{ color: 'red' }} />;", "uiImplementation"],
    ["css-import.js", "import './theme.css';", "uiImplementation"],
    ["component.vue", "<template><div class=\"card\">shop</div></template><style>.card{color:red}</style>", "uiImplementation"],
    ["component.svelte", "<script>const label='shop';</script><div style=\"color:red\">{label}</div>", "uiImplementation"],
    ["component.astro", "<section class=\"card\">shop</section>", "unscannedSourceExtension"],
    ["seller.json", "{\"seller\":\"seller_example\"}", "merchantIdentifiers"],
    ["domain.json", "{\"domain\":\"shop.example.com\"}", "merchantIdentifiers"],
    ["api-key.mts", "export const apiKey = 'value';", "credentials"],
    ["token.cts", "export const token = 'value';", "credentials"],
    ["secret.ts", "export const secret = 'value';", "credentials"],
    ["private-key.ts", "export const privateKey = 'value';", "credentials"],
    ["fetch.js", "fetch('/provider');", "providerTransport"],
    ["undici.mjs", "import { request } from 'undici';", "providerTransport"],
    ["axios.mjs", "import axios from 'axios';", "providerTransport"],
    ["node-http.cjs", "const http = require('node:https');", "providerTransport"],
    ["sql-create.ts", "const sql = 'CREATE TABLE orders (id text)';", "sqlOrOrm"],
    ["sql-alter.ts", "const sql = 'ALTER TABLE orders ADD COLUMN state text';", "sqlOrOrm"],
    ["sql-drop.ts", "const sql = 'DROP TABLE orders';", "sqlOrOrm"],
    ["client-query.js", "client.query(statement);", "sqlOrOrm"],
    ["pg.mjs", "import pg from 'pg';", "sqlOrOrm"],
    ["knex.mjs", "import knex from 'knex';", "sqlOrOrm"],
    ["aws-delete-method.mjs", "s3.deleteObject({ Key: 'x' });", "awsMutation"],
    ["aws-delete-command.mjs", "new DeleteObjectCommand({ Key: 'x' });", "awsMutation"],
  ];

  try {
    for (const [name, source] of mutations) writeFileSync(join(directory, name), source, "utf8");
    writeFileSync(
      join(directory, "allowed.mjs"),
      "export function createTableView({ sellerId, stylesheet, tokenCount, secretState }) { return { sellerId, stylesheet, tokenCount, secretState }; }",
      "utf8",
    );

    const files = readdirSync(directory).map((name) => join(directory, name));
    const violations = violationsIn(files, policy, (file) => readFileSync(file, "utf8"));

    for (const [name, , boundary] of mutations) {
      assert.ok(
        violations.some((violation) => violation.file.endsWith(name) && violation.boundary === boundary),
        `${name} is rejected as ${boundary}`,
      );
    }
    assert.ok(!violations.some((violation) => violation.file.endsWith("allowed.mjs")));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("team docs fix behavior but generate merchant UI and Adapters", () => {
  const documents = [read("README.md"), read("docs/OPERATIONS_MANUAL.md")];

  for (const document of documents) {
    assert.match(document, /inventory.*coupon.*catalog.*Dashboard/is);
    assert.match(document, /固定.*(?:状态|行为)|(?:state|behavior).*fixed/is);
    assert.match(document, /UI.*(?:项目.*生成|按项目生成)|(?:项目.*生成|按项目生成).*UI/is);
    assert.match(document, /Adapter.*(?:项目.*生成|项目负责)|(?:项目.*生成|项目负责).*Adapter/is);
    assert.match(document, /按.*能力|capabilit/is);
    assert.match(document, /inventory.*checkout.*snapshot.*settlement/is);
    assert.match(document, /coupon.*checkout.*snapshot.*settlement/is);
    assert.match(document, /catalog.*独立/is);
    assert.match(document, /Dashboard.*独立/is);
    assert.doesNotMatch(document, /inventory\s*→\s*coupon\s*→/i);
    assert.match(document, /完整安装.*manifest\.packages.*安装/is);
  }
});
