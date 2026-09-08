# Impacto y plan de migración — Arquitectura unificada de specs

## 1. Resultado sobre los tres bloqueantes

| Bloqueante | Causa | Solución |
|---|---|---|
| Producto vs BA | dos autoridades pueden escribir el mismo concern | BA queda como writer funcional; Strategy se limita; Producto se redistribuye |
| Layout plano vs carpetas | el modo de trabajo define otra representación | un paquete SPEC-001 para todos los modos; ART-001 queda para evidencia |
| INDEX mutable dentro del hash | contrato y operación comparten documento/hash | `index.md` mantiene estado vivo; el gate genera snapshot ART-001 inmutable |

No se necesita handoff entre flujos: solo cambia el conjunto de dominios activos
y el estado del mismo paquete.

## 2. Impacto en lo ya diseñado

### 2.1 Decisiones conservadas

- perfiles modifican preferencia/contexto, no authority;
- núcleo compacto y especialización bajo demanda;
- crossover temporal entre áreas;
- Security transversal;
- auditoría conservadora;
- specs funcionales y técnicas separadas por concern;
- evidencia de gates y change control.

### 2.2 Decisiones reemplazadas

- coexistencia de dos layouts;
- `sofka-asdd-producto` como owner de discovery y toda documentación;
- Layout A plano como formato de specs vivas;
- adopción manual de una spec standalone mediante copia/conversión;
- INDEX como mezcla de plan congelado y ledger operativo.

### 2.3 Perfiles profesionales

El perfil Management no se convierte en autoridad funcional. Su capacidad
especializada es Product Strategy. El perfil Functional/BA conserva el
ownership de requisitos y specs. Development consume specs y escribe diseño o
evidencia. Elegir un perfil sigue siendo una preferencia de contexto, nunca un
permiso adicional.

## 3. Superficies técnicas impactadas

| Grupo | Cambios esperados |
|---|---|
| Agentes | nuevo Strategy; BA como fuente funcional; retiro de Producto |
| Skills | renombre/redistribución de siete capabilities; templates neutrales |
| Routing | intención → concern/owner, no intención → flujo alternativo |
| Workflow | gates funcional, técnico y Build sobre el mismo paquete |
| Naming | nuevo SPEC-001; ART-001 conserva evidencia |
| Guards | allowlist de paths semánticos, ownership y CR |
| State | `.asdd-run.json` enlaza paquete/snapshot; no duplica estado de nodo |
| Manifests | capability, rule, coordinator, CLI contract y lock |
| Commands | Specify/Analyze/Design/Build resuelven el mismo package root |
| Validators | schema/path/links/IDs/owners/legacy writers |
| CLI | distribución completa y migración de consumidores |
| Docs/evals | ADRs, catálogo visible, changelog, fixtures y golden prompts |

## 4. Estrategia de migración

### Ola 0 — Contrato y baseline

- aprobar CR, ADR y SPEC-001;
- congelar inventario de producers, consumers y paths legacy;
- añadir casos de prueba antes de cambiar runtime;
- definir fixture ejemplo y fixture legacy ambiguo.

**Gate:** diseño aprobado y cobertura del inventario verificable.

### Ola 1 — Readers compatibles

- enseñar a índice, routing, validators y comandos a leer SPEC-001;
- conservar lectura 3.x;
- diagnosticar duplicados y ambigüedad sin mover archivos;
- no habilitar todavía writers nuevos en producción.

**Gate:** un proyecto 3.x abre sin regresión y un fixture SPEC-001 se resuelve.

### Ola 2 — Writers SPEC-001

- introducir templates neutrales;
- migrar BA para escribir `functional/`;
- migrar dominios técnicos a `technical/`;
- migrar Tech Lead a `implementation/plan.md`;
- generar snapshots ART-001 en gates.

**Gate:** todos los writers nuevos producen solo paths SPEC-001.

### Ola 3 — Producto y routing

