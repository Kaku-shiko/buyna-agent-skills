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

function tokenizeJavaScript(source) {
  const tokens = [];
  const literalOrCommentRegions = [];
  let index = 0;
  const push = (type, value) => tokens.push({ type, value });
  const regexPrefixIdentifiers = new Set([
    "await", "case", "delete", "in", "instanceof", "of", "return", "throw",
    "typeof", "void", "yield",
  ]);
  const regexPrefixPunctuators = new Set([
    "(", "{", "[", ",", ";", "=", ":", "?", "!", "~", "+", "-", "*",
    "%", "&", "|", "^", "&&", "||", "??", "=>",
  ]);

  function readQuoted(quote) {
    let value = "";
    index += 1;
    while (index < source.length) {
      if (source[index] === "\\") {
        value += source[index];
        if (index + 1 < source.length) value += source[index + 1];
        index += 2;
        continue;
      }
      if (source[index] === quote) {
        index += 1;
        break;
      }
      value += source[index];
      index += 1;
    }
    push("string", value);
    literalOrCommentRegions.push(value);
  }

  function regexCanStart() {
    const previous = tokens.at(-1);
    if (!previous) return true;
    if (previous.type === "identifier") return regexPrefixIdentifiers.has(previous.value);
    return regexPrefixPunctuators.has(previous.value);
  }

  function readRegex() {
    let value = "/";
    let inCharacterClass = false;
    index += 1;
    while (index < source.length) {
      const character = source[index];
      value += character;
      index += 1;
      if (character === "\\" && index < source.length) {
        value += source[index];
        index += 1;
        continue;
      }
      if (character === "[") inCharacterClass = true;
      if (character === "]") inCharacterClass = false;
      if (character === "/" && !inCharacterClass) break;
    }
    while (index < source.length && /[A-Za-z]/u.test(source[index])) {
      value += source[index];
      index += 1;
    }
    push("regex", value);
  }

  function scan(stopAtTemplateExpressionEnd = false) {
    let nestedBraceDepth = 0;
    while (index < source.length) {
      const character = source[index];
      const next = source[index + 1];
      if (stopAtTemplateExpressionEnd && character === "}" && nestedBraceDepth === 0) {
        index += 1;
        return;
      }
      if (/\s/u.test(character)) {
        index += 1;
        continue;
      }
      if (character === "/" && next === "/") {
        index += 2;
        const start = index;
        while (index < source.length && source[index] !== "\n") index += 1;
        literalOrCommentRegions.push(source.slice(start, index));
        continue;
      }
      if (character === "/" && next === "*") {
        index += 2;
        const start = index;
        while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
          index += 1;
        }
        literalOrCommentRegions.push(source.slice(start, index));
        index = Math.min(index + 2, source.length);
        continue;
      }
      if (character === "'" || character === '"') {
        readQuoted(character);
        continue;
      }
      if (character === "`") {
        index += 1;
        let chunk = "";
        while (index < source.length) {
          if (source[index] === "\\") {
            chunk += source[index];
            if (index + 1 < source.length) chunk += source[index + 1];
            index += 2;
            continue;
          }
          if (source[index] === "`") {
            if (chunk) {
              push("string", chunk);
              literalOrCommentRegions.push(chunk);
            }
            index += 1;
            break;
          }
          if (source[index] === "$" && source[index + 1] === "{") {
            if (chunk) {
              push("string", chunk);
              literalOrCommentRegions.push(chunk);
            }
            chunk = "";
            index += 2;
            scan(true);
            continue;
          }
          chunk += source[index];
          index += 1;
        }
        continue;
      }
      if (character === "/" && regexCanStart()) {
        readRegex();
        continue;
      }
      if (/[A-Za-z_$]/u.test(character)) {
        const start = index;
        index += 1;
        while (index < source.length && /[A-Za-z0-9_$]/u.test(source[index])) index += 1;
        push("identifier", source.slice(start, index));
        continue;
      }
      if (/[0-9]/u.test(character)) {
        const start = index;
        index += 1;
        while (index < source.length && /[0-9A-Za-z_.]/u.test(source[index])) index += 1;
        push("number", source.slice(start, index));
        continue;
      }
      const operator = ["===", "!==", "=>", "==", "!=", ">=", "<=", "?.", "??", "&&", "||", "**", "++", "--", "+=", "-=", "*=", "/="]
        .find((candidate) => source.startsWith(candidate, index));
      if (operator) {
        push("punctuator", operator);
        index += operator.length;
        continue;
      }
      if (stopAtTemplateExpressionEnd && character === "{") nestedBraceDepth += 1;
      if (stopAtTemplateExpressionEnd && character === "}" && nestedBraceDepth > 0) {
        nestedBraceDepth -= 1;
      }
      push("punctuator", character);
      index += 1;
    }
  }

  scan();
  tokens.literalOrCommentRegions = literalOrCommentRegions;
  return tokens;
}

