#!/usr/bin/env node

import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentPath = resolve(projectRoot, "src/content/official-site.ts");
const expectedLanguages = ["zh", "ja", "en"];
const allowedEmptyStringPaths = new Set([
  "officialSiteContentByLanguage.ja.subscribePage.titlePrefix",
]);
const mojibakeFragments = [
  "\uFFFD",
  "\u951F", // 锟
  "\u6D93", // 涓
  "\u95B9", // 閹
  "\u9420", // 鐠
  "\u7F02", // 缂
  "\u5A34", // 娴
  "\u9866", // 顖
];
const failures = [];

function fail(message) {
  failures.push(message);
}

function pathJoin(path, segment) {
  return path ? `${path}.${segment}` : segment;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mustBeNonEmptyString(value, path) {
  if (!value.trim() && !allowedEmptyStringPaths.has(path)) fail(`${path} must not be empty`);
}

function compareShape(reference, candidate, path) {
  if (typeof reference !== typeof candidate) {
    fail(`${path} type mismatch: expected ${typeof reference}, got ${typeof candidate}`);
    return;
  }

  if (typeof reference === "string") {
    mustBeNonEmptyString(candidate, path);
    return;
  }

  if (Array.isArray(reference)) {
    if (!Array.isArray(candidate)) {
      fail(`${path} must be an array`);
      return;
    }

    if (candidate.length !== reference.length) {
      fail(`${path} length mismatch: expected ${reference.length}, got ${candidate.length}`);
    }

    for (let index = 0; index < Math.min(reference.length, candidate.length); index += 1) {
      compareShape(reference[index], candidate[index], `${path}[${index}]`);
    }
    return;
  }

  if (isPlainObject(reference)) {
    if (!isPlainObject(candidate)) {
      fail(`${path} must be an object`);
      return;
    }

    const referenceKeys = Object.keys(reference).sort();
    const candidateKeys = Object.keys(candidate).sort();
    const missing = referenceKeys.filter((key) => !candidateKeys.includes(key));
    const extra = candidateKeys.filter((key) => !referenceKeys.includes(key));

    for (const key of missing) fail(`${pathJoin(path, key)} is missing`);
    for (const key of extra) fail(`${pathJoin(path, key)} is extra`);

    for (const key of referenceKeys.filter((key) => candidateKeys.includes(key))) {
      compareShape(reference[key], candidate[key], pathJoin(path, key));
    }
    return;
  }

  if (reference == null && candidate != null) fail(`${path} must be null`);
}

function collectStrings(value, path = "", strings = []) {
  if (typeof value === "string") {
    strings.push({ path, value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, strings));
  } else if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectStrings(child, pathJoin(path, key), strings);
    }
  }
  return strings;
}

function includesMojibake(value) {
  return mojibakeFragments.some((fragment) => value.includes(fragment));
}

const source = readFileSync(contentPath, "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const languageOptions = mod.officialLanguageOptions ?? [];
const contentByLanguage = mod.officialSiteContentByLanguage ?? {};
const languageCodes = Object.keys(contentByLanguage).sort();

for (const language of expectedLanguages) {
  if (!languageCodes.includes(language)) {
    fail(`officialSiteContentByLanguage.${language} is missing`);
  }
  if (!languageOptions.some((option) => option.code === language)) {
    fail(`officialLanguageOptions must include ${language}`);
  }
}

for (const language of languageCodes.filter((language) => !expectedLanguages.includes(language))) {
  fail(`officialSiteContentByLanguage.${language} is not an expected official language`);
}

for (const option of languageOptions) {
  for (const key of ["code", "label", "shortLabel", "htmlLang", "locale"]) {
    if (typeof option[key] !== "string" || !option[key].trim()) {
      fail(
        `officialLanguageOptions.${option.code ?? "(unknown)"}.${key} must be a non-empty string`,
      );
    }
  }
}

const reference = contentByLanguage.zh;
for (const language of expectedLanguages) {
  const content = contentByLanguage[language];
  if (!content) continue;
  compareShape(reference, content, `officialSiteContentByLanguage.${language}`);

  for (const { path, value } of collectStrings(
    content,
    `officialSiteContentByLanguage.${language}`,
  )) {
    mustBeNonEmptyString(value, path);
    if (includesMojibake(value)) fail(`${path} appears to contain mojibake`);
  }

  const suggestions = content.aiGuide?.suggestions ?? [];
  if (suggestions.length !== 3) {
    fail(`${language}.aiGuide.suggestions must contain exactly 3 prompts`);
  }
}

const planCodes = new Set((mod.homepageSubscriptionPlans ?? []).map((plan) => plan.code));
for (const language of expectedLanguages) {
  const featureCodes = Object.keys(contentByLanguage[language]?.subscriptionPlanFeatures ?? {});
  for (const code of planCodes) {
    if (!featureCodes.includes(code)) {
      fail(`${language}.subscriptionPlanFeatures.${code} is missing`);
    }
  }
}

console.log("Buyna.ai official content check");
console.log(`Languages: ${expectedLanguages.join(", ")}`);

if (failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("OK: multilingual official-site content is structurally complete.");
