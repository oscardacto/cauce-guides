#!/usr/bin/env node
/** Consolidated SessionStart dispatcher. It reads Git/configuration once and emits
 * the compact reminders formerly produced by five independent Node processes. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const safe=(v,max=200)=>String(v??"").replace(/[\r\n]/g," ").slice(0,max);
const git=(args)=>{try{return execFileSync("git",args,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:5000}).trim();}catch{return null;}};
const root=git(["rev-parse","--show-toplevel"])??process.cwd();
const readJson=(path)=>{try{return JSON.parse(readFileSync(path,"utf8"));}catch{return null;}};
const lock=readJson(join(root,".sofka-asdd","sofka-asdd.lock"));
const lines=[];
if(process.env.SOFKA_ASDD_SESSION_START_DISABLE!=="1"){
 const branch=git(["symbolic-ref","--short","HEAD"]),dirty=git(["status","--porcelain"]);
 lines.push("## ASDD — Estado de sesión");
 if(branch) lines.push(`🌿 Rama: \`${branch}\` · ${dirty?"cambios sin commitear":"working tree limpio"}.`);
 lines.push("## ASDD — núcleo de ejecución","• Resolver profundidad: TRIVIAL/LIGHT/MEDIUM/FULL.","• TRIVIAL y LIGHT read-only con inventario cerrado pueden usar 0 subagentes y tools locales de lectura. Todo cambio LIGHT y todo MEDIUM/FULL se delega; write/CLI/MCP escala.","• LIGHT atomic_scoped_change delega con autorización interna de un archivo/uso único: no presenta plan, challenge ni pide ok; scope ambiguo falla cerrado.","• Budgets máximos: TRIVIAL=0; LIGHT=1/10–20; MEDIUM=2/20–35; FULL=3/30–50; support puede usar techo menor; un retry. Son techos, no cuotas.","• Baja confianza escala un nivel; alto riesgo usa FULL/Opus antes de tools.","• Antes del plan, el orquestador reserva rutas exactas; todo artefacto nuevo en docs/** usa {run_id}-{PHASE}-{SEQ}-{slug}.{ext}. Código queda excluido.","• W/D usa challenge de plan salvo LIGHT atómico autoautorizado; GS-003 conserva commit explícito.","• Skills/reglas especializadas se cargan por ruta, no se precargan.");
}
if(process.env.SOFKA_ASDD_CODEBASE_SIZE_DISABLE!=="1"){
 const maturity=lock?.project_context?.maturity;
 if(maturity==="small"||maturity==="large") lines.push(`## ORC-001-D — codebase_size: ${maturity} (lock override)`);
}
if(process.env.SOFKA_ASDD_MODEL_STRATEGY_DISABLE!=="1"&&lock?.model_strategy?.phase_default){
 const entries=Object.entries(lock.model_strategy.phase_default).map(([phase,model])=>`${phase}=${safe(model,40)}`).join(", ");
 lines.push(`## ORC-002-B — modelos: ${entries}`);
}
if(process.env.SOFKA_ASDD_TDD_STATE_DISABLE!=="1"){
 const path=join(root,".sofka-asdd","testing-capabilities.yaml");
 if(existsSync(path)&&/^strict_tdd\s*:\s*true\s*$/m.test(readFileSync(path,"utf8"))) lines.push("## ORC-009 — STRICT TDD MODE ACTIVO");
}
if(process.env.SOFKA_ASDD_STATE_FRESHNESS_DISABLE!=="1"){
 const state=readJson(join(root,".asdd-run.json"));
 if(state&&state.status!=="complete") lines.push(`## ORC-007 — run ${safe(state.run_id)}: ${safe(state.status)} / ${safe(state.current_phase??state.phase)}`);
}
if(lines.length) process.stdout.write(`${lines.join("\n")}\n`);
