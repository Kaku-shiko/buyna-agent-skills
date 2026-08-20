#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { openSync } from "node:fs";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args[0] : "start";
const port = Number(readArg("--port") || "8080");
const host = readArg("--host") || "127.0.0.1";
const url = `http://${host}:${port}/`;
const stdoutLog = ".local-preview.out.log";
const stderrLog = ".local-preview.err.log";

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] ?? "";
}

function run(commandName, commandArgs, options = {}) {
  const result = spawnSync(commandName, commandArgs, {
    cwd: options.cwd ?? projectRoot,
    encoding: "utf8",
    shell: options.shell ?? process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
}

function previewProcesses() {
  if (process.platform !== "win32") {
    const result = run("sh", [
      "-c",
      "ps -eo pid=,command= | grep 'vite' | grep 'dev' | grep 'official-frontend' | grep -v grep | grep -v 'local-preview.mjs'",
    ]);
    return result.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(.*)$/);
        return match ? { pid: Number(match[1]), commandLine: match[2] } : null;
      })
      .filter(Boolean);
  }

  const ps = [
    "$ErrorActionPreference = 'SilentlyContinue';",
    "Get-CimInstance Win32_Process |",
    "Where-Object {",
    "$_.CommandLine -like '*official-frontend*' -and",
    "$_.CommandLine -like '*vite*' -and",
    "$_.CommandLine -like '*dev*' -and",
    "$_.CommandLine -notlike '*Get-CimInstance Win32_Process*' -and",
    "$_.CommandLine -notlike '*local-preview.mjs*'",
    "} | ForEach-Object {",
    'Write-Output ($_.ProcessId.ToString() + "`t" + $_.CommandLine)',
    "}",
  ].join(" ");

  const result = run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
    shell: false,
  });

  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pidText, ...rest] = line.split("\t");
      return { pid: Number(pidText), commandLine: rest.join("\t") };
    })
    .filter((processInfo) => Number.isFinite(processInfo.pid));
}

function stopProcesses() {
  const processes = previewProcesses();
  for (const processInfo of processes) {
    try {
      process.kill(processInfo.pid);
    } catch {
      // Ignore races where the dev server exits between discovery and stop.
    }
  }
  return processes;
}

function waitForUrl(timeoutMs = 20000) {
  const startedAt = Date.now();

  return new Promise((resolveReady) => {
    function attempt() {
      const request = http.get(url, (response) => {
        response.resume();
        resolveReady(
          response.statusCode && response.statusCode >= 200 && response.statusCode < 500,
        );
      });

      request.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          resolveReady(false);
        } else {
          setTimeout(attempt, 500);
        }
      });

      request.setTimeout(2000, () => {
        request.destroy();
      });
    }

    attempt();
  });
}

async function printStatus() {
  const ready = await waitForUrl(1000);
  const processes = previewProcesses();
  console.log("Buyna.ai local preview status");
  console.log(`URL: ${url}`);
  console.log(`Reachable: ${ready ? "yes" : "no"}`);
  console.log(`Processes: ${processes.length}`);
  for (const processInfo of processes) {
    console.log(`- ${processInfo.pid}: ${processInfo.commandLine}`);
  }
}

async function startPreview() {
  if (args.includes("--restart")) {
    const stopped = stopProcesses();
    if (stopped.length) console.log(`Stopped ${stopped.length} existing preview process(es).`);
  } else if (await waitForUrl(1000)) {
    console.log(`Local preview is already reachable: ${url}`);
    return;
  }

  const out = openSync(resolve(projectRoot, stdoutLog), "a");
  const err = openSync(resolve(projectRoot, stderrLog), "a");
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(
    pnpm,
    ["exec", "vite", "dev", "--host", host, "--port", String(port), "--strictPort"],
    {
      cwd: projectRoot,
      detached: true,
      shell: process.platform === "win32",
      stdio: ["ignore", out, err],
      windowsHide: true,
    },
  );

  child.unref();

  const ready = await waitForUrl(60000);
  console.log(`Started local preview process: ${child.pid}`);
  console.log(`URL: ${url}`);
  console.log(`Logs: ${stdoutLog}, ${stderrLog}`);

  if (!ready) {
    console.error("Local preview did not become reachable before the timeout.");
    console.error("Run pnpm run preview:local:status or inspect the log files.");
    process.exit(1);
  }
}

if (command === "status") {
  await printStatus();
} else if (command === "stop") {
  const stopped = stopProcesses();
  console.log(`Stopped ${stopped.length} local preview process(es).`);
} else if (command === "start") {
  await startPreview();
} else {
  console.error(`Unknown local preview command: ${command}`);
  console.error("Use: start, status, or stop.");
  process.exit(1);
}