function extractModuleSpecifiers(tokens) {
  const specifiers = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "identifier") continue;
    if (token.value === "require" && tokens[index + 1]?.value === "("
      && tokens[index + 2]?.type === "string") {
      specifiers.push(tokens[index + 2].value);
      continue;
    }
    if (token.value === "import" && tokens[index + 1]?.value === "("
      && tokens[index + 2]?.type === "string") {
      specifiers.push(tokens[index + 2].value);
      continue;
    }
    if (token.value !== "import" && token.value !== "export") continue;
    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      if (tokens[cursor].value === ";") break;
      if (tokens[cursor].type === "string") {
        if (token.value === "import" || tokens[cursor - 1]?.value === "from") {
          specifiers.push(tokens[cursor].value);
        }
        break;
      }
    }
  }
  return specifiers;
}

function buildLexicalScopes(tokens) {
  const scopes = [{ parent: null, bindings: new Set() }];
  const stack = [0];
  for (const token of tokens) {
    if (token.value === "}" && stack.length > 1) stack.pop();
    token.scope = stack.at(-1);
    if (token.value === "{") {
      const openedScope = scopes.length;
      scopes.push({ parent: stack.at(-1), bindings: new Set() });
      token.openedScope = openedScope;
      stack.push(openedScope);
    }
  }

  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (tokens[index].value === "function" && tokens[index + 1].type === "identifier") {
      scopes[tokens[index].scope].bindings.add(tokens[index + 1].value);
    }
    if (["const", "let", "var"].includes(tokens[index].value)
      && tokens[index + 1]?.type === "identifier" && tokens[index + 2]?.value === "=") {
      const statementEnd = tokens.findIndex((token, cursor) => (
        cursor > index + 2 && token.value === ";"
      ));
      const statement = tokens.slice(index + 3, statementEnd === -1 ? tokens.length : statementEnd);
      if (statement.some((token) => token.value === "function" || token.value === "=>")) {
        scopes[tokens[index].scope].bindings.add(tokens[index + 1].value);
      }
    }
  }
  return scopes;
}

function scopeHasBinding(scopes, startScope, name) {
  let scope = startScope;
  while (scope !== null && scope !== undefined) {
    if (scopes[scope].bindings.has(name)) return true;
    scope = scopes[scope].parent;
  }
  return false;
}

function executableBoundaries(tokens) {
  const violations = new Set();
  const scopes = buildLexicalScopes(tokens);
  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    const previous = tokens[index - 1];
    const next = tokens[index + 1];
    if (current.value === "fetch" && next?.value === "("
      && previous?.value !== "." && !scopeHasBinding(scopes, current.scope, "fetch")) {
      violations.add("providerTransport");
    }
    if (current.value === "globalThis" && next?.value === "."
      && tokens[index + 2]?.value === "fetch" && tokens[index + 3]?.value === "(") {
      violations.add("providerTransport");
    }
    if (["http", "https"].includes(current.value) && next?.value === "."
      && ["request", "get"].includes(tokens[index + 2]?.value)
      && tokens[index + 3]?.value === "(") {
      violations.add("providerTransport");
    }
    if (current.value === "." && next?.value === "query" && tokens[index + 2]?.value === "(") {
      violations.add("sqlOrOrm");
    }
    if (current.value === "sql" && next?.type === "string") violations.add("sqlOrOrm");
    if (["S3Client", "PutObjectCommand", "DeleteObjectCommand"].includes(current.value)
      && next?.value === "(") {
      violations.add("awsSdkCall");
    }
  }
  return violations;
}

function isSecretAssignmentKey(value) {
  if (typeof value !== "string") return false;
  const normalized = value.replaceAll(/[^A-Za-z]/gu, "").toLowerCase();
  return ["password", "token", "cookie", "credential"]
    .some((name) => normalized === name || normalized.endsWith(name));
}

function isPlaceholder(value) {
  const normalized = value.trim();
  return normalized === ""
    || /^<[^>]+>$/u.test(normalized)
    || /^\$\{[^}]+\}$/u.test(normalized)
    || /^\{\{[^}]+\}\}$/u.test(normalized)
    || /^(?:YOUR|REPLACE|PLACEHOLDER|EXAMPLE|TEST|DUMMY|CHANGEME)(?:[_ -].*)?$/iu.test(normalized);
}

function assignedKey(tokens, operatorIndex) {
  const before = tokens[operatorIndex - 1];
  if (before?.type === "identifier" || before?.type === "string") return before.value;
  if (before?.value === "]" && tokens[operatorIndex - 2]?.type === "string"
    && tokens[operatorIndex - 3]?.value === "[") {
    return tokens[operatorIndex - 2].value;
  }
  return null;
}

