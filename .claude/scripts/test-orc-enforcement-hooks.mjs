#!/usr/bin/env node
/** Static regression tests for the compact ORC injections.
 * Hook subprocess I/O is covered by Claude Code; this test verifies the
 * versioned source contract without relying on platform-specific stdin pipes.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getDomainRouting, getPromptInjectionProfile, isAuthorizationSecurityChange } from "../hooks/asdd-user-prompt-submit.mjs";
const here=dirname(fileURLToPath(import.meta.url));
const hooks=join(here,"..","hooks"), rules=join(here,"..","rules");
let pass=0, fail=0;
const assert=(ok,id,text)=>{console.log(`${ok?"PASS":"FAIL"} [${id}] ${text}`);ok?pass++:fail++;};
const session=readFileSync(join(hooks,"asdd-session-start-dispatcher.mjs"),"utf8");
const prompt=readFileSync(join(hooks,"asdd-user-prompt-submit.mjs"),"utf8");
console.log("\n=== Compact ORC injection contract ===");
assert(session.includes("ASDD — núcleo de ejecución"),"T01","session-start declares compact core");
assert(session.includes("TRIVIAL/LIGHT/MEDIUM/FULL"),"T02","session-start references proportional routing");
assert(session.includes("Skills/reglas especializadas"),"T03","session-start points to on-demand loading");
assert(session.split(/\s+/).length<=900,"T04","session-start source remains compact");
assert(getPromptInjectionProfile("¿Qué hace este archivo?").mode==="none","T05","normal prompt injects no repeated ORC core");
assert(getPromptInjectionProfile("Recupera el núcleo ORC").mode==="full","T05a","explicit recovery injects the full ORC core");
assert(prompt.includes("TRIVIAL y LIGHT read-only con inventario cerrado pueden usar 0 subagentes")&&prompt.includes("allow-list local read-only"),"T05b","bounded TRIVIAL/LIGHT read-only execution is explicit and constrained");
assert(session.includes("Todo cambio LIGHT y todo MEDIUM/FULL se delega")&&session.includes("Son techos, no cuotas"),"T05b1","session core distinguishes LIGHT read-only exception from delegated work");
assert(prompt.includes("isAuthorizationSecurityChange")&&prompt.includes("Ruta FULL obligatoria")&&prompt.includes("No hagas exploración directa previa"),"T05c","authorization changes force FULL plan before direct exploration");
assert(!isAuthorizationSecurityChange("Necesito cambiar command_words de 5000 a 4800. Antes de modificar, presentá un plan canónico que requiera mi aprobación."),"T05c1","plan-approval ceremony does not masquerade as an authorization-security change");
assert(isAuthorizationSecurityChange("Corrige el flujo para que una aprobación no autorice acciones fuera de los agentes, alcance y comandos del plan."),"T05c2","authorization binding change still forces FULL routing");
assert(!getDomainRouting("Prueba el binding de comandos con @asdd-developer-backend.").isSoftware,"T05c3","a bare backend mention does not force solution-architect routing");
assert(getDomainRouting("Diseñá el contrato API REST y el modelo de dominio.").isSoftware,"T05c4","concrete software architecture signals still route to solution architect");
assert(prompt.includes("ORC-010-A")&&prompt.includes("--plan-json")&&prompt.includes("no verifiques scripts ni explores primero"),"T05d","approved plans issue canonical challenge before display without inspection");
assert(prompt.includes("capability-loading.json")&&prompt.includes("`dependencies`")&&prompt.includes("asdd-load-capability.mjs"),"T05d1","manifest agents declare a primary and only an explicit approved dependency");
assert(prompt.includes("planAuthorizationConsumed")&&prompt.includes("Lote aprobado y challenge consumido")&&prompt.includes("NO ejecutes `asdd-plan-authorization.mjs approve`"),"T05e","post-approval reminder prevents redundant authorization control CLI calls");
assert(prompt.includes("classifyApprovalIntent")&&!prompt.includes("APPROVAL_RE"),"T05f","approval recognition moved from a closed keyword regex to intent classification");
assert(prompt.includes("Plan rechazado por el usuario")&&prompt.includes("revokeActiveChallenge"),"T05g","an explicit rejection revokes the pending challenge");
assert(prompt.includes("challenge enmendado, NO aprobado")&&prompt.includes("--confirm-unchanged")&&prompt.includes("NO vuelvas a presentar el plan por default"),"T05h","a correction amends the batch instead of restarting the ceremony");
assert(prompt.includes("Turno elegible para aprobación")&&prompt.includes("approve --challenge-id"),"T05i","the long tail stays eligible for an explicit orchestrator approval");
assert(prompt.includes("ORC-010-F")&&prompt.includes("GS-003 commit, GS-008 push, GS-009 MR/PR"),"T05j","git operations skip the plan gate and keep their own gate");
assert(prompt.includes("Señal Figma detectada")&&prompt.includes("AMBIGÜEDAD DATOS↔SOFTWARE"),"T06","specialized routing signals remain available");
assert(!existsSync(join(rules,"asdd-orchestration-index.md")),"T07","legacy orchestration index remains removed");
console.log(`\nResult: ${pass} PASS / ${fail} FAIL`);
if(fail)process.exit(1);
