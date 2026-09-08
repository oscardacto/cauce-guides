#!/usr/bin/env node
// -----------------------------------------------------------------------------
// .claude/scripts/test-smart-data-hook-no-interference.mjs
//
// PR2 (Capa 2, ADR-002) — Tests de no-interferencia del hook
// .claude/hooks/asdd-user-prompt-submit.mjs (D.3 del plan
// .claude/docs/adoption/smart-data-integration-plan.md).
//
// Verifica la CLASIFICACIÓN determinística del hook (regex → texto inyectado),
// NO comportamiento del LLM/orquestador. Los 7 casos son los definidos en
// §D.3 del plan: pares de colisión (Data ↔ Software/Cloud/Security) que NO
// deben mis-routear, más 1 caso ambiguo que debe desambiguar (preguntar) en
// vez de auto-elegir.
//
// Superficie real de este hook: SOLO separa el par
// solution-architect ↔ data-architect/data-eng-databricks (DATA_DOMAIN_RE vs.
// SOFTWARE_ARCH_RE). Los pares cloud-architect ↔ data-eng-databricks y
// security ↔ data-governance (N3/N4/N5/N6) NO tienen regex propia en este
// hook — se resuelven en runtime por las descripciones mutuamente excluyentes
// (Capa 1) + scope-check recíproco (Capa 3) ya aplicados en los agentes
// (.claude/agents/asdd-cloud-architect.md, asdd-security.md,
// asdd-data-eng-databricks.md, asdd-data-governance.md).
// Para esos casos, este harness verifica que el hook NO INTERFIERE (no emite
// ninguna señal que contradiga o fuerce el agente equivocado) — que es
// exactamente lo que le corresponde probar a "el hook", sin simular al LLM.
// -----------------------------------------------------------------------------

import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const hookFile = join(__dirname, "..", "hooks", "asdd-user-prompt-submit.mjs");

let passed = 0;
let failed = 0;

function assert(condition, id, description, extra = "") {
  if (condition) {
    console.log(`  PASS [${id}] ${description}`);
    passed++;
  } else {
    console.error(`  FAIL [${id}] ${description}${extra ? " — " + extra : ""}`);
    failed++;
  }
}

function runHook(prompt) {
  const result = spawnSync("node", [hookFile], {
    input: JSON.stringify({ prompt }),
    encoding: "utf8",
    timeout: 10000,
  });
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status };
}

console.log("=== PR2 — Tests de no-interferencia del hook (D.3, ADR-002) ===\n");

// ---- N1: Data lake Medallion en Databricks → debe enrutar (mandatorio) a
//          data-architect/data-eng-databricks, NUNCA forzar solution-architect
//          (el bug que ADR-002 corrige). ------------------------------------
{
  const r = runHook("Diseñá la arquitectura del data lake Medallion en Databricks");
  assert(r.status === 0, "N1-exit", "hook sale con exit 0");
  assert(
    r.stdout.includes("DEBES enrutar a **asdd-data-architect**"),
    "N1", "prompt de data lake/Medallion enruta (mandatorio) a asdd-data-architect",
    r.stdout
  );
  assert(
    !r.stdout.includes("DEBES involucrar a **asdd-solution-architect**"),
    "N1-neg", "prompt de data lake/Medallion NO fuerza asdd-solution-architect"
  );
}

// ---- N2: Bounded contexts de facturación → debe enrutar (mandatorio) a
//          solution-architect, NUNCA forzar data-architect. ------------------
{
  const r = runHook("Diseñá los bounded contexts del sistema de facturación");
  assert(r.status === 0, "N2-exit", "hook sale con exit 0");
  assert(
    !r.stdout.includes("DEBES enrutar a **asdd-data-architect**") &&
    !r.stdout.includes("AMBIGÜEDAD DATOS↔SOFTWARE"),
    "N2", "prompt de bounded contexts de facturación NO dispara señal de datos ni ambigüedad " +
      "(el hook no tiene señal para este prompt — el enrutamiento a solution-architect queda a NÚCLEO ORC + descripción de agente, Capa 1, ya aplicada)",
    r.stdout
  );
}

// ---- N3: Pipeline Bronze→Silver con Auto Loader → debe enrutar (mandatorio)
//          a data-architect/data-eng-databricks, NUNCA forzar cloud-architect. ---
{
  const r = runHook("Armá el pipeline Bronze→Silver con Auto Loader");
  assert(r.status === 0, "N3-exit", "hook sale con exit 0");
  assert(
    r.stdout.includes("DEBES enrutar a **asdd-data-architect**") &&
    r.stdout.includes("asdd-data-eng-databricks"),
    "N3", "prompt de pipeline Auto Loader enruta (mandatorio) a data-architect/data-eng-databricks",
    r.stdout
  );
  assert(
    !r.stdout.includes("asdd-cloud-architect"),
    "N3-neg", "prompt de pipeline Auto Loader NO menciona asdd-cloud-architect"
  );
}

