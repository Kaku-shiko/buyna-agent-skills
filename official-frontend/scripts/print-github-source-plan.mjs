#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(projectRoot, "..");
const args = process.argv.slice(2);
const strict = args.includes("--strict");
const remoteArg = readArg("--remote");
const branchArg = readArg("--branch");
const failures = [];

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] ?? "";
}

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
    };
  }
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

function state(ok) {
  return ok ? "OK" : "MISSING";
}

const branch = branchArg || run("git", ["branch", "--show-current"]).stdout;
const commit = run("git", ["rev-parse", "HEAD"]).stdout;
const sourceStatus = run("git", [
  "status",
  "--porcelain",
  "--",
  ".github",
  ".gitignore",
  "official-frontend",
]);
const remote = remoteArg || run("git", ["remote", "get-url", "origin"]).stdout;
const remoteUrl = githubHttpsRemote(remote);
const ghVersion = run("gh", ["--version"]);
const ghAuth = ghVersion.ok ? run("gh", ["auth", "status"]) : { ok: false };

if (!branch) failures.push("Current branch could not be detected.");
if (!/^[0-9a-f]{40}$/i.test(commit)) failures.push("Current commit SHA could not be detected.");
if (sourceStatus.stdout)
  failures.push("official-frontend, .github, or .gitignore has uncommitted changes.");
if (!remoteUrl) failures.push("No GitHub origin remote is configured.");
if (!ghVersion.ok) failures.push("GitHub CLI gh is not installed or not on PATH.");
if (ghVersion.ok && !ghAuth.ok) failures.push("GitHub CLI gh is not authenticated.");

console.log("Buyna.ai GitHub source-of-truth setup plan");
console.log(
  "This command is read-only: it does not add remotes, push commits, or create pull requests.",
);

console.log("\nCurrent source state:");
console.log(`- [${state(Boolean(branch))}] Branch: ${branch || "(unknown)"}`);
console.log(`- [${state(/^[0-9a-f]{40}$/i.test(commit))}] Commit: ${commit || "(unknown)"}`);
console.log(`- [${state(!sourceStatus.stdout)}] official-frontend/.github/.gitignore clean`);
console.log(`- [${state(Boolean(remoteUrl))}] GitHub origin: ${remoteUrl || "(missing)"}`);
console.log(
  `- [${state(ghVersion.ok)}] GitHub CLI: ${ghVersion.ok ? ghVersion.stdout.split(/\r?\n/)[0] : "(missing)"}`,
);
console.log(`- [${state(ghVersion.ok && ghAuth.ok)}] GitHub auth`);

console.log("\nRecommended order after GitHub access is available:");
if (!remoteUrl) {
  console.log("1. Add the production GitHub repository as origin:");
  console.log("   git remote add origin git@github.com:OWNER/REPOSITORY.git");
} else {
  console.log("1. Confirm origin is the production repository:");
  console.log(`   ${remoteUrl}`);
}
console.log("2. Confirm source status is clean:");
console.log("   git status --short -- .github .gitignore official-frontend");
console.log("3. Install/authenticate GitHub CLI if needed:");
console.log("   winget install --id GitHub.cli");
console.log("   gh auth login");
console.log(`4. Push the official frontend branch:`);
console.log(`   git push -u origin ${branch || "codex/official-frontend-source"}`);
console.log("5. Wait for GitHub Actions to finish:");
console.log(`   gh run list --branch ${branch || "codex/official-frontend-source"} --limit 1`);
console.log("6. Verify source-of-truth evidence:");
console.log("   pnpm run check:github-source");
console.log("7. Create a draft PR when ready:");
console.log(`   gh pr create --draft --fill --head ${branch || "codex/official-frontend-source"}`);
console.log(
  "8. Record the remote URL, full commit SHA, branch, CI run URL, and CI conclusion in .production-evidence.json.",
);

if (strict && failures.length) {
  console.error("\nMissing requirements:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
