# SPEC-001 — Contrato de paquete vivo de especificaciones

| Campo | Valor |
|---|---|
| ID | `SPEC-001` |
| Versión del contrato | `1.0-draft-approved` |
| Estado | Diseño aprobado; enforcement pendiente |
| Aplica desde | release objetivo `4.0.0` |
| No reemplaza | ART-001 para evidencia de runs |

## 1. Propósito

Definir la identidad, estructura, ownership y lifecycle de una especificación
viva sin usar el run que la creó como parte de su nombre permanente.

## 2. Identidad y path

```text
docs/specs/{initiative-slug}/nodes/{edt-code}-{node-slug}/
```

### 2.1 Reglas

- `initiative-slug`: ASCII kebab-case, estable durante la iniciativa.
- `edt-code`: segmentos numéricos separados por punto, por ejemplo `1.1.1`.
- `node-slug`: ASCII kebab-case.
- solo el código EDT usa puntos;
- exactamente un guion separa código y slug;
- la identidad lógica es `{initiative-slug, edt-code}`;
- renombrar el título no crea otro nodo; requiere una decisión registrada;
- mover un nodo de iniciativa o cambiar su código es una migración explícita.

Patrón de directorio del nodo:

```regex
^[0-9]+(?:\.[0-9]+)*-[a-z0-9]+(?:-[a-z0-9]+)*$
```

## 3. Estructura canónica

```text
{edt-code}-{node-slug}/
├── index.md
├── decisions.md
├── functional/
│   ├── spec.md
│   ├── requirements.md
│   ├── audit.md
│   ├── client-validation.md
│   └── user-stories.md
├── technical/
│   ├── architecture.md
│   ├── backend.md
│   ├── frontend.md
│   ├── design.md
│   ├── security.md
│   ├── data.md
│   ├── devops.md
│   └── qa.md
└── implementation/
    ├── plan.md
    └── evidence/
        └── README.md
```

Los directorios existen cuando al menos uno de sus archivos aplica. No se crean
archivos vacíos para dominios `n/a`.

## 4. Semántica de archivos

| Ruta | Obligación | Contenido exclusivo |
|---|---|---|
| `index.md` | obligatoria | metadata, links, aplicabilidad, estados y gates |
| `decisions.md` | obligatoria | ADR/CR local append-only y referencias |
| `functional/spec.md` | obligatoria | actores, alcance, procesos, estados, excepciones |
| `functional/requirements.md` | obligatoria | registro normativo RN/HU/AC con IDs estables |
| `functional/audit.md` | antes de DOR | hallazgos, MECE, coherencia y gaps |
| `functional/client-validation.md` | antes de DOR | aprobación/rechazo y observaciones del negocio |
| `functional/user-stories.md` | si backlog ágil aplica | proyección de HU, sin duplicar RN/AC |
| `technical/architecture.md` | si hay implementación | contexto, decisiones cross-domain y contratos |
| `technical/{domain}.md` | condicional | diseño del dominio para satisfacer IDs funcionales |
| `implementation/plan.md` | antes de Build | secuencia, dependencias, paths y riesgos |
| `implementation/evidence/` | durante Build/Verify | evidencia enlazada, no requisitos nuevos |

### 4.1 Funcional frente a técnico

Una especificación **funcional** responde:

- qué problema y outcome se cubren;
- quién actúa y con qué permisos de negocio;
- qué comportamiento, reglas y excepciones son válidos;
- qué condiciones observables permiten aceptar el resultado.

Una especificación **técnica** responde:

- qué arquitectura, interfaces, datos y controles implementan esas condiciones;
- qué decisiones y trade-offs adopta cada dominio;
- cómo se verifican RN/HU/AC sin redefinirlos.

Ejemplo:

```text
RN-014: un cliente bloqueado no puede emitir pedidos.
AC-022: dado un cliente bloqueado, al intentar emitir, se rechaza la operación.
```

`technical/backend.md` puede decidir devolver `409 CUSTOMER_BLOCKED` y
`technical/frontend.md` puede definir cómo presentar el error. Ninguno cambia
qué significa “cliente bloqueado” ni crea otro AC.

## 5. Contrato mínimo de `index.md`

```yaml
spec_contract: SPEC-001
initiative: portal-comercial
edt_code: 1.1.1
node_slug: gestion-clientes
title: Gestión de clientes
functional_state: draft
technical_state: not_started
implementation_state: not_started
origin_run: 2026-07-25-001
```

Estados válidos por concern:

