#!/usr/bin/env node
// Suite del modo `branch` de GS-003 — el challenge de lote que habilita los
// commits de cierre de ORC-011-B sin renunciar a la aprobación humana.
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import {
  approveActiveCommitChallenge,
  authorizationPath,
  challengePath,
  consumeCommitAuthorization,
  dir,
  issueCommitChallenge,
  issueWorktreeCommitChallenge,
} from "./lib/sofka-asdd-commit-authorization-lib.mjs";

let pasaron = 0;
const casos = [];
const test = (nombre, fn) => casos.push([nombre, fn]);
const limpiar = () => {
  for (const p of [challengePath, authorizationPath]) if (existsSync(p)) rmSync(p);
};

test("una rama autorizada permite el commit de cierre sin ligar el mensaje", () => {
  limpiar();
  issueWorktreeCommitChallenge({ branches: ["wt/refund-abc123"] });
  approveActiveCommitChallenge();
  const auth = consumeCommitAuthorization({
    branch: "wt/refund-abc123",
    command: 'git commit -m "feat(refund): lo que el developer decidio escribir"',
  });
  assert.equal(auth.scope, "branch");
  assert.equal(auth.uses["wt/refund-abc123"], 1);
});

test("una rama fuera del lote no queda autorizada", () => {
  limpiar();
  issueWorktreeCommitChallenge({ branches: ["wt/a"] });
  approveActiveCommitChallenge();
  assert.throws(() => consumeCommitAuthorization({ branch: "wt/b", command: "git commit -m x" }));
});

test("el tope de usos por rama se respeta (anti-replay)", () => {
  limpiar();
  issueWorktreeCommitChallenge({ branches: ["wt/a"], max_uses: 1 });
  approveActiveCommitChallenge();
  consumeCommitAuthorization({ branch: "wt/a", command: "git commit -m uno" });
  assert.throws(() => consumeCommitAuthorization({ branch: "wt/a", command: "git commit -m dos" }));
});

test("varias ramas en paralelo consumen de forma independiente", () => {
  limpiar();
  issueWorktreeCommitChallenge({ branches: ["wt/a", "wt/b"], max_uses: 1 });
  approveActiveCommitChallenge();
  const a = consumeCommitAuthorization({ branch: "wt/a", command: "git commit -m a" });
  assert.equal(a.used_at, null, "con ramas pendientes la autorización sigue viva");
  const b = consumeCommitAuthorization({ branch: "wt/b", command: "git commit -m b" });
  assert.ok(b.used_at, "al agotarse todas las ramas la autorización se cierra");
});

test("un comando que no es git commit nunca pasa", () => {
  limpiar();
  issueWorktreeCommitChallenge({ branches: ["wt/a"] });
  approveActiveCommitChallenge();
  assert.throws(() => consumeCommitAuthorization({ branch: "wt/a", command: "git push origin HEAD" }));
});

test("un challenge vencido no autoriza", () => {
  limpiar();
  const pasado = new Date(Date.now() - 60_000);
  issueWorktreeCommitChallenge({ branches: ["wt/a"], ttl_seconds: 1 }, pasado);
  approveActiveCommitChallenge(pasado);
  assert.throws(() => consumeCommitAuthorization({ branch: "wt/a", command: "git commit -m x" }));
});

test("el modo command sigue exigiendo el comando exacto (sin regresión)", () => {
  limpiar();
  const cmd = 'git commit -m "fix: exacto"';
  issueCommitChallenge({ branch: "fix/x", command: cmd });
  approveActiveCommitChallenge();
  assert.throws(
    () => consumeCommitAuthorization({ branch: "fix/x", command: 'git commit -m "fix: otro"' }),
    "otro mensaje no debe pasar",
  );
  const auth = consumeCommitAuthorization({ branch: "fix/x", command: cmd });
  assert.ok(auth.used_at);
});

test("el modo branch exige al menos una rama", () => {
  assert.throws(() => issueWorktreeCommitChallenge({ branches: [] }));
});

for (const [nombre, fn] of casos) {
  try {
    fn();
    pasaron += 1;
    console.log(`✅ ${nombre}`);
  } catch (error) {
    console.log(`❌ ${nombre}\n   ${error.message}`);
  }
}
limpiar();
try {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
} catch {
  /* el directorio puede estar en uso */
}

console.log(`\nGS-003 modo worktree: ${pasaron} ✅  ${casos.length - pasaron} ❌`);
process.exit(pasaron === casos.length ? 0 : 1);
