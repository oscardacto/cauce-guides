#!/usr/bin/env node
// test-hueco-clasificacion.mjs — reemplaza a test-guard-incidencias.mjs.
//
// El registro en disco se eliminó (decisión del usuario, 2026-08-25): el hueco de
// clasificación se DESCRIBE en el mensaje del `ask` y no se persiste. Esta suite
// verifica las dos propiedades que quedan, y la tercera es la que prueba la
// eliminación:
//
//   1. Los valores se DESCARTAN, no se enmascaran.
//   2. La descripción es accionable: intención, operación, motivo, probado, sugerencia.
//   3. Invocar el guard sobre un hueco NO CREA NI TOCA NINGÚN ARCHIVO.
//
// La tercera falla si alguien reintroduce persistencia, que es exactamente lo que
// esta suite existe para impedir.

import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describirHueco, formaOperacion, TOPE_OPERACION } from "../hooks/_lib/sofka-asdd-hueco-clasificacion.mjs";
import { getOrchestratorGuardDecision } from "../hooks/sofka-asdd-orchestrator-guard.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..", "..");

let ok = 0;
let fallos = 0;
function assert(titulo, condicion, detalle = "") {
  if (condicion) {
    ok += 1;
    console.log(`  ✅ ${titulo}`);
  } else {
    fallos += 1;
    console.log(`  ❌ ${titulo}${detalle ? `  → ${detalle}` : ""}`);
  }
}

const askDe = (command, cwd = RAIZ) =>
  getOrchestratorGuardDecision(
    { tool_name: "Bash", tool_input: { command }, cwd },
    { CLAUDE_AGENT_ID: "", SOFKA_ASDD_VERSION: "3.5.0" },
  );

console.log("\n1 · Los valores se descartan, no se enmascaran");

{
  const { operacion } = formaOperacion("terraform plan -out=/tmp/tf.plan -var 'password=hunter2'");
  assert("la forma conserva ejecutable y subcomando", operacion === "terraform plan", operacion);
  const texto = describirHueco({ segmento: "terraform plan -out=/tmp/tf.plan -var 'password=hunter2'", motivo: "x" });
  assert("el secreto no aparece en la descripción", !texto.includes("hunter2"));
  assert("la ruta del argumento no aparece", !texto.includes("/tmp/tf.plan"));
  assert("el flag de un guion no aparece", !texto.includes("-var"));
}

{
  const a = formaOperacion("terraform plan -out=/tmp/a").operacion;
  const b = formaOperacion("terraform plan -out=/tmp/b").operacion;
  assert("dos valores distintos dan la MISMA forma", a === b && a === "terraform plan", `${a} vs ${b}`);
}

{
  const { operacion } = formaOperacion("node .claude/scripts/sofka-asdd-herramienta-inexistente.mjs --modo x");
  assert(
    "de `node <script>` sobrevive el nombre, no la ruta",
    operacion === "node sofka-asdd-herramienta-inexistente.mjs --modo",
    operacion,
  );
}

{
  const flags = Array.from({ length: 60 }, (_, i) => `--flag-numero-${i}`).join(" ");
  const { operacion, truncado } = formaOperacion(`terraform plan ${flags}`);
  assert("la forma se recorta al tope", operacion.length === TOPE_OPERACION, String(operacion.length));
  assert("y el recorte se declara", truncado === true);
  assert(
    "la descripción avisa del recorte",
    describirHueco({ segmento: `terraform plan ${flags}`, motivo: "x" }).includes("recortada"),
  );
}

console.log("\n2 · La descripción es accionable");

{
  const texto = describirHueco({
    segmento: "node .claude/scripts/sofka-asdd-herramienta-inexistente.mjs --modo x",
    motivo: "script no declarado en el manifiesto: sofka-asdd-herramienta-inexistente.mjs",
  });
  for (const campo of ["intención", "operación", "motivo", "probado", "sugerencia"]) {
    assert(`la descripción trae «${campo}»`, texto.includes(campo));
  }
  assert("cita ORC-000", texto.includes("ORC-000"));
  assert("dice que es un hueco del manifiesto, no una decisión de diseño", texto.includes("hueco del manifiesto"));
  assert(
    "la sugerencia nombra el script y sus flags",
    texto.includes("CONTROL_PLANE") && texto.includes("--modo"),
  );
  assert("declara que no se guarda nada", texto.includes("no se guarda en ningún archivo"));
}

