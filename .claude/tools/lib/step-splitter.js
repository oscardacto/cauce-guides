'use strict';
/**
 * ATF v2 — step-splitter.js
 *
 * Fragmenta pasos compuestos de `steps_raw` en pasos atómicos.
 * Heurística AGNÓSTICA a la app: no asume dominio (seguros, finanzas, retail,
 * etc.). Solo reconoce conjunciones explícitas del español + un lexicon genérico
 * de verbos acción (parametrizable).
 *
 * Se usa desde:
 *   - `cp-enricher.js` como aplicador determinista final (single source of truth).
 *   - `asdd-atf-web-enrichment-analyzer/SKILL.md` documenta el comportamiento para que el
 *     LLM razone sobre el output esperado, pero NO intenta fragmentar por su
 *     cuenta (evita alucinaciones).
 *
 * Relación con reglas:
 *   - REGLA 8 (no inventar pasos): NO la viola — la conjunción ya está en el
 *     texto escrito por el diseñador. Sólo explicita sintaxis compuesta.
 *   - REGLA 13 (fragmentación agnóstica): ver
 *     `.claude/reference/atf-web/asdd-atf-web-cp-enricher-invariants.md`.
 *
 * Contrato:
 *   splitStep(text:string) -> string[]             (fragmenta un step individual)
 *   splitStepsRaw(str:string) -> { result, splits_applied, input_lines, output_lines }
 *
 * CLI (self-test):
 *   node .claude/tools/lib/step-splitter.js
 *     → ejecuta 8 casos de prueba con resultado esperado.
 */

// Verbos acción que, al encontrarlos al inicio del segundo lado de una
// conjunción, CONFIRMAN que hay un paso separado (no un sustantivo compuesto).
// Lista conservadora, genérica en español.
const ACTION_VERBS = [
  // Persistencia / CRUD
  'guardar','guarda','guarde','guardo','guardar','guardó',
  'crear','crea','cree','creo','creó',
  'actualizar','actualiza','actualice','actualizo','actualizó',
  'modificar','modifica','modifique','modificó',
  'eliminar','elimina','elimine','eliminó','borrar','borra','borre',
  'confirmar','confirma','confirme','confirmó',
  'registrar','registra','registre','registró',
  'persistir','persiste','persista',
  // Navegación / UI
  'abrir','abre','abra','abrió',
  'cerrar','cierra','cierre','cerró',
  'navegar','navega','navegue','navegó',
  'ingresar','ingresa','ingrese','ingresó','ingreso',
  'escribir','escribe','escriba','escribió',
  'seleccionar','selecciona','seleccione','seleccionó',
  'marcar','marca','marque','marcó',
  'desmarcar','desmarca','desmarque',
  'hacer','hace','haga','hizo',
  'clicar','clica','clique','clicó',
  'presionar','presiona','presione','presionó','pulsar','pulsa','pulse',
  'activar','activa','active','activó',
  'desactivar','desactiva','desactive',
  'agregar','agrega','agregue','agregó','añadir','añade','añada','añadió',
  'quitar','quita','quite','quitó','remover','remueve','remueva','removió',
  'enviar','envia','envía','envie','envíe','envió',
  'cargar','carga','cargue','cargó',
  // Aserción / validación
  'validar','valida','valide','validó',
  'verificar','verifica','verifique','verificó',
  'comprobar','comprueba','compruebe','comprobó',
  'asegurar','asegura','asegure','aseguró',
  'consultar','consulta','consulte','consultó',
  'filtrar','filtra','filtre','filtró',
  'listar','lista','liste','listó',
  'mostrar','muestra','muestre','mostró',
  'visualizar','visualiza','visualice','visualizó',
];

// Sujetos comunes que preceden al verbo ("el usuario guarda", "el sistema calcula").
const SUBJECT_PREFIXES = [
  'el usuario ', 'la usuaria ',
  'el sistema ',
  'la aplicacion ', 'la aplicación ', 'la app ',
  'el cliente ', 'la cliente ',
  'el administrador ', 'la administradora ', 'el admin ',
  'el custodio ', 'la custodia ',
  'el operador ', 'la operadora ',
];

const MIN_FRAGMENT_LEN = 12;

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Determina si el fragmento empieza con un verbo acción reconocible.
 * Acepta tanto verbo directo ("Guarda X") como sujeto + verbo ("El usuario guarda X").
 */
function startsWithActionVerb(fragment) {
  const norm = normalize(fragment).trim();
  if (!norm) return false;
  const checkVerb = (s) => {
    for (const v of ACTION_VERBS) {
      if (s.startsWith(v + ' ') || s === v) return true;
    }
    return false;
  };
  if (checkVerb(norm)) return true;
  for (const prefix of SUBJECT_PREFIXES) {
    if (norm.startsWith(prefix)) {
      const rest = norm.slice(prefix.length).trim();
      if (checkVerb(rest)) return true;
    }
  }
  return false;
}

