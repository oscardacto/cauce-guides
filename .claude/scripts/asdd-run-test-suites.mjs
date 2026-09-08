#!/usr/bin/env node
/**
 * asdd-run-test-suites.mjs — runner unico de las suites `test-*.mjs`.
 *
 * USO
 *   node .claude/scripts/asdd-run-test-suites.mjs
 *       Corre todas las suites descubiertas y aplica el baseline de fallos conocidos.
 *
 *   node .claude/scripts/asdd-run-test-suites.mjs git-guards orc-tier
 *       Filtra: corre solo las suites cuyo nombre contenga alguno de esos substrings.
 *
 *   node .claude/scripts/asdd-run-test-suites.mjs --no-baseline
 *       Ignora el baseline y reporta el estado crudo (exit 1 si algo falla).
 *       Alias: --raw. Sirve para re-medir el baseline desde cero.
 *
 *   node .claude/scripts/asdd-run-test-suites.mjs --list
 *       Solo imprime las suites que se ejecutarian, sin ejecutarlas.
 *
 * SEMANTICA DE EXIT CODE (con baseline activo)
 *   0  el conjunto de fallos observados == el conjunto declarado en el baseline,
 *      Y cada uno falla en el MODO declarado (`expected_status`: FAIL | TIMEOUT,
 *      default FAIL si el campo no esta).
 *   1  cualquiera de estas tres condiciones:
 *      a) aparecio un fallo NO baselineado (regresion);
 *      b) una suite baselineada fallo en un MODO distinto al declarado
 *         (p. ej. declara FAIL y se observo TIMEOUT). El baseline declara una
 *         causa raiz concreta; otro modo de falla no es esa causa y no se
 *         absorbe — es justo el falso verde que este runner existe para impedir;
 *      c) una suite del baseline ahora PASA (baseline obsoleto). Un baseline
 *         viejo es un fallo del control, no una buena noticia silenciosa.
 *   Nunca se oculta un fallo: todos se imprimen con su cola de salida.
 *   Ver .claude/rules/asdd-system-integrity.md.
 *
 * DURACIONES DEL BASELINE (schema v3) — NINGUN NUMERO SIN PLATAFORMA
 *   Desde schema_version 3 el baseline no declara duraciones "absolutas": cada
 *   numero pertenece a una plataforma concreta.
 *     - `typical_duration_ms_by_platform`: mapa platform_id -> ms con TODAS las
 *       mediciones reales disponibles. Es lo que este runner imprime.
 *     - `typical_duration_platform`: platform_id al que corresponde
 *       `typical_duration_ms` (la plataforma de referencia del baseline, elegida
 *       deliberadamente como la MAS LENTA para dimensionar SUITE_TIMEOUT_MS).
 *   El runner imprime ademas una linea "esta corrida" que ubica la plataforma en
 *   la que se esta ejecutando: si hay una medicion que le corresponde, compara
 *   contra ESA y no contra la de referencia; si no la hay, o si la plataforma
 *   actual no se puede identificar sin ambiguedad, lo declara explicitamente y
 *   NO atribuye ninguna medicion. Ambiguedad declarada es preferible a una
 *   atribucion falsa (leer 106000 ms de Windows como esperado en Linux, donde la
 *   misma suite tarda 7820 ms, haria concluir que la suite esta degradada).
 *   Retrocompatibilidad: una entrada schema v1/v2 no tiene ninguno de estos
 *   campos. Si falta el mapa se usa `typical_duration_ms` solo; si falta tambien
 *   `typical_duration_platform` se imprime "plataforma NO DECLARADA" en lugar de
 *   `undefined`. Mismo criterio que `expected_status` (default FAIL).
 *
 * POR QUE LA EJECUCION ES ESTRICTAMENTE SECUENCIAL — NO PARALELIZAR
 *   Las suites comparten estado global mutable dentro del repo: escriben en
 *   `.claude/.runtime/` (entre otros, el directorio de autorizaciones de commit)
 *   y leen/escriben `.asdd-run.json`. Ejecutadas en paralelo se pisan entre si y
 *   producen fallos fantasma irreproducibles que no corresponden a ningun defecto
 *   real. El costo de correr en serie es tiempo; el costo de paralelizar es
 *   perder la confiabilidad del control entero. Si alguien quiere paralelizar,
 *   primero hay que aislar ese estado por proceso (variable de entorno o
 *   directorio de runtime por worker).
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EOL, platform as osPlatform, release as osRelease } from "node:os";

// ROOT se deriva de la ubicacion de este archivo, nunca de process.cwd(),
// para que el runner funcione invocado desde cualquier subdirectorio.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const SCRIPTS_DIR = join(ROOT, ".claude", "scripts");
const BASELINE_FILE = join(SCRIPTS_DIR, "asdd-test-baseline.json");
const BASELINE_REL = ".claude/scripts/asdd-test-baseline.json";

// 300 s por suite. El techo esta calibrado con la plataforma de REFERENCIA del
// baseline (`reference_platform`, hoy windows-11), que es la mas lenta medida:
// un timeout tiene que cubrir el peor caso, no el mejor. La suite mas lenta es
// test-git-guards-cwd: inicializa ~62 repos fixture en serie con operaciones git
// reales sobre disco, y su duracion depende de la contencion de I/O. Rango REAL
// medido en windows-11: 101 s y 106 s en corridas con disco libre, y >180 s
// (abortada por timeout) bajo carga. La MISMA suite tarda ~7.8 s en wsl-fedora
// (~13x menos): por eso este numero no se puede leer como "esperado en
// cualquier SO" y el baseline v3 declara la plataforma de cada duracion.
// 300 s deja ~1.7x de margen sobre el peor caso observado. El numero sale de
// esas mediciones, no de una estimacion: si una suite empieza a acercarse a
// este techo, el problema es su performance — medirla y reportarla antes de
// subir el timeout, porque un timeout que crece sin explicacion esconde un
// defecto. Un timeout demasiado corto reporta un cuelgue falso y enmascara
// los fallos reales de la suite.
const SUITE_TIMEOUT_MS = 300_000;
const TAIL_LINES = 30;

const out = (s = "") => process.stdout.write(`${s}${EOL}`);

// --- argumentos -------------------------------------------------------------
const argv = process.argv.slice(2);
const useBaseline = !argv.includes("--no-baseline") && !argv.includes("--raw");
const listOnly = argv.includes("--list");
const filters = argv.filter((a) => !a.startsWith("--"));

// --- descubrimiento (determinista, alfabetico) ------------------------------
const allSuites = readdirSync(SCRIPTS_DIR)
  .filter((n) => /^test-.+\.mjs$/.test(n))
  .sort();

const suites = filters.length
  ? allSuites.filter((n) => filters.some((f) => n.includes(f)))
  : allSuites;

if (suites.length === 0) {
  out(`No hay suites que coincidan con el filtro: ${filters.join(", ")}`);
  out(`Suites disponibles: ${allSuites.length}`);
  process.exit(1);
}

// --- baseline ---------------------------------------------------------------
/** @type {Map<string, {suite:string, reason:string, reference:string, expected_status?:"FAIL"|"TIMEOUT", typical_duration_ms?:number, typical_duration_platform?:string, typical_duration_ms_by_platform?:Record<string, number>}>} */
const baseline = new Map();
let baselineLoaded = false;
if (existsSync(BASELINE_FILE)) {
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
    for (const entry of parsed.known_failures ?? []) {
      baseline.set(entry.suite, entry);
    }
    baselineLoaded = true;
  } catch (err) {
    out(`ADVERTENCIA: no se pudo leer ${BASELINE_REL}: ${err.message}`);
  }
} else {
  out(`ADVERTENCIA: no existe ${BASELINE_REL} — se corre sin baseline.`);
}