{
  const texto = describirHueco({ segmento: "npx alguna-herramienta --revisar", motivo: "sin plano" });
  assert(
    "para un ejecutable externo la sugerencia apunta a DOMAIN_EXEC",
    texto.includes("DOMAIN_EXEC"),
  );
}

console.log("\n3 · El guard describe el hueco y NO escribe nada");

{
  const decision = askDe("node .claude/scripts/sofka-asdd-herramienta-inexistente.mjs --modo x");
  assert("el veredicto sigue siendo ask", decision?.decision === "ask", JSON.stringify(decision?.decision));
  assert("la razón es la descripción del hueco", Boolean(decision?.reason?.includes("intención")));
  assert(
    "la razón NO trae el segmento crudo con su valor",
    !decision.reason.includes("--modo x"),
    decision.reason.slice(0, 120),
  );
  assert(
    "el retorno no lleva campos extra: solo decision y reason",
    Object.keys(decision).sort().join(",") === "decision,reason",
    Object.keys(decision).join(","),
  );
}

{
  // La prueba de que la eliminación es real: un censo del árbol antes y después.
  const censo = (raiz) => {
    const salida = new Map();
    const caminar = (dir) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        if (entrada.name === "node_modules" || entrada.name === ".git") continue;
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) caminar(ruta);
        else salida.set(ruta, statSync(ruta).mtimeMs);
      }
    };
    caminar(raiz);
    return salida;
  };

  const antes = censo(join(RAIZ, ".claude"));
  for (let i = 0; i < 3; i += 1) {
    askDe("node .claude/scripts/sofka-asdd-herramienta-inexistente.mjs --modo x");
    askDe(`terraform plan -var 'password=hunter2-${i}'`);
  }
  const despues = censo(join(RAIZ, ".claude"));

  const nuevos = [...despues.keys()].filter((ruta) => !antes.has(ruta));
  const tocados = [...despues.entries()].filter(([ruta, mtime]) => antes.has(ruta) && antes.get(ruta) !== mtime);

  assert("seis huecos no crearon ningún archivo", nuevos.length === 0, nuevos.join(" · "));
  assert("y no modificaron ninguno", tocados.length === 0, tocados.map(([r]) => r).join(" · "));

  const runtime = join(RAIZ, ".claude", ".runtime", "orchestrator-guard");
  assert("el directorio del registro eliminado no reaparece", !existsSync(runtime));
}

{
  // Y que el módulo no exporte nada que escriba: la superficie es una sola función
  // de texto más el constructor de la forma.
  const modulo = await import("../hooks/_lib/sofka-asdd-hueco-clasificacion.mjs");
  const exportado = Object.keys(modulo).sort();
  assert(
    "el módulo solo exporta describirHueco, formaOperacion y el tope",
    exportado.join(",") === "TOPE_OPERACION,describirHueco,formaOperacion",
    exportado.join(","),
  );
}

console.log("\n4 · Un hueco repetido se describe de nuevo, y está bien");

{
  const a = askDe("node .claude/scripts/sofka-asdd-herramienta-inexistente.mjs --modo x");
  const b = askDe("node .claude/scripts/sofka-asdd-herramienta-inexistente.mjs --modo x");
  assert("las dos veces da ask", a?.decision === "ask" && b?.decision === "ask");
  assert("y el mensaje es idéntico: no hay contador ni estado", a.reason === b.reason);
}

// Un temporal descartable, solo para confirmar que la suite no dejó basura propia.
const efimero = mkdtempSync(join(tmpdir(), "hueco-"));
rmSync(efimero, { recursive: true, force: true });

console.log(`\n${"─".repeat(52)}`);
console.log(`Hueco de clasificación: ${ok} ✅  ${fallos} ❌`);
process.exit(fallos === 0 ? 0 : 1);
