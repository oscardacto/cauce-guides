#!/usr/bin/env node
// .claude/hooks/_lib/sofka-asdd-hueco-clasificacion.mjs
//
// Describe, en texto, el hueco de clasificación que produjo un `ask` de ORC-000.
//
// POR QUÉ NO ESCRIBE NADA A DISCO (decisión del usuario, 2026-08-25).
// Una versión anterior de este mecanismo persistía cada hueco en
// `.claude/.runtime/orchestrator-guard/incidencias.jsonl`, lo compactaba por
// huella y lo entregaba en informes fechados. Se eliminó: el framework no guarda
// datos de la operación del usuario. La descripción viaja en el mensaje del `ask`,
// que es donde el humano ya está mirando, y de ahí la levantará el
// sofka-collector cuando exista. Mientras no exista, el hueco se lee en el chat y
// se resuelve a mano — que es exactamente lo que hacía falta.
//
// CONSECUENCIA: no hay contador de ocurrencias, no hay deduplicación por huella y
// no hay archivo que entregar. Si el mismo hueco aparece tres veces, se describe
// tres veces. Agregar persistencia acá es volver atrás una decisión explícita.
//
// LO QUE SÍ SE CONSERVA: los valores se DESCARTAN, no se enmascaran. Enmascarar
// exige saber de antemano qué es sensible y filtra por longitud y estructura:
// siempre se escapa algo. `formaOperacion` construye la forma desde cero con tres
// piezas y nada más, así que un secreto en un argumento no puede llegar al
// mensaje — ni al chat, ni a lo que el collector lea de él mañana.

import { basename } from "node:path";

/** Tope duro de la forma; si se recorta, la descripción lo dice. */
export const TOPE_OPERACION = 120;

const SUBCOMANDO_RE = /^[a-z][a-z0-9:_-]{0,31}$/;
const FLAG_RE = /^--[a-z][a-z0-9-]{0,31}$/;
const LANZADOR_RE = /^(?:node|npx|python3?)$/;

/**
 * La FORMA del comando: ejecutable, subcomando y nombres de flags. Todo lo demás
 * —valores de argumentos, contenido de archivos, payloads JSON, rutas más allá
 * del nombre del script, flags de un guion— se descarta.
 */
export function formaOperacion(comando) {
  const tokens = String(comando ?? "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { operacion: "", truncado: false };

  const piezas = [];
  const ejecutable = basename(tokens[0].replaceAll("\\", "/").replace(/^["']|["']$/g, ""));
  piezas.push(ejecutable);

  let resto = tokens.slice(1);
  // `node <script>`: el script es parte de la identidad de la operación, pero
  // solo su nombre — nunca la ruta que lo precede.
  if (LANZADOR_RE.test(ejecutable) && resto[0] && !resto[0].startsWith("-")) {
    piezas.push(basename(resto[0].replaceAll("\\", "/")));
    resto = resto.slice(1);
  }
  if (resto[0] && !resto[0].startsWith("-") && SUBCOMANDO_RE.test(resto[0])) {
    piezas.push(resto[0]);
    resto = resto.slice(1);
  }
  for (const token of resto) {
    const nombre = token.split("=")[0];
    if (FLAG_RE.test(nombre) && !piezas.includes(nombre)) piezas.push(nombre);
  }

  const completa = piezas.join(" ");
  if (completa.length <= TOPE_OPERACION) return { operacion: completa, truncado: false };
  return { operacion: completa.slice(0, TOPE_OPERACION), truncado: true };
}

function intencionDe(operacion, motivo) {
  if (motivo.includes("script no declarado en el manifiesto")) {
    return "ejecutar un script del framework que el manifiesto de control-plane no declara";
  }
  return `ejecutar ${operacion.split(" ")[0] || "una operación"}, que no pertenece a ningún plano declarado`;
}

function sugerenciaDe(operacion, motivo) {
  const flags = operacion.split(" ").filter((token) => token.startsWith("--"));
  const cola = flags.length ? ` y sus flags válidos (${flags.join(" ")})` : "";
  const script = /script no declarado en el manifiesto: (\S+)/.exec(motivo);
  if (script) {
    return `declarar ${basename(script[1])} en CONTROL_PLANE con su plane, effects, callers${cola}`;
  }
  const ejecutable = operacion.split(" ")[0] || "el ejecutable";
  return `declarar ${ejecutable} en DOMAIN_EXEC con el agente al que se delega, o en CONTROL_PLANE si es del framework${cola}`;
}

/**
 * El texto del `ask`: intención y punto de entrada, no forensia. Tiene que ser
 * accionable por alguien que no estuvo ahí, y corto — se lee en el chat, no en un
 * informe.
 *
 * Devuelve UN string. No escribe, no lee y no toca el sistema de archivos.
 */
export function describirHueco({ segmento = "", motivo = "" } = {}) {
  const { operacion, truncado } = formaOperacion(segmento);
  const detalle = motivo || "el clasificador no resolvió el segmento";
  const manifiesto = motivo.includes("manifiesto")
    ? "sin entrada"
    : "no aplica: no es una invocación de script del proyecto";

  return [
    "ORC-000 no pudo clasificar esta operación. Es un hueco del manifiesto de",
    "control-plane, no una decisión de diseño: si la autorizás, el trabajo sigue.",
    "",
    `  intención   ${intencionDe(operacion, motivo)}`,
    `  operación   ${operacion}${truncado ? "  (recortada a 120 caracteres)" : ""}`,
    `  motivo      ${detalle}`,
    "  probado     plano: no resolvió a lectura segura, control-plane, integridad, dominio ni peligro",
    `              manifiesto: ${manifiesto}`,
    "              delegación: DOMAIN_EXEC no tiene el ejecutable, no hay agente a quien delegar",
    `  sugerencia  ${sugerenciaDe(operacion, motivo)}`,
    "",
    "Esto no se guarda en ningún archivo. «operación» es solo la forma del comando",
    "—ejecutable, subcomando y nombres de flags—: los valores no se copian.",
  ].join("\n");
}
