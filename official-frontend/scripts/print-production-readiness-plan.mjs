#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const envFile = readArg("--env-file") || ".env.production";
const amount = readArg("--amount") || "100";
const currency = readArg("--currency") || "JPY";
const runPlans = args.includes("--run-plans");

const planSteps = [
  {
    title: "1. GitHub source of truth",
    command: ["node", "scripts/print-github-source-plan.mjs"],
    next: "Push the official branch, wait for CI success, then run pnpm run check:github-source.",
  },
  {
    title: "2. Cloudflare variables and secrets",
    command: ["node", "scripts/print-cloudflare-env-plan.mjs", "--env-file", envFile],
    next: "Set dashboard variables and Worker secrets, then run pnpm run check:cloudflare-account.",
  },
  {
    title: "3. Supabase production migrations",
    command: ["node", "scripts/print-supabase-migration-plan.mjs"],
    next: "Apply migrations to staging, then production, and verify required production tables.",
  },
  {
    title: "4. GlobePay merchant dashboard",
    command: ["node", "scripts/print-globepay-dashboard-plan.mjs", "--env-file", envFile],
    next: "Confirm callback URLs, Japan host, WorldPay Recurring, and Hosted 3DS in GlobePay.",
  },
  {
    title: "5. Real payment verification",
    command: [
      "node",
      "scripts/print-payment-verification-plan.mjs",
      "--amount",
      amount,
      "--currency",
      currency,
    ],
    next: "Run one small one-time payment and one hosted-3DS recurring subscription test after deploy.",
  },
];

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] ?? "";
}

function commandText(command) {
  return command.join(" ");
}

function runStep(step) {
  console.log(`\n${step.title}`);
  console.log(`Command: ${commandText(step.command)}`);
  const result = spawnSync(step.command[0], step.command.slice(1), {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.stderr?.trim()) console.error(result.stderr.trim());
  if (result.status !== 0) {
    console.error(
      `Plan step exited with ${result.status}. Continue fixing this step before launch.`,
    );
  }
}

console.log("Buyna.ai production readiness plan");
console.log(
  "This command is non-deploying: it does not push, mutate dashboards, apply migrations, deploy, or charge cards.",
);
console.log(`Production env file for planning: ${envFile}`);
console.log(`Payment verification amount for planning: ${amount} ${currency.toUpperCase()}`);

if (runPlans) {
  console.log("\nRunning all read-only plan commands in order.");
  for (const step of planSteps) runStep(step);
} else {
  console.log("\nRead-only plan commands to run in order:");
  for (const step of planSteps) {
    console.log(`\n${step.title}`);
    console.log(`pnpm run ${scriptNameFor(step.command)}${scriptArgsFor(step.command)}`);
    console.log(`Next: ${step.next}`);
  }
  console.log("\nTo print every sub-plan now, run:");
  console.log(
    `pnpm run production:readiness-plan -- --env-file ${envFile} --amount ${amount} --currency ${currency.toUpperCase()} --run-plans`,
  );
}

console.log("\nFinal external gates after the plan is complete:");
console.log("pnpm run resume:after-access");
console.log("pnpm run prod-evidence:init");
console.log("pnpm run check:prod-evidence");
console.log("pnpm run audit:goal:strict");
console.log(
  "\nThe goal is complete only when the strict audit passes with real current production evidence.",
);

function scriptNameFor(command) {
  const script = command[1] ?? "";
  if (script.includes("github-source")) return "github:source-plan";
  if (script.includes("cloudflare-env")) return "cloudflare:env-plan";
  if (script.includes("supabase-migration")) return "supabase:migration-plan";
  if (script.includes("globepay-dashboard")) return "globepay:dashboard-plan";
  if (script.includes("payment-verification")) return "payment:verification-plan";
  return "(unknown)";
}

function scriptArgsFor(command) {
  const [, , ...rest] = command;
  return rest.length ? ` -- ${rest.join(" ")}` : "";
}
