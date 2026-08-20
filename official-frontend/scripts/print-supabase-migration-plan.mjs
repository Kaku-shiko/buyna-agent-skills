#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(projectRoot, "supabase/migrations");
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const requiredTables = [
  "ai_guide_sources",
  "ai_guide_conversations",
  "subscription_plans",
  "buyna_customers",
  "buyna_subscriptions",
  "buyna_subscription_charges",
  "globepay_recurring_agreements",
];

function walkFiles(start, predicate = () => true) {
  if (!existsSync(start)) return [];
  const found = [];
  const stack = [start];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) stack.push(full);
      else if (predicate(full)) found.push(full);
    }
  }
  return found.sort();
}

function rel(path) {
  return relative(projectRoot, path).replaceAll("\\", "/");
}

const migrationFiles = walkFiles(migrationsDir, (path) => path.endsWith(".sql"));
const combinedSql = migrationFiles.map((path) => readFileSync(path, "utf8")).join("\n");
const missingTables = requiredTables.filter((table) => !combinedSql.includes(table));

console.log("Buyna.ai Supabase production migration plan");
console.log("This command is read-only: it does not connect to Supabase or apply migrations.");

console.log("\nMigration files to apply in order:");
for (const file of migrationFiles) {
  console.log(`- ${rel(file)}`);
}

console.log("\nRequired production tables to verify after migration:");
for (const table of requiredTables) {
  const present = combinedSql.includes(table);
  console.log(`- [${present ? "OK" : "MISSING"}] ${table}`);
}

console.log("\nRecommended order after Supabase access is available:");
console.log("1. Review every file listed above.");
console.log("2. Apply all migrations to staging first.");
console.log("3. Verify the required tables in staging.");
console.log("4. Apply the same migrations to production.");
console.log("5. Verify the required tables in production before taking payments.");
console.log(
  "6. Record applied migration filenames and verified tables in .production-evidence.json.",
);
console.log("7. Run pnpm run check:prod-evidence, then pnpm run audit:goal:strict.");

console.log("\nSQL table verification helper:");
console.log("select table_name");
console.log("from information_schema.tables");
console.log("where table_schema = 'public'");
console.log("  and table_name in (");
for (const [index, table] of requiredTables.entries()) {
  const comma = index === requiredTables.length - 1 ? "" : ",";
  console.log(`    '${table}'${comma}`);
}
console.log("  )");
console.log("order by table_name;");

if (strict && (migrationFiles.length === 0 || missingTables.length > 0)) {
  console.error("\nMissing migration coverage:");
  if (migrationFiles.length === 0) console.error("- No migration SQL files were found.");
  for (const table of missingTables) console.error(`- ${table}`);
  process.exit(1);
}
