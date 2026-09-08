#!/usr/bin/env node
import { routeRequest } from "./lib/asdd-proportional-router-lib.mjs";

const cases = [
  ["¿dónde está definido el endpoint de health?", "TRIVIAL"],
  ["¿Qué significa este ADR?", "TRIVIAL"],
  ["actualiza el texto en src/home.ts", "LIGHT"],
  ["el error está en src/auth/service.ts cuando expira la sesión", "MEDIUM"],
  ["a veces el carrito no actualiza el precio", "FULL"],
  ["implementa autenticación OAuth", "FULL"],
  ["crea una spec para el módulo de reportes", "FULL"],
  ["Trabaja en modo estrictamente READ-ONLY. Audita varios ADR y criterios de aceptación sin modificar archivos.", "LIGHT"],
  ["Realiza un análisis de solo lectura, sin crear ni modificar archivos, y revisa todos los ADR.", "LIGHT"],
];
let failed=0;
for (const [request, expected] of cases) {
  const result=routeRequest(request);
  if(result.depth===expected) console.log(`✅ ${expected}: ${request}`);
  else { console.error(`❌ ${request}: expected=${expected} actual=${result.depth}`); failed++; }
}
const ambiguous=routeRequest("cambia esto");
if(ambiguous.reasons.some((reason)=>reason.includes("low_confidence_escalation")) && ambiguous.depth==="FULL") console.log("✅ ambigüedad escala exactamente un nivel");
else { console.error(`❌ escalamiento ambiguo: ${JSON.stringify(ambiguous)}`); failed++; }
const sensitive=routeRequest("cambia OAuth en src/auth.ts");
if(sensitive.depth==="FULL"&&sensitive.risk==="high") console.log("✅ dominio sensible nunca se degrada");
else { console.error("❌ dominio sensible"); failed++; }
const audit=routeRequest(`# Prompt 00 — Auditoría read-only del contexto

## Prompt para copiar

\`\`\`text
Trabaja en modo estrictamente READ-ONLY. No crees ni modifiques archivos.
Lee en orden docs/contexto/aid-06-contexto-ux-ui.md y todo el paquete; detecta contradicciones. Lista decisiones que exigen ADR.
\`\`\`

## Criterios de aceptación
- Distingue PoC local de target cloud.`);
if(audit.depth==="LIGHT"&&audit.domain==="general"&&audit.requires_plan===false&&audit.required_capabilities.join(",")==="read,analyze"&&audit.reasons.includes("bounded_read_only_audit")) console.log("✅ wrapper de auditoría se enruta por intención read-only real");
else { console.error(`❌ auditoría read-only: ${JSON.stringify(audit)}`); failed++; }
if(failed) process.exit(1);
