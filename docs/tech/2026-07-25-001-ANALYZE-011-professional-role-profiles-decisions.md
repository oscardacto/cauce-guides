# Registro de decisiones y gates — Perfiles profesionales ASDD

**Run:** `2026-07-25-001`
**Fase:** Analyze
**Corte:** publicación `SPIKE-1P`
**Naturaleza:** registro de evidencia; no sustituye un ADR

## 1. Propósito

Separar tres clases de información que no deben confundirse:

1. el plan aprobado y congelado en G0;
2. el estado/evidencia mutable de ejecución;
3. las recomendaciones provisionales que aún requieren decisión.

## 2. Plan congelado en G0

| Campo | Valor |
|---|---|
| Bundle | brief + cuatro specs + INDEX |
| Versión | `1.0-approved` |
| Hash canónico | `d2b1cb8153c2a9ef58b6387b88b550897ac1315e101cce778942415daad37e54` |
| Algoritmo | SHA-256 de arreglo JSON compacto `{path,sha256}` ordenado; celda del hash del INDEX normalizada a `<normalized>` |
| Autoridad concedida por G0 | únicamente `SPIKE-1R` read-only |

El hash preserva el contrato aprobado. No debe recalcularse silenciosamente para
hacer pasar como “el mismo plan” un bundle modificado.

## 3. Historial de gates y autorizaciones

| Fecha | Hito | Decisión | Efecto autorizado |
|---|---|---|---|
| 2026-07-25 | G0 | aprobado por el usuario | ejecutar `SPIKE-1R` bajo contrato cero-write |
| 2026-07-25 | SPIKE-1R | completado | producir evidencia temporal; cero cambios al repositorio |
| 2026-07-25 | G1 | aprobado por el usuario | aceptar la revisión del mapa y preparar publicación acotada |
| 2026-07-25 | checkpoint SPIKE-1P | presentado | declarar outputs, allowlist, validaciones y rollback exactos |
| 2026-07-25 | SPIKE-1P | autorizado por el usuario | publicar cinco artefactos y actualizar únicamente estado/manifest autorizados |

Ninguna de estas aprobaciones autoriza `SPIKE-2`, Design, Build, cambios de
runtime/routing, creación de perfiles o remediaciones oportunistas.

## 4. Resultado aceptado en G1

G1 aceptó como evidencia estructural:

- inventario de 809 entradas, 24 agentes, 153 skills locales y 40 comandos;
- cero escrituras durante `SPIKE-1R`;
- existencia de capacidades para seis perfiles provisionales;
- asimetría fuerte de journeys: QA y Data tienen entrada especializada;
- carga bajo demanda parcial: no existe evidencia de eager loading de las 153
  skills al inicio;
- drift de catálogo/SSOT, deuda eager en nueve agentes y 227 superficies
  explícitamente `unclassified`;
- cobertura parcial de Data, Management y Security;
- necesidad de una taxonomía y catálogo canónicos antes del diseño.

Aceptar evidencia no equivale a aprobar todas las recomendaciones derivadas.

## 5. Decisiones vigentes

### DV-001 — Perfiles como preferencia, no autoridad

**Estado:** vigente desde el plan G0.
El perfil puede modificar prioridad, lenguaje, descubrimiento y contexto, pero
no puede ampliar permisos, scope, commands, capabilities, Git safety ni guards.

### DV-002 — Núcleo compacto y especialización bajo demanda

**Estado:** dirección aprobada para investigar, no diseño final.
No se crearán seis copias del template ni se precargarán catálogos completos por
perfil. El mecanismo final requiere evidencia de contexto y compatibilidad.

### DV-003 — Crossover temporal entre áreas

**Estado:** requisito funcional vigente.
Un trabajador conserva su foco principal y puede incorporar otra área para una
necesidad puntual. La semántica técnica de aislamiento/descarga sigue abierta.

### DV-004 — Security transversal

**Estado:** invariante provisional obligatorio.
Security no se debilita en `auto` ni en ningún perfil. Que además sea un perfil
seleccionable sigue pendiente.

### DV-005 — Auditoría conservadora

**Estado:** aplicado.
Una entrada sin evidencia suficiente permanece `unclassified`; no se fuerza una
categoría para alcanzar una cobertura artificial.

### DV-006 — Publicación contemporánea por gate

**Estado:** aplicado en `SPIKE-1P`.
Cada gate registra autorización, evidencia, alcance y pendientes. El cierre
final consolidará esos registros, pero no los reconstruirá retrospectivamente.

## 6. Recomendaciones provisionales, no decisiones

| Recomendación | Evidencia | Estado |
|---|---|---|
| Experience/Design como sexto perfil inicial | 2 agentes, 15 skills y journey distintivo | provisional; requiere validación organizacional |
| Security como transversal y posible foco futuro | AppSec local estrecho y seguridad distribuida | provisional |
| piloto Management + Data | demuestra valor fuera de desarrollo | provisional y condicionado |
| limitar inicialmente Data a discovery/gobierno/arquitectura | Data Analyst/Scientist ausentes; Databricks externo | provisional |
| reconciliar catálogo/filesystem antes del router | BA invisibles, IDs legacy, skills UX inexistentes | recomendado para Analyze |
| estados `bundled/external/planned/missing` | madurez desigual y dependencias externas | candidato de schema |
| filesystem/manifests validados como fuente canónica | drift documental observado | alternativa a evaluar en Design |