```text
not_started | draft | in_review | approved | blocked | superseded | n/a
```

Después del bloque de metadata, `index.md` contiene:

1. tabla de aplicabilidad y owner;
2. links relativos a archivos existentes;
3. gates DOR/Build/Verify;
4. último CR aplicado;
5. ledger operativo append-only.

No contiene requisitos, diseño técnico ni evidencia detallada.

## 6. Ownership

| Ruta | Puede escribir | Puede proponer cambio |
|---|---|---|
| `functional/spec.md`, `requirements.md`, `user-stories.md` | BA Specification Lead | cualquier rol vía CR |
| `functional/audit.md` | BA Specification Auditor | BA/SME |
| `functional/client-validation.md` | BA Specification Lead | stakeholder/PO input |
| `technical/architecture.md` | Solution Architect | dominios técnicos |
| `technical/backend.md` | Backend | BA, Architecture, Security, QA |
| `technical/frontend.md` | Frontend | BA, Design, Security, QA |
| `technical/design.md` | UX/UI | BA, Frontend, Accessibility |
| `technical/security.md` | Security | cualquier dominio |
| `technical/data.md` | Data owner | BA, Backend, Security |
| `technical/devops.md` | DevOps | Architecture, developers, Security |
| `technical/qa.md` | QA | BA y dominios técnicos |
| `implementation/plan.md` | Tech Lead | implementadores |
| `implementation/evidence/` | implementador/verificador | — |
| `index.md` | capability de índice | todos reportan transición |
| `decisions.md` | owner de la decisión | todos |

“Puede proponer” no concede escritura directa al concern normativo.

## 7. Lifecycle y gates

```text
Discover → Functional DOR → Technical DOR → Ready for Build → Verified
```

### Functional DOR

- `spec.md` y `requirements.md` completos;
- auditoría sin P1 abierto;
- validación del cliente registrada;
- IDs RN/HU/AC únicos y enlazables;
- gaps bloqueantes resueltos o aceptados.

### Technical DOR

- aplicabilidad definida;
- `architecture.md` aprobado cuando corresponda;
- cada dominio aplicable enlaza los IDs funcionales que satisface;
- seguridad y QA revisadas por señal;
- decisiones cross-domain registradas.

### Ready for Build

- ambos DOR aprobados;
- `implementation/plan.md` completo;
- no existen dos fuentes activas para ningún concern.

## 8. Change control

1. El solicitante agrega un CR a `decisions.md`.
2. El owner del concern evalúa impacto.
3. Si cambia comportamiento, primero se actualiza `functional/`.
4. Los dominios técnicos actualizan solo referencias afectadas.
5. `index.md` registra la transición y el último CR.
6. El gate relevante vuelve a `in_review`.

El ledger operativo puede cambiar sin recalcular el hash de un snapshot ART-001.
Un gate importante genera una evidencia ART-001 que referencia el commit y las
rutas SPEC-001 evaluadas.

## 9. Relación con ART-001

| Necesidad | Convención |
|---|---|
| Spec viva del nodo | SPEC-001 |
| Reporte puntual de auditoría de un run | ART-001 |
| Baseline o snapshot firmado | ART-001 |
| Registro de estado actual | `index.md` SPEC-001 |
| Evidencia de aprobación | ART-001 enlazando commit/path |

Un archivo ART-001 no se edita para mantenerlo “actual”. Un archivo SPEC-001 no
se copia con otro run para representar una revisión.

## 10. Ejemplo práctico

```text
docs/specs/portal-comercial/nodes/1.1.1-gestion-clientes/
  index.md
  decisions.md
  functional/spec.md
  functional/requirements.md
  functional/audit.md
  functional/client-validation.md
  functional/user-stories.md
  technical/architecture.md
  technical/backend.md
  technical/frontend.md
  technical/security.md
  technical/qa.md
  implementation/plan.md
  implementation/evidence/README.md
```

El developer backend lee `index.md`, los IDs relevantes de `functional/`,
`technical/architecture.md` y `technical/backend.md`. Si descubre que falta la
regla de reactivación del cliente, no agrega la regla a backend: abre un CR para
que BA actualice la fuente funcional.

## 11. Validaciones requeridas para enforcement

- unicidad de `{initiative, edt_code}`;
- regex de path;
- filenames internos permitidos;
- links relativos existentes;
- IDs funcionales únicos;
- archivos técnicos sin definiciones normativas huérfanas;
- owner válido por transición;
- ausencia de writers legacy después de migración;
- evidencia ART-001 para gates aprobados.
