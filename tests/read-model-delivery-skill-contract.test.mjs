import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Dashboard Skill and adapter contracts preserve fixed behavior and project-owned presentation", async () => {
  const [skill, readModel, delivery] = await Promise.all([
    read("skills/buyai-dashboard-data-interaction/SKILL.md"),
    read("skills/buyai-dashboard-data-interaction/references/commerce-read-model-adapter-contract.md"),
    read("skills/buyai-dashboard-data-interaction/references/delivery-state-adapter-contract.md"),
  ]);
  assert.match(skill, /commerce-read-model-adapter-contract\.md/);
  assert.match(skill, /delivery-state-adapter-contract\.md/);
  assert.match(skill, /auth[\s\S]*merchant context[\s\S]*(read model|delivery)[\s\S]*(presentation|provider)/i);
  assert.match(skill, /overview[\s\S]*buyna-commerce-read-model-core/i);
  assert.match(skill, /explicit[\s\S]*approved[\s\S]*(order|booking)[\s\S]*notification/i);
  assert.match(skill, /(inventory|order|booking|customer)[\s\S]*(existing|fixed)[\s\S]*(service|core)/i);

  for (const key of ["pendingOrders", "paidOrders", "refundedOrders", "pendingAmount", "grossAmount", "refundAmount", "netAmount", "lowStock", "recentOrders", "trends"]) assert.match(readModel, new RegExp(`\\b${key}\\b`));
  assert.match(readModel, /inclusive start[\s\S]*exclusive end/i);
  assert.match(readModel, /IANA[\s\S]*(day|month)/i);
  assert.match(readModel, /200[\s\S]*(page|rows)/i);
  assert.match(readModel, /(cursor|order)[\s\S]*valid/i);
  assert.match(readModel, /(SQL|ORM)[\s\S]*(project|Adapter)/i);
  assert.match(readModel, /ChartAdapter[\s\S]*toProjectChartSeries/i);
  assert.match(readModel, /(browser|client)[\s\S]*(not|never)[\s\S]*(status|amount)/i);
  assert.match(readModel, /(provider-verified|trusted settlement)/i);
  assert.match(readModel, /CRM GMV[\s\S]*(prohibited|never|must not)/i);

  for (const method of ["transaction", "getDelivery", "getBySourceEventForUpdate", "createDelivery", "getDeliveryForUpdate", "saveDelivery"]) assert.match(delivery, new RegExp(`\\b${method}\\b`));
  assert.match(delivery, /RecipientAdapter[\s\S]*TemplateAdapter[\s\S]*(Email|Sms|SMS).*Adapter/is);
  assert.match(delivery, /(requestKey|request key)[\s\S]*(attempt|retry)[\s\S]*(lease|recovery)/i);
  assert.match(delivery, /(safe|allowlist|redact)[\s\S]*(receipt|provider)/i);
  assert.match(delivery, /(Store|transaction|OCC|save)[\s\S]*(propagate|leave)[\s\S]*sending/i);
  assert.match(delivery, /(source event|sourceEventId)[\s\S]*(transaction|outbox)[\s\S]*(reconcile|restart)/i);
});

test("child Skills call fixed state while frontend generates all visual design", async () => {
  const [product, booking, frontend, operations] = await Promise.all([
    read("skills/buyai-product-merchant-backend/SKILL.md"),
    read("skills/buyai-booking-service-backend/SKILL.md"),
    read("skills/buyna-frontend-builder/SKILL.md"),
    read("skills/buyna-skill-operations/SKILL.md"),
  ]);
  for (const skill of [product, booking]) {
    assert.match(skill, /buyna-delivery-state-core/);
    assert.match(skill, /(immutable|transactional)[\s\S]*(source event|outbox)/i);
    assert.match(skill, /(reconciler|reconciliation)[\s\S]*(dispatch|delivery)/i);
    assert.match(skill, /notification failure[\s\S]*(does not|never)[\s\S]*(order|booking|payment)[\s\S]*(success|status)/i);
  }
  assert.match(booking, /only when[\s\S]*authoritative[\s\S]*persisted[\s\S]*`booking_notification`[\s\S]*route/i);
  assert.doesNotMatch(booking, /approved inquiry or/i);
  for (const item of ["chart", "component", "message copy", "label", "color", "font", "spacing", "responsive", "CSS"]) assert.match(frontend, new RegExp(item, "i"));
  assert.match(frontend, /(generate|project-owned)[\s\S]*(chart|component|CSS)/i);
  assert.match(operations, /buyna-commerce-read-model-core/);
  assert.match(operations, /buyna-delivery-state-core/);
});

test("Builder is the single authoritative route without fixed UI, vendor, schema, or CRM GMV leakage", async () => {
  const paths = [
    "skills/buyna-website-builder/SKILL.md",
    "skills/buyna-website-builder/references/routing-map.md",
    "skills/buyna-website-builder/references/phase-05-dashboard-integration.md",
    "skills/buyai-dashboard-data-interaction/SKILL.md",
    "skills/buyai-product-merchant-backend/SKILL.md",
    "skills/buyai-booking-service-backend/SKILL.md",
    "skills/buyna-frontend-builder/SKILL.md",
  ];
  const text = (await Promise.all(paths.map(read))).join("\n");
  assert.match(text, /setApprovedNotificationOperations/);
  assert.match(text, /notificationOperation[\s\S]*(persisted|approved)/i);
  assert.match(text, /buyna-commerce-read-model-core/);
  assert.match(text, /buyna-delivery-state-core/);
  assert.match(text, /(single(?: team)? entrypoint|only entrypoint)/i);
  assert.match(text, /(no repeated confirmation|without repeated confirmation|does not repeat approval)/i);
  assert.doesNotMatch(text, /(fixed Dashboard shell|required chart library|fixed template text|required (email|SMS) vendor|provider account|SQL schema name|required ORM)/i);
  assert.doesNotMatch(text, /(?:label|display|show)[^\n]{0,50}(?:gross|refund|net)[^\n]{0,50}\bGMV\b/i);
});

test("canonical Builder copy remains byte-identical", async () => {
  const files = [
    "SKILL.md", "agents/openai.yaml", "references/routing-map.md",
    "references/phase-05-dashboard-integration.md", "references/workflow-state-contract.md",
    "scripts/route-builder.mjs",
  ];
  for (const file of files) {
    assert.equal(
      await read(`skills/buyna-website-builder/${file}`),
      await read(`.agents/skills/buyna-website-builder/${file}`),
      file,
    );
  }
});
