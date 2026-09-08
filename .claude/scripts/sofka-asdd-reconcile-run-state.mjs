#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateRunReconciliation,
  writeReconciledState,
} from "./lib/sofka-asdd-run-reconciliation-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const statePath = resolve(root, ".asdd-run.json");
const write = process.argv.includes("--write");
const git = (args) => {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};

try {
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;
  const branch = git(["branch", "--show-current"]);
  const headCommit = git(["rev-parse", "HEAD"]);
  const report = evaluateRunReconciliation(root, state, {
    require_provenance: true,
    branch,
    head_commit: headCommit,
    is_ancestor: (candidate) => {
      try {
        execFileSync("git", ["merge-base", "--is-ancestor", candidate, headCommit], {
          cwd: root,
          stdio: "ignore",
        });
        return true;
      } catch {
        return false;
      }
    },
  });
  if (write && state) writeReconciledState(statePath, state, report);
  console.log(JSON.stringify(report, null, 2));
  if (!write && (report.errors.length || report.drift.length)) process.exitCode = 1;
} catch (error) {
  console.error(`reconcile-run-state: ${error.message}`);
  process.exitCode = 1;
}
