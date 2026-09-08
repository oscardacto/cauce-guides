#!/usr/bin/env node
// GS-003 — emisión y aprobación de la autorización explícita de commit.
//
//   issue            challenge por comando exacto (modo estricto, default)
//                    stdin: {"command":"git commit -m \"...\""}
//   issue-worktree   challenge de lote para los commits de cierre de worktrees
//                    (ORC-011-B). stdin: {"branches":["wt/x","wt/y"],"max_uses":1}
//   approve          consume el challenge activo y emite la autorización
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  approveActiveCommitChallenge,
  issueCommitChallenge,
  issueWorktreeCommitChallenge,
} from "./lib/sofka-asdd-commit-authorization-lib.mjs";

try {
  const action = process.argv[2];
  if (action === "issue") {
    const input = JSON.parse(readFileSync(0, "utf8"));
    const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
    console.log(JSON.stringify(issueCommitChallenge({ ...input, branch }), null, 2));
  } else if (action === "issue-worktree") {
    const input = JSON.parse(readFileSync(0, "utf8"));
    console.log(JSON.stringify(issueWorktreeCommitChallenge(input), null, 2));
  } else if (action === "approve") {
    console.log(JSON.stringify(approveActiveCommitChallenge(), null, 2));
  } else {
    throw new Error("usage: commit-authorization.mjs issue|issue-worktree|approve");
  }
} catch (error) {
  console.error(`commit-authorization: ${error.message}`);
  process.exit(1);
}
