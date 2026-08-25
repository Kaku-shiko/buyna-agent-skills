import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";

const root = new URL("../", import.meta.url);
const rootPath = decodeURIComponent(root.pathname.replace(/^\/(?:([A-Za-z]:))/, "$1"));
const decisionPath = new URL(
  "docs/architecture/storefront-gallery-module-decision.md",
  root,
);
const manifest = JSON.parse(
  readFileSync(new URL("repository-manifest.json", root), "utf8"),
);

const expectedRecord = {
  decision: "defer",
  failedCriterion: "INSUFFICIENT_REAL_CONSUMERS",
  runnableConsumers: 0,
  candidateInvariants: [
    "index_bounds",
    "open_close",
    "previous_next",
    "escape_close",
    "focus_return",
    "reduced_motion",
  ],
  deletionExercise: {
    possible: false,
    reason: "NO_TWO_CONSUMER_TEST_SUITES",
    failedAssertions: [],
  },
  nonConsumers: [
    {
      path: "packages/buyna-workflow-state-core/src/index.mjs",
      reason: "workflow_gate_index",
    },
    {
      path: "tests/website-builder-state-routing.test.mjs",
      reason: "workflow_gate_index",
    },
    {
      path: "tests/merchant-commerce-lifecycle-routing.test.mjs",
      reason: "workflow_gate_index",
    },
    {
      path: "tests/supporting-interaction-skill-contract.test.mjs",
      reason: "generated_presentation_boundary_test",
    },
    {
      path: "tests/supporting-interaction-state-routing.test.mjs",
      reason: "deferred_module_route_assertion",
    },
  ],
  forbiddenImportsChecked: true,
  visualFiles: [],
};

const boundedRoots = ["packages", "tests"];
const ignoredTest = "tests/storefront-gallery-module-decision.test.mjs";
const pattern = /gallery|lightbox|carousel|currentIndex|returnFocus|reducedMotion/i;

function listFiles(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") return [];
      return listFiles(child);
    }
    return entry.isFile() ? [child] : [];
  });
}

function boundedConsumerMatches() {
  return boundedRoots.flatMap((path) => listFiles(join(rootPath, path)))
    .map((path) => ({
      path,
      relativePath: relative(rootPath, path).replaceAll("\\", "/"),
    }))
    .filter(({ relativePath }) => relativePath !== ignoredTest)
    .flatMap(({ path, relativePath }) => {
      const lines = readFileSync(path, "utf8").split(/\r?\n/);
      return lines.flatMap((line, index) => pattern.test(line)
        ? [{ path: relativePath, line: index + 1 }]
        : []);
    });
}

function parseDecisionRecord() {
  const markdown = readFileSync(decisionPath, "utf8");
  const records = [...markdown.matchAll(/```json decision-record\s*([\s\S]*?)```/g)];
  assert.equal(records.length, 1, "expected exactly one json decision-record block");
  return JSON.parse(records[0][1]);
}

test("records an evidence-backed gallery defer decision", () => {
  assert.ok(existsSync(decisionPath), "missing gallery module decision record");
  const record = parseDecisionRecord();
  assert.deepEqual(record, expectedRecord);

  const matchedPaths = [...new Set(boundedConsumerMatches().map(({ path }) => path))].sort();
  const classifiedPaths = record.nonConsumers.map(({ path }) => path).sort();
  assert.deepEqual(
    matchedPaths,
    classifiedPaths,
    "every bounded scan match must be explicitly classified",
  );
});

test("keeps the deferred package out of disk, manifest, and website-builder profile", () => {
  const packageName = "buyna-storefront-gallery-core";
  assert.equal(
    existsSync(new URL(`packages/${packageName}/`, root)),
    false,
    "deferred gallery package must not exist",
  );
  assert.ok(!manifest.packages.includes(packageName));
  assert.ok(!manifest.profiles["website-builder"].packages.includes(packageName));
  const routeBuilder = readFileSync(
    new URL("skills/buyna-website-builder/scripts/route-builder.mjs", root),
    "utf8",
  );
  assert.ok(
    !routeBuilder.includes(packageName),
    "Builder route must not select the deferred gallery package",
  );
});

test("adds no visual implementation files for the deferred module", () => {
  const visualExtensions = new Set([
    ".css", ".scss", ".sass", ".less", ".jsx", ".tsx",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ]);
  const record = parseDecisionRecord();
  const visualFiles = boundedRoots.flatMap((path) => listFiles(join(rootPath, path)))
    .map((path) => relative(rootPath, path).replaceAll("\\", "/"))
    .filter((path) => path.includes("gallery") && visualExtensions.has(extname(path)));
  assert.deepEqual(record.visualFiles, []);
  assert.deepEqual(visualFiles, []);
});
