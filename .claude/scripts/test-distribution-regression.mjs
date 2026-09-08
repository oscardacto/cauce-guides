#!/usr/bin/env node
/**
 * test-distribution-regression.mjs — comportamiento del check `distribution-regression` de
 * validate-template.mjs.
 *
 * POR QUÉ CON UN REPO FIXTURE Y NO CONTRA ESTE REPO
 *
 * El check compara la `distribution` de hoy contra la de cada release publicada, así que su
 * entrada es la HISTORIA de un repo. Probarlo contra este repo solo permitiría afirmar «hoy
 * está verde», que es justo lo que no hace falta verificar: lo que hay que fijar es que se
 * ponga ROJO cuando una ruta publicada deja de distribuirse, y que NO se ponga rojo en los
 * tres casos que se le parecen —una reubicación declarada, un cambio de granularidad y un
 * retiro deliberado—. Eso exige historias distintas, y se construyen acá.
 *
 * El fixture es un repo git de verdad, con un tag y un contrato en ese tag. El validador
 * deriva su raíz de la ubicación del propio script, así que copiarlo dentro del fixture es lo
 * que hace que valide el fixture y no este repositorio.
 *
 * Los otros ~40 checks también corren sobre el fixture y casi todos fallan: al fixture le
 * faltan agentes, skills, hooks y manifiestos. Es esperado y no se asevera nada sobre ellos.
 * Se lee `--json` para quedarse solo con los hallazgos de este check, y la línea humana de
 * stderr para los casos donde lo que importa es el mensaje y no un hallazgo.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const SCRIPTS = import.meta.dirname;
const CHECK = 'distribution-regression';
const CONTRACT = '.sofka-asdd/cli-contract.json';
const MAINTAINER_MARKER = '.claude/scripts/sofka-asdd-gen-provenance.mjs';

const fixture = mkdtempSync(resolve(tmpdir(), 'asdd-dist-regression-'));
const at = (...segs) => join(fixture, ...segs);

function write(rel, content) {
  mkdirSync(dirname(at(rel)), { recursive: true });
  writeFileSync(at(rel), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

function git(args) {
  const r = spawnSync('git', args, { cwd: fixture, encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

/** Identidad y firma por invocación: el fixture no toca la config global de nadie. */
function commit(message) {
  git(['-c', 'user.email=fixture@asdd.local', '-c', 'user.name=fixture',
    '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', message]);
}

