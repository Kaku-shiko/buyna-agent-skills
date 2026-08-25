import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createUploadQueue,
} from "../packages/buyna-merchant-file-core/src/file-core.mjs";
import {
  createAuthSession,
} from "../packages/buyna-auth-session-core/src/index.mjs";
import {
  createMerchantContextResolver,
} from "../packages/buyna-merchant-context-core/src/index.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const readJson = (path) => JSON.parse(read(path));

const supportingModules = [
  "buyna-merchant-file-core",
  "buyna-auth-session-core",
  "buyna-merchant-context-core",
];

const exactKeys = (value) => Object.keys(value).sort();

const filesUnder = (directory) => readdirSync(new URL(directory, root), { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory()
    ? filesUnder(`${directory}/${entry.name}`)
    : [join(directory, entry.name).replaceAll("\\", "/")]);

function extractModuleSpecifiers(source) {
  const matches = [
    ...source.matchAll(/\b(?:import|export)\s+(?:[^'"\r\n]*?\s+from\s*)?['"]([^'"]+)['"]/gu),
    ...source.matchAll(/\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/gu),
  ];
  return matches.map((match) => match[1]);
}

function supportingBoundaryViolations(files, policy, readSource) {
  const violations = [];
  const stylesheetExtensions = new Set(policy.stylesheetExtensions);
  const componentExtensions = new Set(policy.componentExtensions);
  const moduleRules = Object.entries(policy.forbiddenModuleSpecifiers)
    .map(([boundary, patterns]) => [boundary, patterns.map((pattern) => new RegExp(pattern, "iu"))]);
  const sourceRules = {
    providerTransport: policy.providerTransportExecutablePatterns,
    sqlOrOrm: policy.sqlOrOrmExecutablePatterns,
    merchantIdentifier: policy.merchantIdentifierPatterns,
    rawSecretLiteral: policy.rawSecretLiteralPatterns,
  };

  for (const file of files) {
    const extension = extname(file).slice(1).toLowerCase();
    if (stylesheetExtensions.has(extension)) {
      violations.push({ file, boundary: "presentationStylesheet" });
    }
    if (componentExtensions.has(extension)) {
      violations.push({ file, boundary: "visualComponent" });
    }
    if (stylesheetExtensions.has(extension) || componentExtensions.has(extension)) continue;
    if (!policy.scannedSourceExtensions.includes(extension)) {
      violations.push({ file, boundary: "unscannedSourceExtension" });
      continue;
    }

    const source = readSource(file);
    for (const specifier of extractModuleSpecifiers(source)) {
      for (const [boundary, patterns] of moduleRules) {
        if (patterns.some((pattern) => pattern.test(specifier))) {
          violations.push({ file, boundary });
        }
      }
    }
    for (const [boundary, patterns] of Object.entries(sourceRules)) {
      if (patterns.some((pattern) => new RegExp(pattern, "iu").test(source))) {
        violations.push({ file, boundary });
      }
    }
  }
  return violations;
}

test("website-builder installs the fixed file, auth, and merchant-context modules from the manifest", () => {
  const manifest = readJson("repository-manifest.json");
  const profilePackages = manifest.profiles["website-builder"].packages;

  for (const moduleName of supportingModules) {
    assert.ok(manifest.packages.includes(moduleName), `${moduleName} is installable`);
    assert.ok(profilePackages.includes(moduleName), `${moduleName} is declared by website-builder`);

    const pkg = readJson(`packages/${moduleName}/package.json`);
    const entrypoint = typeof pkg.exports === "string" ? pkg.exports : pkg.exports?.["."];
    assert.ok(entrypoint, `${moduleName} has a public package entrypoint`);
    assert.ok(read(`packages/${moduleName}/${entrypoint.replace(/^\.\//u, "")}`));
    assert.match(pkg.scripts?.test ?? "", /^node --test\b/u);
  }

  const installer = read("scripts/install.ps1");
  assert.match(installer, /@\(\$manifest\.packages\)\s*\|\s*ForEach-Object/u);
  assert.doesNotMatch(installer, /profilePackages|profile-selection/iu);

});

test("public supporting-state data exposes only the fixed safe contracts", async () => {
  const identity = {
    subjectId: "user_1",
    permissions: ["catalog:write"],
    issuedAt: "2026-08-25T23:59:00.000Z",
    expiresAt: "2026-08-26T01:00:00.000Z",
  };
  const auth = createAuthSession({
    clock: () => new Date("2026-08-26T00:00:00.000Z"),
    initialIdentity: identity,
  });
  const authSnapshot = auth.snapshot();
  const authorization = auth.requireAuthorization({ permissions: ["catalog:write"] });
  assert.deepEqual(exactKeys(authSnapshot), [
    "attemptId", "createdAt", "errorCode", "identity", "state", "updatedAt",
  ]);
  assert.deepEqual(exactKeys(authSnapshot.identity), [
    "expiresAt", "issuedAt", "permissions", "subjectId",
  ]);
  assert.deepEqual(exactKeys(authorization), ["allowed", "code", "identity", "statusCode"]);
  assert.deepEqual(exactKeys(authorization.identity), [
    "expiresAt", "issuedAt", "permissions", "subjectId",
  ]);

  for (const forbiddenKey of ["sessionId", "password", "token", "cookie", "credential"]) {
    assert.throws(
      () => createAuthSession({ initialIdentity: { ...identity, [forbiddenKey]: "unsafe" } }),
      (error) => error.code === "AUTH_IDENTITY_FIELD_FORBIDDEN",
    );
  }

  const resolver = createMerchantContextResolver({
    requestAdapter: { async getObservedHost() { return "SHOP.EXAMPLE.TEST:443"; } },
    sessionAdapter: { async getAuthenticatedIdentity() { return identity; } },
    directory: {
      async findMerchantByHost({ host }) {
        assert.equal(host, "shop.example.test");
        return { projectId: "project_alpha", sellerId: "seller_alpha", status: "active" };
      },
      async findMembership(input) {
        assert.deepEqual(input, {
          subjectId: "user_1", projectId: "project_alpha", sellerId: "seller_alpha",
        });
        return {
          projectId: "project_alpha", sellerId: "seller_alpha", role: "admin", status: "active",
        };
      },
    },
  });
  const context = await resolver.resolve();
  assert.deepEqual(exactKeys(context), [
    "host", "merchantStatus", "projectId", "role", "sellerId", "subjectId",
  ]);

  const ids = { item: ["file_1"], attempt: ["attempt_1"] };
  const queue = createUploadQueue({
    projectId: "project_alpha",
    sellerId: "seller_alpha",
    idGenerator(kind) { return ids[kind].shift(); },
    clock: () => new Date("2026-08-26T00:00:00.000Z"),
  });
  queue.select({ name: "item.webp", size: 1200, type: "image/webp" });
  const output = queue.transition({ itemId: "file_1", event: "start_validation" });
  assert.deepEqual(exactKeys(output), ["effects", "snapshot"]);
  assert.deepEqual(exactKeys(output.snapshot), ["coverItemId", "items", "projectId", "sellerId"]);
  assert.deepEqual(exactKeys(output.effects[0]), [
    "attemptId", "effectId", "idempotencyKey", "itemId", "payload",
    "projectId", "sellerId", "type",
  ]);
  assert.deepEqual(exactKeys(output.effects[0].payload), ["name", "size", "type"]);

  const serialized = JSON.stringify({ authSnapshot, authorization, context, output });
  for (const forbiddenKey of ["sessionId", "password", "token", "cookie", "credential", "bucket", "url"]) {
    assert.ok(!serialized.includes(`\"${forbiddenKey}\"`), `${forbiddenKey} is absent from public data`);
  }
});

test("supporting module source rejects executable infrastructure, UI, route, and raw-secret boundaries", () => {
  const policy = readJson("tests/fixtures/shared-module-boundaries.json")
    .supportingInteractionSourceBoundary;
  assert.ok(policy, "supporting interaction source boundary is declared");

  for (const moduleName of supportingModules) {
    const files = filesUnder(`packages/${moduleName}/src`);
    assert.deepEqual(
      supportingBoundaryViolations(files, policy, read),
      [],
      `${moduleName} keeps transport, persistence, routes, secrets, and presentation project-owned`,
    );
  }
});

test("supporting source boundary catches executable mutations but permits validation vocabulary", () => {
  const policy = readJson("tests/fixtures/shared-module-boundaries.json")
    .supportingInteractionSourceBoundary;
  assert.ok(policy, "supporting interaction source boundary is declared");
  const directory = mkdtempSync(join(tmpdir(), "buyna-supporting-boundary-"));
  const mutations = [
    ["theme.css", ".root { color: red; }", "presentationStylesheet"],
    ["component.tsx", "export const Login = () => <form />;", "visualComponent"],
    ["react.mjs", "import React from 'react';", "uiFrameworkImport"],
    ["aws.mjs", "import { S3Client } from '@aws-sdk/client-s3';", "awsSdkImport"],
    ["sql.mjs", "import pg from 'pg';", "sqlOrOrmImport"],
    ["password.mjs", "import bcrypt from 'bcrypt';", "passwordLibraryImport"],
    ["cookie.mjs", "import cookieParser from 'cookie-parser';", "cookieMiddlewareImport"],
    ["route.mjs", "import upload from '../routes/upload.mjs';", "projectRouteImport"],
    ["provider.mjs", "import axios from 'axios';", "providerTransportImport"],
    ["fetch.mjs", "export const send = () => fetch('/provider');", "providerTransport"],
    ["sql-literal.mjs", "export const statement = 'SELECT * FROM sessions';", "sqlOrOrm"],
    ["merchant.mjs", "export const merchant = 'medinance';", "merchantIdentifier"],
    ["access-key.mjs", "export const value = 'AKIA1234567890ABCDEF';", "rawSecretLiteral"],
    ["pem.mjs", "export const value = '-----BEGIN PRIVATE KEY-----';", "rawSecretLiteral"],
    ["jwt.mjs", "export const value = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEifQ.abcdefghijklmnop';", "rawSecretLiteral"],
    ["bearer.mjs", "export const header = 'Bearer literalcredential123';", "rawSecretLiteral"],
    ["assigned-token.mjs", "const token = 'literalcredential123'; export { token };", "rawSecretLiteral"],
  ];

  try {
    for (const [name, source] of mutations) writeFileSync(join(directory, name), source, "utf8");
    writeFileSync(
      join(directory, "allowed-validation.mjs"),
      "export const forbiddenIdentityFields = ['sessionId', 'password', 'token', 'cookie', 'credential'];",
      "utf8",
    );
    const files = readdirSync(directory).map((name) => join(directory, name));
    const violations = supportingBoundaryViolations(
      files,
      policy,
      (file) => readFileSync(file, "utf8"),
    );

    for (const [name, , boundary] of mutations) {
      assert.ok(
        violations.some((violation) => violation.file.endsWith(name)
          && violation.boundary === boundary),
        `${name} is rejected as ${boundary}`,
      );
    }
    assert.ok(!violations.some((violation) => violation.file.endsWith("allowed-validation.mjs")));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