/**
 * Fragmenta UN step en N sub-steps si detecta conjunciones explícitas.
 * Retorna array de strings (1 entrada si no hay split).
 */
function splitStep(stepText) {
  const text = String(stepText || '').trim();
  if (!text) return [];

  const out = [];
  let start = 0;

  // Patrón 1 — " Y " mayúsculo (conjunción explícita de acciones)
  //   Sólo split si lado izquierdo ≥ MIN_FRAGMENT_LEN y lado derecho empieza con verbo.
  const upperYMatches = [];
  const reYUpper = / Y /g;
  let m;
  while ((m = reYUpper.exec(text)) !== null) {
    upperYMatches.push({ idx: m.index, len: 3 });
  }

  // Patrón 2 — conjunciones de secuencia (lowercase explícitas)
  const reSeq = /(, luego | luego de |, despu[eé]s |, posteriormente | posteriormente )/gi;
  const seqMatches = [];
  while ((m = reSeq.exec(text)) !== null) {
    seqMatches.push({ idx: m.index, len: m[0].length });
  }

  // Merge y ordenar por índice
  const candidates = [...upperYMatches, ...seqMatches].sort((a, b) => a.idx - b.idx);
  if (candidates.length === 0) return [text];

  for (const c of candidates) {
    if (c.idx < start) continue; // ya consumido por un split previo
    const left = text.slice(start, c.idx).trim();
    const right = text.slice(c.idx + c.len).trim();
    if (left.length < MIN_FRAGMENT_LEN) continue;
    if (!startsWithActionVerb(right)) continue;
    out.push(left);
    start = c.idx + c.len;
  }
  if (out.length === 0) return [text]; // ningún candidato pasó las salvaguardas
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * Aplica splitStep a cada línea de un `steps_raw` string.
 * Retorna { result, splits_applied, input_lines, output_lines }.
 */
function splitStepsRaw(stepsRawStr) {
  const raw = String(stepsRawStr || '');
  const lines = raw.split(/\r?\n/);
  const out = [];
  let splitsApplied = 0;
  let inputLines = 0;
  for (const line of lines) {
    // Parseo canónico: strip "- " / "N. " / "N) " y trim
    const cleaned = line.replace(/^\s*(?:-\s+|\d+[.)]\s+)?/, '').trim();
    if (!cleaned) continue;
    inputLines++;
    const parts = splitStep(cleaned);
    if (parts.length > 1) splitsApplied += parts.length - 1;
    for (const p of parts) out.push(p);
  }
  return {
    result: out.join('\n'),
    splits_applied: splitsApplied,
    input_lines: inputLines,
    output_lines: out.length,
  };
}

module.exports = { splitStep, splitStepsRaw, startsWithActionVerb };

// ─── Self-test CLI ─────────────────────────────────────────────────────────
if (require.main === module) {
  const cases = [
    {
      in: 'Cuando el sistema carga la fecha actual Y el usuario guarda el registro',
      expect: 2,
      note: 'CP-M3-001 — Y mayúscula con verbo acción al lado derecho → split',
    },
    {
      in: 'Cuando el usuario modifica la fecha de cierre Y guarda el registro',
      expect: 2,
      note: 'CP-M3-002 — Y mayúscula, 2do lado empieza con verbo directo',
    },
    {
      in: 'Cuando el usuario marca el checkbox Y guarda el hallazgo',
      expect: 2,
      note: 'CP-M3-005 — split OK',
    },
    {
      in: 'Cuando el usuario ingresa credenciales válidas',
      expect: 1,
      note: 'Single-action step → no split',
    },
    {
      in: 'Cuando el usuario hace clic en BUSCAR, luego verifica la tabla',
      expect: 2,
      note: 'Conjunción de secuencia explícita',
    },
    {
      in: 'El administrador y el custodio son roles del sistema',
      expect: 1,
      note: 'y minúscula entre sustantivos — NO split (no es verbo acción)',
    },
    {
      in: 'Guardar Y validar',
      expect: 1,
      note: 'lado izquierdo < 12 chars — salvaguarda anti-split',
    },
    {
      in: 'Cuando el sistema carga datos, luego el operador confirma',
      expect: 2,
      note: 'secuencia con sujeto+verbo → split',
    },
  ];

  let passed = 0;
  for (const c of cases) {
    const r = splitStepsRaw(c.in);
    const ok = r.output_lines === c.expect;
    console.log(ok ? '✓' : '✗', c.note);
    console.log('   IN :', c.in);
    console.log('   OUT:', r.result.replace(/\n/g, ' | '));
    console.log('   lines:', r.input_lines, '→', r.output_lines, '(splits:', r.splits_applied + ')');
    if (ok) passed++;
    console.log('');
  }
  console.log(`\n${passed}/${cases.length} casos OK`);
  process.exit(passed === cases.length ? 0 : 1);
}
