#!/usr/bin/env node

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_EVIDENCE_FILE, validateProductionEvidence } from "./production-evidence-rules.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

const evidenceFile = argValue("--evidence-file", DEFAULT_EVIDENCE_FILE);
const json = args.includes("--json");

const result = validateProductionEvidence({ projectRoot, evidenceFile });

if (json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

console.log("Buyna.ai production evidence check");
console.log(`Evidence file: ${evidenceFile}`);

if (!result.exists) {
  console.error("\nFailures:");
  for (const failure of result.failures) console.error(`- ${failure}`);
  console.error(
    "\nRun pnpm run prod-evidence:init after production deploy, then fill real non-secret proof.",
  );
  process.exit(1);
}

const passed = result.checks.filter((check) => check.ok);
const failed = result.checks.filter((check) => !check.ok);

if (passed.length) {
  console.log(`\nPROVED (${passed.length})`);
  for (const check of passed) console.log(`- ${check.area}: ${check.evidence}`);
}

if (failed.length || result.failures.length) {
  console.error(`\nMISSING OR INVALID (${failed.length + result.failures.length})`);
  for (const failure of result.failures) console.error(`- ${failure}`);
  for (const check of failed) {
    console.error(`- ${check.area}: ${check.evidence}`);
    console.error(`  Next: ${check.next}`);
  }
  process.exit(1);
}

console.log("\nOK: production evidence proves the external launch gates.");