const suiteName = (file) => file.replace(/\.mjs$/, "");

// Modo de falla declarado para una entrada del baseline. Ausencia del campo ==
// "FAIL" para mantener retrocompatibilidad con baselines schema_version 1
// escritos antes de que existiera `expected_status`.
const expectedStatusOf = (entry) => (entry?.expected_status ?? "FAIL").toUpperCase();

// --- plataforma de ejecucion -------------------------------------------------
// Se deriva SOLO de os.platform() + os.release(). No se intenta identificar la
// distro: `prefix` es una familia de plataforma y se compara contra los
// platform_id del baseline (`windows-11` -> familia `windows`, `wsl-fedora` ->
// familia `wsl`). Si la familia no matchea exactamente un platform_id, el runner
// declara la ambiguedad en vez de atribuir una medicion ajena.
const RUNTIME_PLATFORM = (() => {
  const p = osPlatform();
  const release = osRelease();
  if (p === "win32") return { prefix: "windows", label: `Windows (kernel ${release})` };
  if (p === "darwin") return { prefix: "macos", label: `macOS (kernel ${release})` };
  if (p === "linux") {
    // WSL se identifica por el kernel, que declara "microsoft"/"WSL" — es un dato
    // del propio kernel, no una inferencia sobre la distro instalada encima.
    const isWsl = /microsoft|wsl/i.test(release);
    return isWsl
      ? { prefix: "wsl", label: `WSL (kernel ${release})` }
      : { prefix: "linux", label: `Linux (kernel ${release})` };
  }
  return { prefix: null, label: `${p} (kernel ${release})` };
})();