function hasRawSecretLiteral(tokens, source, policy) {
  const signatures = policy.rawSecretSignatures.map((pattern) => new RegExp(pattern, "iu"));
  if (signatures.some((pattern) => pattern.test(source))) return true;
  const literalOrCommentSignatures = policy.literalOrCommentSecretSignatures
    .map((pattern) => new RegExp(pattern, "iu"));
  if (tokens.literalOrCommentRegions.some((region) => literalOrCommentSignatures
    .some((pattern) => pattern.test(region)))) return true;

  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (!["=", ":"].includes(tokens[index].value)) continue;
    if (tokens[index].value === ":") {
      const computed = tokens[index - 1]?.value === "]"
        && tokens[index - 2]?.type === "string" && tokens[index - 3]?.value === "[";
      const container = tokens[index - (computed ? 4 : 2)]?.value;
      if (!["{", ","].includes(container)) continue;
    }
    const value = tokens[index + 1];
    const key = assignedKey(tokens, index);
    if (value?.type === "string" && isSecretAssignmentKey(key) && !isPlaceholder(value.value)) {
      return true;
    }
  }
  return false;
}

function supportingBoundaryViolations(files, policy, readSource) {
  const violations = [];
  const stylesheetExtensions = new Set(policy.stylesheetExtensions);
  const componentExtensions = new Set(policy.componentExtensions);
  const moduleRules = Object.entries(policy.forbiddenModuleSpecifiers)
    .map(([boundary, patterns]) => [boundary, patterns.map((pattern) => new RegExp(pattern, "iu"))]);
  const stringRules = {
    merchantIdentifier: policy.merchantIdentifierPatterns,
    productionIdentifier: policy.productionIdentifierPatterns,
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
    const tokens = tokenizeJavaScript(source);
    for (const specifier of extractModuleSpecifiers(tokens)) {
      for (const [boundary, patterns] of moduleRules) {
        if (patterns.some((pattern) => pattern.test(specifier))) {
          violations.push({ file, boundary });
        }
      }
    }
    for (const boundary of executableBoundaries(tokens)) violations.push({ file, boundary });
    for (const [boundary, patterns] of Object.entries(stringRules)) {
      if (tokens.some((token) => token.type === "string"
        && patterns.some((pattern) => new RegExp(pattern, "iu").test(token.value)))) {
        violations.push({ file, boundary });
      }
    }
    if (hasRawSecretLiteral(tokens, source, policy)) {
      violations.push({ file, boundary: "rawSecretLiteral" });
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
        return {
          projectId: "project_alpha", sellerId: "seller_alpha", status: "active",
          token: "adapter-token", bucket: "adapter-bucket", url: "https://adapter.invalid",
          credential: "adapter-credential",
        };
      },
      async findMembership(input) {
        assert.deepEqual(input, {
          subjectId: "user_1", projectId: "project_alpha", sellerId: "seller_alpha",
        });
        return {
          projectId: "project_alpha", sellerId: "seller_alpha", role: "admin", status: "active",
          token: "adapter-token", bucket: "adapter-bucket", url: "https://adapter.invalid",
          credential: "adapter-credential",
        };
      },
    },
  });
  const context = await resolver.resolve();
  assert.deepEqual(exactKeys(context), [
    "host", "merchantStatus", "projectId", "role", "sellerId", "subjectId",
  ]);

  let maliciousDirectoryCalls = 0;
  const maliciousSessionResolver = createMerchantContextResolver({
    requestAdapter: { async getObservedHost() { return "shop.example.test"; } },
    sessionAdapter: {
      async getAuthenticatedIdentity() { return { ...identity, token: "adapter-token" }; },
    },
    directory: {
      async findMerchantByHost() { maliciousDirectoryCalls += 1; return null; },
      async findMembership() { maliciousDirectoryCalls += 1; return null; },
    },
  });
  await assert.rejects(
    () => maliciousSessionResolver.resolve(),
    (error) => error.code === "MERCHANT_CONTEXT_AUTH_REQUIRED",
  );
  assert.equal(maliciousDirectoryCalls, 0);

  const ids = { item: ["file_1"], attempt: ["attempt_1"] };
  const queue = createUploadQueue({
    projectId: "project_alpha",
    sellerId: "seller_alpha",
    idGenerator(kind) { return ids[kind].shift(); },
    clock: () => new Date("2026-08-26T00:00:00.000Z"),
  });
  queue.select({
    name: "item.webp", size: 1200, type: "image/webp",
    password: "unsafe", token: "unsafe", cookie: "unsafe", credential: "unsafe",
    bucket: "unsafe", url: "https://unsafe.invalid",
  });
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
  for (const requiredPolicy of [
    "productionIdentifierPatterns", "rawSecretSignatures", "literalOrCommentSecretSignatures",
  ]) {
    assert.ok(Array.isArray(policy[requiredPolicy]), `${requiredPolicy} is declared`);
  }

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
  for (const requiredPolicy of [
    "productionIdentifierPatterns", "rawSecretSignatures", "literalOrCommentSecretSignatures",
  ]) {
    assert.ok(Array.isArray(policy[requiredPolicy]), `${requiredPolicy} is declared`);
  }
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
    ["undici.mjs", "import { request } from 'undici';", "providerTransportImport"],
    ["require-http.mjs", "const https = require('node:https');", "providerTransportImport"],
    ["fetch.mjs", "export const send = () => fetch('/provider');", "providerTransport"],
    ["template-fetch.mjs", "export const send = `${fetch('/provider')}`;", "providerTransport"],
    ["nested-global-fetch.mjs", "function outer(){ function fetch(value){ return value; } fetch('/local'); } fetch('/provider');", "providerTransport"],
    ["sibling-fetch.mjs", "function left(){ function fetch(value){ return value; } fetch('/local'); } function right(){ fetch('/provider'); }", "providerTransport"],
    ["sql-call.mjs", "export const load = client => client.query('SELECT * FROM sessions');", "sqlOrOrm"],
    ["aws-call.mjs", "export const command = new PutObjectCommand({});", "awsSdkCall"],
    ["merchant.mjs", "export const merchant = 'medinance';", "merchantIdentifier"],
    ["production-ip.mjs", "export const target = '35.73.127.215';", "productionIdentifier"],
    ["production-arn.mjs", "export const target = 'arn:aws:s3:::merchant-files';", "productionIdentifier"],
    ["production-instance.mjs", "export const target = 'i-0123456789abcdef0';", "productionIdentifier"],
    ["access-key.mjs", "export const value = 'AKIA1234567890ABCDEF';", "rawSecretLiteral"],
    ["commented-access-key.mjs", "// leaked AKIA1234567890ABCDEF", "rawSecretLiteral"],
    ["pem.mjs", "export const value = '-----BEGIN PRIVATE KEY-----';", "rawSecretLiteral"],
    ["jwt.mjs", "export const value = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEifQ.abcdefghijklmnop';", "rawSecretLiteral"],
    ["commented-jwt.mjs", "// leaked eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEifQ.abcdefghijklmnop", "rawSecretLiteral"],
    ["bearer.mjs", "export const header = 'Bearer literalcredential123';", "rawSecretLiteral"],
    ["embedded-bearer.mjs", "export const header = 'Authorization: Bearer literalcredential123';", "rawSecretLiteral"],
    ["assigned-token.mjs", "const token = 'literalcredential123'; export { token };", "rawSecretLiteral"],
    ["direct-password.mjs", "password = 'literalcredential123';", "rawSecretLiteral"],
    ["property-token.mjs", "state.token = 'literalcredential123';", "rawSecretLiteral"],
    ["bracket-cookie.mjs", "config['cookie'] = 'literalcredential123';", "rawSecretLiteral"],
    ["object-credential.mjs", "export const state = { credential: 'literalcredential123' };", "rawSecretLiteral"],
    ["computed-token.mjs", "export const state = { ['token']: 'literalcredential123' };", "rawSecretLiteral"],
  ];

  try {
    for (const [name, source] of mutations) writeFileSync(join(directory, name), source, "utf8");
    writeFileSync(
      join(directory, "allowed-validation.mjs"),
      [
        "export const forbiddenIdentityFields = ['sessionId', 'password', 'token', 'cookie', 'credential'];",
        "const compared = token === 'literalcredential123';",
        "const chosen = condition ? credential : 'literalcredential123';",
        "const password = ''; const authToken = '<TOKEN>'; const credential = '${CREDENTIAL}';",
        "function fetch(input) { return input; } fetch('/local-only');",
        "function scoped() { function fetch(input) { return input; } return fetch('/local-only'); }",
        "const importExample = 'import pg from \\\"pg\\\"';",
        "const callExample = 'fetch(\\\"/provider\\\")';",
        "const regexExample = /fetch\\(.*\\)/;",
        "const credentialMetadata = authenticationContext.authorizationProvider.credentialMetadata;",
        "// import React from 'react'; fetch('/ignored');",
        "/* const token = 'ignored'; client.query('SELECT * FROM ignored'); */",
        "export { compared, chosen, password, authToken, credential, scoped, importExample, callExample, regexExample, credentialMetadata };",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(directory, "allowed-nested-fetch.mjs"),
      "function outer(){ function fetch(value){ return value; } function nested(){ return fetch('/local'); } return nested(); } export { outer };",
      "utf8",
    );
    writeFileSync(
      join(directory, "allowed-regex.mjs"),
      "export const fetchPattern = /fetch\\(.*\\)/;",
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
    assert.ok(!violations.some((violation) => violation.file.includes("allowed-")));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
