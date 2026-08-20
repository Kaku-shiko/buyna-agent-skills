#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(projectRoot, "..");
const args = process.argv.slice(2);
const json = args.includes("--json");

const failures = [];
const warnings = [];
const proof = {};

function run(command, commandArgs, options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, commandArgs, {
        cwd: options.cwd ?? repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.toString?.().trim?.() ?? "",
      stderr: error.stderr?.toString?.().trim?.() ?? "",
      status: error.status,
    };
  }
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function githubHttpsRemote(url) {
  if (!url) return "";
  const trimmed = url.trim();
  const ssh = trimmed.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (ssh) return `https://github.com/${ssh[1]}`;
  const https = trimmed.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/i);
  if (https) return `https://github.com/${https[1]}`;
  return "";
}

const currentBranch = run("git", ["branch", "--show-current"]);
const currentCommit = run("git", ["rev-parse", "HEAD"]);
const remoteUrl = run("git", ["remote", "get-url", "origin"]);

proof.branch = currentBranch.stdout;
proof.commitSha = currentCommit.stdout;
proof.remoteUrl = githubHttpsRemote(remoteUrl.stdout);

if (!currentBranch.ok || !currentBranch.stdout) {
  fail("Current branch could not be detected.");
}

if (!currentCommit.ok || !/^[0-9a-f]{40}$/i.test(currentCommit.stdout)) {
  fail("Current commit SHA could not be detected.");
}

if (!remoteUrl.ok || !remoteUrl.stdout) {
  fail("No origin remote is configured. Add the production GitHub repository as origin.");
} else if (!proof.remoteUrl) {
  fail(`origin is not a GitHub remote: ${remoteUrl.stdout}`);
}

const ghVersion = run("gh", ["--version"]);
if (!ghVersion.ok) {
  fail("GitHub CLI gh is not installed or not on PATH.");
} else {
  proof.ghVersion = ghVersion.stdout.split(/\r?\n/)[0];
}

const ghAuth = ghVersion.ok ? run("gh", ["auth", "status"]) : { ok: false };
if (ghVersion.ok && !ghAuth.ok) {
  fail("GitHub CLI gh is installed but not authenticated. Run gh auth login.");
}

if (proof.remoteUrl && currentBranch.stdout) {
  const remoteHead = run("git", ["ls-remote", "origin", `refs/heads/${currentBranch.stdout}`]);
  if (!remoteHead.ok || !remoteHead.stdout) {
    fail(`Remote branch origin/${currentBranch.stdout} does not exist yet.`);
  } else {
    const [remoteCommit] = remoteHead.stdout.split(/\s+/);
    proof.remoteBranchCommitSha = remoteCommit;
    if (remoteCommit !== currentCommit.stdout) {
      fail(
        `origin/${currentBranch.stdout} points to ${remoteCommit}, not current commit ${currentCommit.stdout}.`,
      );
    }
  }
}

if (ghVersion.ok && ghAuth.ok && proof.remoteUrl && currentBranch.stdout) {
  const ci = run("gh", [
    "run",
    "list",
    "--branch",
    currentBranch.stdout,
    "--limit",
    "1",
    "--json",
    "databaseId,status,conclusion,url,headSha",
  ]);

  if (!ci.ok) {
    warn("Could not read GitHub Actions run status with gh run list.");
  } else {
    try {
      const runs = JSON.parse(ci.stdout || "[]");
      const latest = runs[0];
      if (!latest) {
        fail(`No GitHub Actions run found for branch ${currentBranch.stdout}.`);
      } else {
        proof.ciRunUrl = latest.url;
        proof.ciStatus = latest.conclusion || latest.status;
        proof.ciHeadSha = latest.headSha;
        if (latest.headSha !== currentCommit.stdout) {
          fail(
            `Latest CI run is for ${latest.headSha}, not current commit ${currentCommit.stdout}.`,
          );
        }
        if (latest.conclusion !== "success") {
          fail(`Latest CI conclusion is ${latest.conclusion || latest.status}, not success.`);
        }
      }
    } catch {
      warn("Could not parse GitHub Actions run list output.");
    }
  }
}

if (json) {
  console.log(JSON.stringify({ ok: failures.length === 0, proof, warnings, failures }, null, 2));
  process.exit(failures.length ? 1 : 0);
}

console.log("Buyna.ai GitHub source-of-truth check");

if (Object.keys(proof).length) {
  console.log("\nProof:");
  for (const [key, value] of Object.entries(proof)) {
    if (value) console.log(`- ${key}: ${value}`);
  }
}

if (warnings.length) {
  console.log("\nWarnings:");
  for (const message of warnings) console.log(`- ${message}`);
}

if (failures.length) {
  console.error("\nMissing:");
  for (const message of failures) console.error(`- ${message}`);
  console.error("\nNext:");
  console.error("- Install GitHub CLI: winget install --id GitHub.cli");
  console.error("- Authenticate: gh auth login");
  console.error("- Add origin: git remote add origin git@github.com:OWNER/REPOSITORY.git");
  console.error(`- Push: git push -u origin ${proof.branch || "codex/official-frontend-source"}`);
  console.error("- Wait for CI success, then run pnpm run check:github-source again.");
  process.exit(1);
}

console.log("\nOK: current official frontend commit is pushed to GitHub and CI succeeded.");
