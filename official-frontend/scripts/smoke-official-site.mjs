#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const failures = [];
const serverLogs = [];
let serverProcess;

const text = {
  aiMessage: "\u6211\u60f3\u5f00\u4e00\u5bb6\u5b98\u7f51",
  aiNotConfigured: "\u6682\u672a\u914d\u7f6e",
  aiTitle: "Buyna.ai AI \u8d2d\u7269\u5bfc\u8d2d",
  aiWelcome: "\u4f60\u597d\uff0c\u6211\u662f Buyna.ai AI \u8d2d\u7269\u5bfc\u8d2d",
  ecosystem: "Buyna.ai \u751f\u6001\u7cfb\u7edf",
  hero: "\u7f51\u7ad9\u4e00\u7ad9\u5f0f\u652f\u4ed8\u89e3\u51b3\u65b9\u6848",
  loading: "\u52a0\u8f7d\u4e2d",
  paymentConfirming: "\u6b63\u5728\u786e\u8ba4\u652f\u4ed8\u7ed3\u679c",
  pricing: "\u9009\u62e9\u9002\u5408\u4f60\u7684\u5957\u9910",
  subscribe: "\u5f00\u901a\u8ba2\u9605",
  subscriptionConfirming: "\u6b63\u5728\u786e\u8ba4\u8ba2\u9605\u6388\u6743",
};

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function aiMode() {
  const mode = argValue("--ai-mode", argValue("--base-url", "") ? "optional" : "not-configured");
  if (["not-configured", "optional", "skip"].includes(mode)) return mode;
  failures.push(`Unsupported --ai-mode value: ${mode}`);
  return "not-configured";
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function rememberLog(chunk) {
  const logText = chunk.toString();
  for (const line of logText.split(/\r?\n/).filter(Boolean)) {
    serverLogs.push(line);
    if (serverLogs.length > 120) serverLogs.shift();
  }
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function urlFor(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

async function canListen(port) {
  return new Promise((resolveCanListen) => {
    const server = createServer();
    server.once("error", () => resolveCanListen(false));
    server.once("listening", () => {
      server.close(() => resolveCanListen(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findFreePort(start) {
  for (let port = start; port < start + 40; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`Unable to find a free localhost port near ${start}`);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (serverProcess?.exitCode != null) break;
    try {
      const response = await fetchWithTimeout(urlFor(baseUrl, "/"), {}, 2500);
      if (response.status >= 200 && response.status < 500) return;
    } catch {
      // Keep polling until the dev server is ready or exits.
    }
    await sleep(750);
  }

  const tail = serverLogs.slice(-30).join("\n");
  throw new Error(`Local dev server did not become ready.\n${tail}`);
}

function viteCommandArgs() {
  const viteBin = resolve(projectRoot, "node_modules/vite/bin/vite.js");
  if (!existsSync(viteBin)) {
    throw new Error("Vite is not installed. Run `pnpm install` inside official-frontend first.");
  }

  return {
    command: process.execPath,
    args: [viteBin, "dev", "--host", "127.0.0.1", "--port"],
  };
}

async function startServer() {
  const preferredPort = Number.parseInt(argValue("--port", "8091"), 10) || 8091;
  const port = await findFreePort(preferredPort);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const { command, args: commandArgs } = viteCommandArgs();

  serverProcess = spawn(command, [...commandArgs, String(port), "--strictPort"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      LOVABLE_API_KEY: "",
      OPENAI_API_KEY: "",
      SUPABASE_URL: "",
      SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_ANON_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverProcess.stdout.on("data", rememberLog);
  serverProcess.stderr.on("data", rememberLog);

  await waitForServer(baseUrl);
  return baseUrl;
}

function stopServer() {
  if (!serverProcess || serverProcess.exitCode != null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    serverProcess.kill("SIGTERM");
  }
}

async function checkPage(baseUrl, path, expectedText) {
  const response = await fetchWithTimeout(urlFor(baseUrl, path));
  check(response.ok, `${path} must return HTTP 2xx, got ${response.status}`);
  const pageText = await response.text();
  for (const expected of expectedText) {
    check(pageText.includes(expected), `${path} must include "${expected}"`);
  }
}

async function checkAiGuide(baseUrl, mode) {
  if (mode === "skip") return;

  const response = await fetchWithTimeout(urlFor(baseUrl, "/api/ai-shopping-guide"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session_id: "smoke-local",
      message: text.aiMessage,
      history: [],
    }),
  });
  check(response.ok, `/api/ai-shopping-guide must return HTTP 2xx, got ${response.status}`);
  const payload = await response.json();
  check(
    typeof payload.configured === "boolean",
    "AI guide response must include a configured boolean",
  );
  check(typeof payload.answer === "string", "AI guide response must include an answer string");
  check(
    Array.isArray(payload.recommendations),
    "AI guide response must include a recommendations array",
  );

  if (mode === "optional" && payload.configured === true) return;

  check(
    payload.configured === false,
    "AI guide must gracefully report configured=false without keys",
  );
  check(
    String(payload.answer ?? "").includes(text.aiNotConfigured),
    "AI guide not-configured response must be readable Chinese",
  );
  check(
    Array.isArray(payload.recommendations) && payload.recommendations.length === 0,
    "AI guide not-configured response must return an empty recommendations array",
  );
}

if (hasFlag("--help") || hasFlag("-h")) {
  console.log(`Buyna.ai official site smoke check

Usage:
  pnpm run smoke:local
  pnpm run smoke:local -- --base-url http://127.0.0.1:8080/
  pnpm run smoke:url -- --base-url https://www.buyna.ai/

Options:
  --base-url <url>  Reuse an already running local server instead of starting one.
  --ai-mode <mode>  AI check mode: not-configured, optional, or skip.
  --port <port>     Preferred local port when starting a server. Defaults to 8091.
`);
  process.exit(0);
}

const providedBaseUrl = argValue("--base-url", "");
const baseUrl = providedBaseUrl || (await startServer());
const selectedAiMode = aiMode();

try {
  console.log("Buyna.ai official site smoke check");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`AI mode: ${selectedAiMode}`);

  await checkPage(baseUrl, "/", [text.hero, text.ecosystem, text.aiTitle, text.aiWelcome]);
  await checkPage(baseUrl, "/pricing", [text.pricing]);
  await checkPage(baseUrl, "/subscribe/basic", [text.subscribe, text.loading]);
  await checkPage(baseUrl, "/subscription/return", [text.subscriptionConfirming]);
  await checkPage(baseUrl, "/payment/success", [text.paymentConfirming]);
  await checkAiGuide(baseUrl, selectedAiMode);

  if (failures.length) {
    console.error("\nFailures:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("\nOK: official site smoke checks passed.");
  }
} finally {
  if (!providedBaseUrl) stopServer();
}