## 7. Incidencia: INDEX mutable dentro del hash congelado

### Hallazgo

El INDEX forma parte del bundle G0 y contiene a la vez:

- contrato/plan sustantivo;
- campos operativos mutables como fase, próximo gate, estado de slices e
  historial.

Actualizar G1 directamente en ese archivo cambia su SHA-256 y, por tanto, el
hash del bundle, aunque el plan sustantivo no cambie.

### Tratamiento en `SPIKE-1P`

1. conservar el hash G0 como huella del plan efectivamente aprobado;
2. no editar silenciosamente el INDEX congelado;
3. registrar G1 y `SPIKE-1P` en este documento de decisiones, el estado de run y
   el manifest activo;
4. no recalcular el hash y presentarlo como continuidad automática;
5. resolver la convención mediante decisión explícita o Change Request.

### Alternativas pendientes

- separar plan inmutable y ledger operativo en artefactos distintos;
- excluir/normalizar secciones operativas en el algoritmo de hash;
- versionar cada transición como nueva versión del plan y nueva aprobación.

No se selecciona alternativa en este slice.

## 8. Registro de decisiones abiertas

Se conservan los IDs del INDEX para mantener trazabilidad.

| ID | Pregunta pendiente | Señal aportada por SPIKE-1R | Límite |
|---|---|---|---|
| D-001 | Experience/Design o Security como sexto perfil | favorece Experience/Design; no es decisión organizacional | SPIKE-3/D1 |
| D-002 | Security seleccionable o solo transversal | cobertura local insuficiente para perfil completo; transversal obligatorio | S1/D1 |
| D-003 | mecanismo/path de persistencia local | sin evidencia runtime en este spike | D2 |
| D-004 | nombres y comandos públicos de selección | no evaluados con usuarios | D2 |
| D-005 | peso del perfil en routing | router actual no modela los seis perfiles | D3 |
| D-006A | targets provisionales de relevancia/contexto | baseline estático publicado; falta benchmark consumidor | D3/D4 |
| D-006B | targets definitivos | sin evidencia B9/S2 | Verify |
| D-007 | capacidades verdaderamente transversales | inventario identifica candidatos, quedan 227 `unclassified` | SPIKE-3 |
| D-008 | semántica de descargar capacidad temporal | debe ser aislamiento/no reinyección, no borrado retroactivo de tokens | D3 |
| D-009 | autoridad y sign-off por dominio | requiere owner organizacional | SPIKE-3 |

## 9. Decisiones adicionales que `SPIKE-2` debe elevar

1. precedencia entre `asdd-producto` y la capa BA standalone;
2. handoff BA standalone → flujo de equipo;
3. semántica única de activación Data frente a `data_platform`;
4. tratamiento de skills externas Databricks y capacidades planificadas;
5. clasificación de superficies `unclassified`, internas y maintainer-only;
6. remediación o compatibilidad para IDs/documentación legacy;
7. definición organizacional exacta de Management y Platform/SRE;
8. autoridad canónica para catálogo, docs visibles y manifests.

## 10. Change control

Cualquier cambio en perfiles, dominios, paths, comandos, artefactos, seguridad,
dependencias o métodos de medición exige el slice correspondiente o un CR con:

- motivo y evidencia;
- diferencia exacta contra el contrato vigente;
- impacto en specs, seguridad, contexto y compatibilidad;
- pruebas y rollback;
- aprobación explícita.

Un bloqueo técnico no amplía el alcance automáticamente.

## 11. Estado posterior a `SPIKE-1P`

Al terminar la publicación:

- la evidencia de `SPIKE-1R` queda materializada y trazable;
- el plan G0 conserva su huella original;
- las recomendaciones siguen siendo provisionales;
- `SPIKE-2` continúa pendiente y requiere un checkpoint propio;
- no comienza Design ni se implementa ningún perfil.

## 12. Evidencia final de publicación

`SPIKE-1P` terminó dentro del checkpoint autorizado:

| Verificación | Resultado |
|---|---|
| JSON de inventario y baseline | PASS |
| Inventario | 809 entradas; 493 superficies primarias |
| Clasificación de dominio | 500 `classified`; 309 `unclassified` |
| Clasificación de superficies primarias | 266 `classified`; 227 `unclassified` |
| Ownership profesional | 24 agentes; 153 skills locales; 40 comandos |
| Test de naming | 9 passed; 0 failed |
| Test del run manifest | 21 passed; 0 failed |
| Validación global del template | 32 OK; 2 warnings preexistentes; 0 errores |
| `git diff --check` | PASS |
| Paths nuevos contra snapshot | exactamente los cinco artefactos 007–011 |
| Paths existentes modificados | únicamente `.asdd-run.json` y el manifest activo |
| Bundle G0 e INDEX congelado | byte-for-byte intactos |
| Manifest protegido 2026-07-18 | SHA-256 `7f6d463262f6670f480796b57192e73b3cf755d43040ab5899ad5fc3fe469974` |
| Branch y HEAD | sin cambios |

Los dos warnings globales corresponden al tamaño preexistente de `CLAUDE.md`
y a los nueve agentes con deuda eager ya inventariada; `SPIKE-1P` no los
introdujo ni los corrigió. No fue necesario ejecutar rollback.
