#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getDeterministicRouteReminder,
  getPromptInjectionProfile,
} from "../hooks/sofka-asdd-user-prompt-submit.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const hookSource = readFileSync(resolve(root, ".claude/hooks/sofka-asdd-user-prompt-submit.mjs"), "utf8");
const sessionSource = readFileSync(resolve(root, ".claude/hooks/sofka-asdd-session-start-dispatcher.mjs"), "utf8");

assert.deepEqual(getDeterministicRouteReminder("¿Qué hace este archivo?"), []);
assert.equal(getPromptInjectionProfile("¿Qué hace este archivo?").mode, "none");

const audit = getDeterministicRouteReminder(
  "Trabaja en modo estrictamente READ-ONLY. Audita todos los ADR y no modifiques archivos.",
).join("\n");
assert.match(audit, /ASDD ROUTE — resolución determinista del hook/);
assert.match(audit, /depth=LIGHT/);
assert.match(audit, /budget es un techo, no una cuota/);
assert.match(audit, /SessionStart inyecta el núcleo compacto/);
assert.match(audit, /carga nativa de Claude Code/);
assert.match(audit, /agrupá en un mismo turno las lecturas independientes/);
assert.doesNotMatch(audit, /requires_plan=true/);

assert.ok(getPromptInjectionProfile("Implementá el diseño de figma.com/design/ABC123").signals.includes("figma"));
assert.ok(getPromptInjectionProfile("Corrige el flujo para que una autorización no permita comandos fuera del scope aprobado.").signals.includes("authorization-security"));
assert.ok(getPromptInjectionProfile("Diseñá un data lake Medallion en Databricks").signals.includes("data"));
assert.ok(getPromptInjectionProfile("Diseñá una API REST y su modelo de dominio").signals.includes("software"));
assert.ok(getPromptInjectionProfile("Migrar la base de datos del CRM a un data warehouse").signals.includes("data-software-ambiguity"));
assert.equal(getPromptInjectionProfile("Recupera el núcleo ORC completo").mode, "full");

const approved = getPromptInjectionProfile("ok", { planAuthorizationConsumed: true });
assert.deepEqual(approved, { mode: "specialized", signals: ["plan-approved"] });
assert.match(sessionSource, /ASDD — núcleo de ejecución/);
assert.match(sessionSource, /TRIVIAL\/LIGHT\/MEDIUM\/FULL/);
assert.match(hookSource, /reminders\.push\(\.\.\.getDeterministicRouteReminder\(prompt\)\)/);

console.log("PASS normal: TRIVIAL preserves zero repeated route/core overhead");
console.log("PASS audit: deterministic LIGHT route, ceiling semantics and honest load evidence");
console.log("PASS specialized: Figma/security/data/software/ambiguity profiles remain available");
console.log("PASS recovery: explicit request restores full ORC profile");
console.log("PASS anti-orphan: SessionStart still delivers the compact ORC core");