/**
 * Resuelve a que platform_id del baseline corresponde la corrida actual.
 * Devuelve `{ id }` solo si hay UNA coincidencia; `{ id: null, ... }` en
 * cualquier otro caso, con el motivo, para poder decirlo en la salida.
 */
const resolveCurrentPlatformId = (platformIds) => {
  if (!RUNTIME_PLATFORM.prefix) return { id: null, reason: "familia de plataforma desconocida", candidates: [] };
  const candidates = platformIds.filter(
    (id) => id === RUNTIME_PLATFORM.prefix || id.startsWith(`${RUNTIME_PLATFORM.prefix}-`),
  );
  if (candidates.length === 1) return { id: candidates[0], reason: null, candidates };
  if (candidates.length === 0) return { id: null, reason: "sin medicion en el baseline", candidates };
  return { id: null, reason: "mas de una medicion compatible", candidates };
};

/**
 * Lineas de duracion para una entrada del baseline. Ninguna duracion se imprime
 * sin su plataforma; si el baseline es pre-v3 y no la declara, se dice
 * explicitamente en lugar de imprimir `undefined`.
 */
const durationLines = (entry, observedMs) => {
  const lines = [];
  const byPlatform = entry?.typical_duration_ms_by_platform;
  const platformIds =
    byPlatform && typeof byPlatform === "object" ? Object.keys(byPlatform) : [];
  const refId = entry?.typical_duration_platform ?? null;
  const typical = entry?.typical_duration_ms;

  if (platformIds.length) {
    const parts = platformIds.map(
      (id) => `${id} ${byPlatform[id]} ms${id === refId ? " (referencia)" : ""}`,
    );
    lines.push(`  duracion tipica medida: ${parts.join(" · ")}`);
    if (typical !== undefined && !refId) {
      lines.push(
        `  NOTA: typical_duration_ms=${typical} ms viene sin typical_duration_platform (baseline pre-v3) — ese numero no es atribuible a ninguna plataforma.`,
      );
    }
  } else if (typical !== undefined) {
    // Baseline schema v1/v2: hay un numero pero no hay mapa por plataforma.
    lines.push(
      `  duracion tipica medida: ${typical} ms · plataforma ${refId ?? "NO DECLARADA (baseline pre-v3 — numero no atribuible a una plataforma)"}`,
    );
  } else {
    // Ninguna duracion declarada: no se inventa una linea vacia.
    lines.push(`  duracion tipica medida: no declarada en el baseline · observado ${observedMs} ms`);
    lines.push(`  esta corrida: ${RUNTIME_PLATFORM.label}`);
    return lines;
  }

  const current = resolveCurrentPlatformId(platformIds);
  if (current.id) {
    lines.push(
      `  esta corrida: ${RUNTIME_PLATFORM.label} → ${current.id} · observado ${observedMs} ms vs ${byPlatform[current.id]} ms tipicos en ESA plataforma`,
    );
  } else if (current.reason === "mas de una medicion compatible") {
    lines.push(
      `  esta corrida: ${RUNTIME_PLATFORM.label} · observado ${observedMs} ms — el baseline tiene varias mediciones compatibles (${current.candidates.join(", ")}) y no se puede elegir una con certeza: no se atribuye ninguna.`,
    );
  } else {
    lines.push(
      `  esta corrida: ${RUNTIME_PLATFORM.label} · observado ${observedMs} ms — ${current.reason}; los ms de arriba pertenecen a otra(s) plataforma(s) y NO son comparables con este numero.`,
    );
  }
  return lines;
};

const tailOf = (stdout, stderr) => {
  const text = `${stdout ?? ""}${stderr ?? ""}`;
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.slice(-TAIL_LINES);
};

// --- ejecucion --------------------------------------------------------------
out(`Suites descubiertas: ${allSuites.length}${filters.length ? ` — a ejecutar: ${suites.length} (filtro: ${filters.join(", ")})` : ""}`);
out(`Baseline: ${useBaseline ? (baselineLoaded ? `activo — ${baseline.size} fallo(s) conocido(s)` : "no disponible") : "DESACTIVADO (--no-baseline) — estado crudo"}`);
out(`Modo: secuencial, 1 suite a la vez · timeout ${SUITE_TIMEOUT_MS} ms por suite`);
out();

