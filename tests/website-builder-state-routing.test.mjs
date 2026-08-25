import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const skillPaths = [
  "skills/buyna-website-builder/SKILL.md",
  "skills/buyai-checkout-address-ux/SKILL.md",
  "skills/buyai-product-merchant-backend/SKILL.md",
  "skills/buyai-globepay-payment/SKILL.md",
  "skills/buyai-globepay-status-sync/SKILL.md",
  "skills/buyna-skill-operations/SKILL.md",
];

const frontmatterDescription = (path) => {
  const match = read(path).match(/^---\r?\n[\s\S]*?^description:\s*["']?([^\r\n"']+)["']?\s*$[\s\S]*?^---$/m);
  assert.ok(match, `${path} has a readable description`);
  return match[1];
};

const section = (document, heading) => {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.match(new RegExp(`^### ${escapedHeading}\\s*$([\\s\\S]*?)(?=^### |^## |(?![\\s\\S]))`, "mi"));
  assert.ok(match, `routing map defines ${heading}`);
  return match[1];
};

test("modified Skills expose request-focused discovery triggers", () => {
  for (const path of skillPaths) {
    const description = frontmatterDescription(path);
    assert.match(description, /^Use when\b/i, `${path} describes when it applies`);
    assert.doesNotMatch(description, /\b(?:guide|route|workflow|steps?)\b/i, `${path} does not summarize its procedure`);
  }
});

test("website builder performs capability and manifest routing before project generation", () => {
  const builder = read("skills/buyna-website-builder/SKILL.md");
  const orderedContracts = [
    /determine (?:the )?capabilities/i,
    /routing-map\.md/i,
    /repository-manifest\.json/i,
    /generate only project (?:Adapters|adapters), configuration, and presentation/i,
    /minimum (?:applicable )?tests/i,
    /approved work package/i,
  ];

  let cursor = 0;
  for (const contract of orderedContracts) {
    const match = contract.exec(builder.slice(cursor));
    assert.ok(match, `routing recipe contains ${contract}`);
    cursor += match.index + match[0].length;
  }
});

test("static preview selects frontend presentation and skips commerce", () => {
  const route = section(read("skills/buyna-website-builder/references/routing-map.md"), "Static showcase");
  assert.match(route, /buyna-frontend-builder/i);
  assert.match(route, /checkout_payment.*NOT_APPLICABLE/is);
  assert.match(route, /dashboard_backend.*NOT_APPLICABLE/is);
  assert.doesNotMatch(route, /buyai-globepay-payment|buyna-checkout-flow-core|buyna-commerce-settlement-core/i);
});

test("product commerce without payment selects cart and order but skips payment", () => {
  const route = section(read("skills/buyna-website-builder/references/routing-map.md"), "Product commerce without payment");
  assert.match(route, /buyai-product-merchant-backend/i);
  assert.match(route, /buyna-cart-core/i);
  assert.match(route, /buyna-order-core/i);
  assert.match(route, /checkout_payment.*NOT_APPLICABLE/is);
  assert.doesNotMatch(route, /buyai-globepay-payment|buyna-checkout-flow-core|buyna-commerce-settlement-core/i);
});

test("payment-capable product commerce reuses checkout and settlement state cores", () => {
  const route = section(read("skills/buyna-website-builder/references/routing-map.md"), "Product commerce with GlobePay");
  for (const required of [
    "buyai-checkout-address-ux",
    "buyai-globepay-payment",
    "buyai-globepay-status-sync",
    "buyna-gmv-commerce",
    "buyna-checkout-flow-core",
    "buyna-commerce-settlement-core",
  ]) {
    assert.match(route, new RegExp(required), `${required} is routed`);
  }
  assert.match(route, /project (?:Adapters|adapters).*presentation/is);
});

test("dependency-ready checkout repair imports evidence and routes directly", () => {
  const route = section(read("skills/buyna-website-builder/references/routing-map.md"), "Dependency-ready checkout repair");
  assert.match(route, /import.*delivery evidence|delivery evidence.*import/is);
  assert.match(route, /checkout_payment/i);
  assert.match(route, /buyna-checkout-flow-core/i);
  assert.match(route, /buyna-commerce-settlement-core/i);
  assert.match(route, /direct/i);
  assert.doesNotMatch(route, /route:\s*customer_intake|route:\s*design_and_structure/i);
});

test("domain Skills preserve fixed behavior and project-generated presentation", () => {
  const checkout = read("skills/buyai-checkout-address-ux/SKILL.md");
  const product = read("skills/buyai-product-merchant-backend/SKILL.md");
  const payment = read("skills/buyai-globepay-payment/SKILL.md");
  const status = read("skills/buyai-globepay-status-sync/SKILL.md");

  assert.match(checkout, /buyna-checkout-flow-core/);
  assert.match(checkout, /minimum.*fields.*payment method.*order review.*order_locked/is);
  assert.match(product, /buyna-checkout-flow-core/);
  assert.match(product, /buyna-commerce-settlement-core/);
  assert.match(payment, /buyna-checkout-flow-core/);
  assert.match(payment, /buyna-commerce-settlement-core/);
  assert.match(status, /buyna-commerce-settlement-core/);

  for (const document of [checkout, product, payment, status]) {
    assert.match(document, /project.{0,40}(?:Adapter|Adapters|configuration|presentation)/is);
  }
});

test("approved packages continue and local preview stays local", () => {
  const builder = read("skills/buyna-website-builder/SKILL.md");
  const prompt = read("skills/buyna-website-builder/agents/openai.yaml");

  for (const document of [builder, prompt]) {
    assert.match(document, /approved bounded work package|bounded.*work package/i);
    assert.match(document, /continue.*without.*(?:repeated|another).*confirmation|continue.*included.*gate/is);
  }

  assert.match(builder, /local preview.*current (?:checkout|worktree|project)/i);
  assert.match(builder, /GitHub.*only when.*(?:publish|contribution|repository)/is);
  assert.match(builder, /AWS.*only when.*(?:release|deploy|infrastructure)/is);
});

test("complete installation discovers the new checkout and settlement modules", () => {
  const operations = read("skills/buyna-skill-operations/SKILL.md");
  assert.match(operations, /buyna-checkout-flow-core/);
  assert.match(operations, /buyna-commerce-settlement-core/);
  assert.match(operations, /repository-manifest\.json/);
});

test("project Builder is synchronized with the canonical Builder", () => {
  const builderFiles = [
    "SKILL.md",
    "agents/openai.yaml",
    "references/routing-map.md",
    "references/phase-06-payment.md",
  ];

  for (const path of builderFiles) {
    assert.equal(
      read(`.agents/skills/buyna-website-builder/${path}`),
      read(`skills/buyna-website-builder/${path}`),
      `${path} matches the canonical Builder`,
    );
  }
});