// ---- N4: Deployment en EKS con VPC privada → el hook no tiene señal de
//          datos para este prompt (sin DATA_DOMAIN_RE); el par cloud-architect
//          ↔ data-eng-databricks se resuelve por Capa 1/3 en los agentes, no
//          por este hook. Se verifica que el hook NO interfiere. ------------
{
  const r = runHook("Diseñá el deployment de la app en EKS con VPC privada");
  assert(r.status === 0, "N4-exit", "hook sale con exit 0");
  assert(
    !r.stdout.includes("asdd-data-architect") &&
    !r.stdout.includes("asdd-data-eng-databricks") &&
    !r.stdout.includes("AMBIGÜEDAD DATOS↔SOFTWARE"),
    "N4", "prompt de deployment EKS/VPC NO dispara ninguna señal de datos ni ambigüedad " +
      "(cloud-architect ↔ data-eng-databricks se resuelve por Capa 1/3 en agentes, fuera de la superficie de este hook)",
    r.stdout
  );
}

// ---- N5: Retención y PII de tablas en Silver → el hook no tiene señal de
//          datos para este prompt ("Silver" sin "layer/tier/capa" no matchea
//          DATA_DOMAIN_RE); el par security ↔ data-governance se resuelve por
//          Capa 1/3 en los agentes. Se verifica que el hook no interfiere. --
{
  const r = runHook("Definí retención y clasificación PII de las tablas de clientes en Silver");
  assert(r.status === 0, "N5-exit", "hook sale con exit 0");
  assert(
    !r.stdout.includes("asdd-data-architect") &&
    !r.stdout.includes("AMBIGÜEDAD DATOS↔SOFTWARE"),
    "N5", "prompt de retención/PII en Silver NO dispara señal de datos ni ambigüedad " +
      "(security ↔ data-governance se resuelve por Capa 1/3 en agentes, fuera de la superficie de este hook)",
    r.stdout
  );
}

// ---- N6: Auditoría OWASP del servicio de pagos → el hook no tiene señal de
//          datos ni de software para este prompt; el par security ↔
//          data-governance (inverso de N5) se resuelve por Capa 1/3. --------
{
  const r = runHook("Auditá dependencias OWASP del servicio de pagos");
  assert(r.status === 0, "N6-exit", "hook sale con exit 0");
  assert(
    !r.stdout.includes("asdd-data-architect") &&
    !r.stdout.includes("asdd-data-governance") &&
    !r.stdout.includes("AMBIGÜEDAD DATOS↔SOFTWARE"),
    "N6", "prompt de auditoría OWASP NO dispara señal de datos ni ambigüedad " +
      "(security ↔ data-governance se resuelve por Capa 1/3 en agentes, fuera de la superficie de este hook)",
    r.stdout
  );
}

// ---- N7: "Migrar la base de datos del CRM a un data warehouse" → AMBOS
//          matchean (base de datos = SOFTWARE_ARCH_RE, data warehouse =
//          DATA_DOMAIN_RE) → rama de desambiguación; el orquestador PREGUNTA,
//          nunca auto-elige. -------------------------------------------------
{
  const r = runHook("Migrar la base de datos del CRM a un data warehouse");
  assert(r.status === 0, "N7-exit", "hook sale con exit 0");
  assert(
    r.stdout.includes("AMBIGÜEDAD DATOS↔SOFTWARE"),
    "N7", "prompt ambiguo (base de datos + data warehouse) dispara rama de desambiguación",
    r.stdout
  );
  assert(
    r.stdout.includes("PREGUNTÁ al usuario UNA sola vez"),
    "N7-pregunta", "la rama de desambiguación instruye preguntar UNA sola vez, no auto-elegir"
  );
  assert(
    !r.stdout.includes("DEBES enrutar a **asdd-data-architect**") &&
    !r.stdout.includes("DEBES involucrar a **asdd-solution-architect** en el plan"),
    "N7-no-autoeleccion", "el prompt ambiguo NO fuerza (mandatorio) ninguno de los dos agentes sin preguntar"
  );
}

// ---- Regresión rápida: prompt normal no repite núcleo y FIGMA sigue intacto -
{
  const r = runHook("¿Cómo funciona el sistema de pagos?");
  assert(
    r.stdout.trim() === "",
    "REG-NUCLEO", "prompt normal no repite NÚCLEO ORC (ADR-017/B4)"
  );
}
{
  const r = runHook("Implementá el diseño de figma.com/design/ABC123");
  assert(
    r.stdout.includes("Señal Figma detectada"),
    "REG-FIGMA", "FIGMA_RE sigue disparando su bloque de inyección (otras inyecciones intactas)"
  );
}

console.log(`\n=== Resultado: ${passed} PASS / ${failed} FAIL ===`);
if (failed > 0) {
  process.exit(1);
}