/** Corre el validador dentro del fixture y separa lo de este check del resto. */
function runCheck() {
  const r = spawnSync(process.execPath, [at('.claude/scripts/validate-template.mjs'), '--json'], {
    cwd: fixture,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  let findings;
  try {
    findings = JSON.parse(r.stdout).filter((f) => f.issue.startsWith(`${CHECK} —`));
  } catch {
    assert.fail(`el validador no emitió JSON parseable. stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
  }
  const line = r.stderr.split(/\r?\n/).find((l) => l.includes(CHECK)) ?? '';
  return { findings, line };
}

const contractAtTag = {
  distribution: ['a.md', 'sub/', 'ASDD-CHANGELOG.md', CONTRACT],
};

/**
 * El contrato del working tree por caso. La historia queda fija; lo único que varía entre
 * casos es la distribución de HOY, que es exactamente la variable que el check evalúa.
 */
const cases = [
  {
    name: 'una ruta publicada que hoy no se distribuye ni se declara movida es un hallazgo',
    contract: { distribution: ['sub/', 'ASDD-CHANGELOG.md', CONTRACT] },
    expect: ({ findings }) => {
      assert.equal(findings.length, 1, `esperaba 1 hallazgo, hubo ${findings.length}: ${JSON.stringify(findings)}`);
      assert.match(findings[0].issue, /\ba\.md\b/u, 'el hallazgo tiene que nombrar la ruta caída');
      assert.match(findings[0].issue, /v1\.0\.0/u, 'el hallazgo tiene que decir dónde se entregó');
      assert.equal(findings[0].level, 'error');
    },
  },
  {
    name: 'un `moves` hacia un destino distribuido explica la caída y no deja hallazgo',
    contract: {
      distribution: ['b.md', 'sub/', 'ASDD-CHANGELOG.md', CONTRACT],
      moves: [{ from: 'a.md', to: 'b.md' }],
    },
    expect: ({ findings }) => {
      assert.equal(findings.length, 0, `un movimiento declarado no es una regresión: ${JSON.stringify(findings)}`);
    },
  },
  {
    name: 'un `moves` hacia un destino que tampoco se distribuye sigue siendo un hallazgo',
    contract: {
      distribution: ['sub/', 'ASDD-CHANGELOG.md', CONTRACT],
      moves: [{ from: 'a.md', to: 'z.md' }],
    },
    expect: ({ findings }) => {
      assert.equal(findings.length, 1, `esperaba 1 hallazgo, hubo ${findings.length}`);
      assert.match(findings[0].issue, /z\.md/u, 'el hallazgo tiene que nombrar el destino que no se distribuye');
    },
  },
  {
    name: 'enumerar los archivos de un directorio que antes se declaraba entero no es una caída',
    contract: { distribution: ['a.md', 'sub/x.md', 'sub/y.md', 'ASDD-CHANGELOG.md', CONTRACT] },
    expect: ({ findings }) => {
      assert.equal(findings.length, 0, `cambiar la granularidad no retira nada: ${JSON.stringify(findings)}`);
    },
  },
  {
    name: 'un retiro deliberado se absorbe con su razón y queda visible en el mensaje',
    contract: { distribution: ['a.md', 'sub/', CONTRACT] },
    expect: ({ findings, line }) => {
      assert.equal(findings.length, 0, `un retiro con razón declarada no es un hallazgo: ${JSON.stringify(findings)}`);
      assert.match(line, /RETIRO\(S\) deliberado\(s\)/u, 'el retiro tiene que verse aunque el check pase');
      assert.match(line, /ASDD-CHANGELOG\.md/u, 'el mensaje tiene que nombrar la ruta retirada');
    },
  },
];

try {
  // Historia: un solo commit, tageado. El working tree del fixture arranca con todos los
  // archivos que el tag entregaba, más `b.md`, que existe pero el tag no declaraba.
  git(['init', '-b', 'main', '--quiet']);
  write('a.md', '# a\n');
  write('b.md', '# b\n');
  write('sub/x.md', '# x\n');
  write('sub/y.md', '# y\n');
  write('ASDD-CHANGELOG.md', '# changelog\n');
  write(CONTRACT, contractAtTag);
  cpSync(join(SCRIPTS, 'validate-template.mjs'), at('.claude/scripts/validate-template.mjs'));
  cpSync(join(SCRIPTS, 'lib'), at('.claude/scripts/lib'), { recursive: true });
  // `.claude/scripts/lib/` importa de `.claude/hooks/_lib/`, así que el validador no arranca
  // sin ese árbol.
  cpSync(resolve(SCRIPTS, '..', 'hooks', '_lib'), at('.claude/hooks/_lib'), { recursive: true });
  // Marcador de repo de mantenedor. Vacío a propósito: el check solo mira que exista, y un
  // generador de verdad querría recorrer la historia completa del fixture.
  write(MAINTAINER_MARKER, '// fixture\n');
  git(['add', '-A']);
  commit('fixture v1.0.0');
  git(['tag', 'v1.0.0']);

  // El tip avanza dejando de declarar `a.md`. Así el tag es el ÚNICO ref que la publicó, y el
  // hallazgo puede afirmarse contra un ref concreto. Con las dos refs en el mismo commit el
  // check reporta el tip —el dato más urgente, porque es lo que se entrega hoy— y el caso no
  // distinguiría una cosa de la otra.
  write(CONTRACT, { distribution: ['sub/', 'ASDD-CHANGELOG.md', CONTRACT] });
  git(['add', '-A']);
  commit('el tip deja de declarar a.md');

  let passed = 0;
  for (const c of cases) {
    write(CONTRACT, c.contract);
    const result = runCheck();
    assert.notEqual(result.line, '', `el check ${CHECK} no apareció en la salida — ¿se renombró?`);
    c.expect(result);
    passed += 1;
  }

  // Sin el tooling de mantenedor el repo es un consumidor: sus tags contienen el contrato del
  // template porque viene distribuido, y compararlos daría hallazgos ciertos pero ajenos.
  write(CONTRACT, cases[0].contract);
  rmSync(at(MAINTAINER_MARKER));
  const consumer = runCheck();
  assert.equal(consumer.findings.length, 0, `en un repo consumidor el check no puede reportar: ${JSON.stringify(consumer.findings)}`);
  assert.match(consumer.line, /skipped/u, 'el skip tiene que ser explícito, no un verde silencioso');
  passed += 1;

  console.log(`PASS ${CHECK}: ${passed} caso(s) — caída sin declarar, movimiento declarado, destino no distribuido, cambio de granularidad, retiro deliberado y skip en repo consumidor`);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