if (listOnly) {
  for (const file of suites) out(`  ${suiteName(file)}`);
  process.exit(0);
}

/** @type {Array<{name:string, status:"PASS"|"FAIL"|"TIMEOUT", exitCode:number|null, ms:number, tail:string[]}>} */
const results = [];
const startedAt = Date.now();

for (let i = 0; i < suites.length; i++) {
  const file = suites[i];
  const name = suiteName(file);
  const label = `[${String(i + 1).padStart(2, " ")}/${suites.length}] ${name}`;
  const t0 = Date.now();

  // argv separado — nunca un string de shell. Sintaxis POSIX (2>/dev/null,
  // || true) no se interpreta en cmd.exe y falla en silencio en Windows.
  const r = spawnSync(process.execPath, [join(SCRIPTS_DIR, file)], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: SUITE_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const ms = Date.now() - t0;
  const timedOut = r.error?.code === "ETIMEDOUT" || (r.status === null && r.signal !== null);
  const status = timedOut ? "TIMEOUT" : r.status === 0 ? "PASS" : "FAIL";
  const tail = status === "PASS" ? [] : tailOf(r.stdout, r.stderr);
  if (status !== "PASS" && r.error && !timedOut) tail.push(`spawn error: ${r.error.message}`);

  results.push({ name, status, exitCode: r.status, ms, tail });
  out(`${label} — ${status}${status === "FAIL" ? ` (exit ${r.status})` : ""} · ${ms} ms`);
}

const totalMs = Date.now() - startedAt;

// --- clasificacion ----------------------------------------------------------
const failed = results.filter((r) => r.status !== "PASS");
const passed = results.filter((r) => r.status === "PASS");
const timeouts = results.filter((r) => r.status === "TIMEOUT");

// Un fallo baselineado solo cuenta como conocido si ademas falla en el MODO
// declarado. Si la suite esta en el baseline pero el status observado no
// coincide con `expected_status`, no estamos viendo la causa declarada: es un
// desvio de modo y tiene su propia categoria (nunca se mezcla con los fallos
// nuevos, porque el diagnostico es distinto).
const baselinedFailures = useBaseline ? failed.filter((r) => baseline.has(r.name)) : [];
const knownFailures = baselinedFailures.filter(
  (r) => r.status === expectedStatusOf(baseline.get(r.name)),
);
const modeDeviations = baselinedFailures.filter(
  (r) => r.status !== expectedStatusOf(baseline.get(r.name)),
);
const newFailures = useBaseline ? failed.filter((r) => !baseline.has(r.name)) : failed;
// Baseline obsoleto: declarada como fallo conocido, se ejecuto, y ahora pasa.
const executed = new Set(results.map((r) => r.name));
const staleBaseline = useBaseline
  ? [...baseline.keys()].filter((n) => executed.has(n) && passed.some((r) => r.name === n))
  : [];

// --- detalle de fallos (siempre, nunca se oculta) ---------------------------
if (failed.length) {
  out();
  out("=".repeat(72));
  out("DETALLE DE FALLOS");
  out("=".repeat(72));
  for (const r of failed) {
    const entry = useBaseline ? baseline.get(r.name) : undefined;
    const expected = entry ? expectedStatusOf(entry) : null;
    const modeMismatch = Boolean(entry) && r.status !== expected;
    let tag = "[FALLO NUEVO]";
    if (entry && modeMismatch) tag = `[DESVIO DE MODO — se esperaba ${expected}, se observo ${r.status}]`;
    else if (entry) tag = "[FALLO CONOCIDO — baselineado]";
    out();
    out(`${r.status} ${r.name}  ${tag} · ${r.ms} ms · exit ${r.exitCode}`);
    if (entry) {
      const observedNote = modeMismatch ? ` · modo observado: ${r.status}` : "";
      out(`  modo declarado: ${expected}${observedNote}`);
      for (const line of durationLines(entry, r.ms)) out(line);
      out(`  razon baselineada: ${entry.reason}`);
      out(`  referencia: ${entry.reference}`);
      if (modeMismatch) {
        out("  ATENCION: este NO es el fallo conocido. El baseline declara una causa raiz");
        out("  concreta y un modo de falla; otro modo puede ser una causa nueva (por ejemplo");
        out("  un cuelgue introducido recientemente) o contencion del entorno. Diagnosticar");
        out("  antes de tocar el baseline o el timeout.");
      }
    }
    out(`  ultimas ${TAIL_LINES} lineas de salida:`);
    for (const line of r.tail) out(`    | ${line}`);
  }
}

// --- resumen ----------------------------------------------------------------
out();
out("=".repeat(72));
out("RESUMEN");
out("=".repeat(72));
out(`Total ejecutadas : ${results.length}`);
out(`Pasaron          : ${passed.length}`);
out(`Fallaron         : ${failed.length - timeouts.length}`);
out(`Timeouts         : ${timeouts.length}`);
if (useBaseline) {
  out(`Fallos conocidos : ${knownFailures.length} (baselineados, en el modo declarado)`);
  out(`Desvios de modo  : ${modeDeviations.length} (baselineados, modo distinto al declarado)`);
  out(`Fallos NUEVOS    : ${newFailures.length}`);
  out(`Baseline obsoleto: ${staleBaseline.length}`);
}
out(`Duracion total   : ${totalMs} ms (${(totalMs / 1000).toFixed(1)} s)`);

let exitCode = 0;

if (useBaseline) {
  if (knownFailures.length) {
    out();
    out("-".repeat(72));
    out(`ATENCION: ${knownFailures.length} FALLO(S) CONOCIDO(S) siguen rojos y NO estan resueltos.`);
    out("Estan declarados en el baseline con causa raiz y dueno — no suprimidos.");
    for (const r of knownFailures) out(`  - ${r.name}: ${baseline.get(r.name).reason}`);
    out("Documento de referencia:");
    out("  docs/testing/2026-08-03-001-VERIFY-001-preexisting-test-suite-defects.md");
    out(`Declaracion del baseline: ${BASELINE_REL}`);
    out("-".repeat(72));
  }

  if (modeDeviations.length) {
    out();
    out(`FALLO DEL CONTROL: ${modeDeviations.length} suite(s) baselineada(s) fallaron en un MODO distinto al declarado:`);
    for (const r of modeDeviations) {
      const expected = expectedStatusOf(baseline.get(r.name));
      out(`  - ${r.name}: modo de falla distinto al declarado: se esperaba ${expected}, se observo ${r.status} (exit ${r.exitCode}, ${r.ms} ms)`);
    }
    out("El baseline absorbe una causa raiz declarada, no cualquier forma de fallar.");
    out("Un TIMEOUT donde se declaro FAIL puede ser un cuelgue nuevo (deadlock, regresion");
    out("de performance) o contencion del entorno: diagnosticar la causa antes de cambiar");
    out(`el modo declarado en ${BASELINE_REL}. NO reescribir expected_status para silenciarlo.`);
    exitCode = 1;
  }

  if (newFailures.length) {
    out();
    out(`FALLO DEL CONTROL: ${newFailures.length} suite(s) fallan y NO estan en el baseline:`);
    for (const r of newFailures) out(`  - ${r.name} (${r.status}, exit ${r.exitCode}, ${r.ms} ms)`);
    out("Arreglar el defecto. NO agregarlas al baseline para silenciarlas.");
    exitCode = 1;
  }

  if (staleBaseline.length) {
    out();
    out(`BASELINE OBSOLETO: ${staleBaseline.length} suite(s) declaradas como fallo conocido ahora PASAN:`);
    for (const n of staleBaseline) out(`  - ${n}`);
    out(`Quitarlas de ${BASELINE_REL} y actualizar el documento de referencia.`);
    out("Un baseline que quedo viejo es un fallo del control, no una buena noticia silenciosa.");
    exitCode = 1;
  }

  if (!exitCode) {
    out();
    out(knownFailures.length
      ? "VEREDICTO: OK — los fallos observados coinciden exactamente con el baseline."
      : "VEREDICTO: OK — todas las suites ejecutadas pasaron.");
  } else {
    out();
    out("VEREDICTO: FALLO — ver secciones de arriba.");
  }
} else {
  out();
  out(failed.length
    ? `VEREDICTO (crudo, sin baseline): ${failed.length} suite(s) fallan.`
    : "VEREDICTO (crudo, sin baseline): todas las suites pasaron.");
  if (failed.length) {
    for (const r of failed) out(`  - ${r.name} (${r.status}, exit ${r.exitCode}, ${r.ms} ms)`);
    exitCode = 1;
  }
}

process.exit(exitCode);