- crear Product Strategy limitada;
- dividir PO por intención;
- redirigir aliases de capabilities;
- retirar a Producto del routing primario;
- actualizar catálogo, manifests y evals.

**Gate:** cero invocaciones nuevas al agente genérico en la suite.

### Ola 4 — Migración de consumidores

Clasificar cada proyecto:

| Clase | Condición | Acción |
|---|---|---|
| A | un único conjunto legacy, mapeo inequívoco | migración asistida |
| B | layouts duales con contenido equivalente | comparar, elegir autoridad y registrar decisión |
| C | contenido divergente | STOP; resolución humana por CR |
| D | solo evidencia histórica | conservar; enlazar desde manifest |

La herramienta de migración debe ofrecer `scan` y `plan` read-only antes de
`apply`. Nunca sobreescribe ni borra archivos legacy automáticamente.

**Gate:** dry-run reproducible, backup/rollback y aprobación del maintainer.

### Ola 5 — Retiro y release

- eliminar writers y rutas legacy después de la ventana;
- validar instalación limpia y upgrade;
- ejecutar matriz completa Linux/macOS/Windows;
- publicar `4.0.0` solo desde `main`;
- crear tag inmutable sobre el commit desplegado.

## 5. Orden recomendado de implementación

1. schema y librería de resolución SPEC-001;
2. validator y fixtures;
3. templates neutrales;
4. índice y change control;
5. writers BA;
6. writers técnicos y Tech Lead;
7. Product Strategy y aliases;
8. routing/workflows/commands;
9. manifests, CLI y catálogo;
10. migrador y compatibilidad;
11. evals E2E y documentación de adopción;
12. release mayor.

Este orden evita eliminar el productor viejo antes de tener destino y evita
crear paths nuevos que ningún consumer pueda leer.

## 6. Matriz mínima de pruebas

| Caso | Resultado esperado |
|---|---|
| crear nodo `1.1.1-gestion-clientes` | estructura válida, un solo owner funcional |
| BA standalone inicia y equipo adopta | mismo path, sin copia |
| developer detecta RN faltante | CR; no edita funcional |
| dominio `data = n/a` | no crea `technical/data.md`; INDEX lo registra |
| dos paquetes con mismo EDT | validator bloquea |
| spec legacy única | scan propone mapping |
| dos specs legacy divergentes | migración bloqueada |
| cambio posterior a aprobación | decision/CR + reapertura de gates |
| snapshot de gate | ART-001 inmutable enlaza commit SPEC-001 |
| alias `producto-pm` | redirige a Strategy con warning |
| intención antigua ambigua `producto-po` | pide clasificación; no usa genérico |
| instalación/upgrade CLI | todos los archivos y manifests presentes |

## 7. Rollback

Por cada ola:

1. cambios en una única feature branch;
2. fixture y tests antes del corte;
3. sin borrar legacy durante compatibilidad;
4. revert normal, nunca rebase/force push;
5. si una migración `apply` falla, restaurar desde backup y conservar reporte;
6. si `4.0.0` ya fue publicada, corregir mediante nueva versión, nunca mover tag.

## 8. Riesgos residuales

- proyectos con specs divergentes requieren decisión humana;
- IDs funcionales legacy pueden colisionar;
- aliases demasiado largos pueden perpetuar deuda;
- archivos compartidos aumentan conflictos si ownership no se aplica;
- el nombre final del nuevo agente Strategy y la duración exacta de la ventana
  deprecada deben cerrarse en el slice de implementación;
- la major no elimina la necesidad de guía de upgrade para consumidores.

## 9. Próximo checkpoint

Antes de Build se requiere aprobación explícita de:

1. inventario exacto de archivos a modificar;
2. schema ejecutable de SPEC-001;
3. nombres públicos definitivos de agente/capabilities;
4. política y duración de compatibilidad;
5. fixtures, comandos, validaciones y rollback;
6. alcance de la primera ola implementable.
