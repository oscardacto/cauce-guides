# Especificación funcional — binding de autorizaciones de plan

## 0. Metadatos del documento

| Campo | Valor |
|---|---|
| Run ID | `2026-07-17-002` |
| Feature | `plan-authorization-binding` |
| Estado | APROBADA PARA DISEÑO |
| Versión | 1.0 |
| Fecha | 2026-07-17 |
| Brief origen | `2026-07-17-002-SPECIFY-001-brief-plan-authorization-binding.md` |
| INDEX | `2026-07-17-002-ANALYZE-006-plan-authorization-binding-index.md` |
| ui_required | false |

### Mapa de dominios — completitud

| Dominio | Aplica | Estado | Secciones |
|---|---:|---|---|
| Funcional | Sí | APROBADA | §1–§7 |
| Backend/tooling | Sí | COMPLETO | spec-backend |
| Seguridad | Sí | COMPLETO | spec-seguridad |
| QA | Sí | COMPLETO | spec-qa |
| Frontend, UX/UI, Datos, DevOps | No | N/A | — |

### Gate DOR

- [x] Brief trazable y alcance acotado.
- [x] Funcional, backend, seguridad y QA completos.
- [x] Áreas no aplicables marcadas N/A.
- [x] Sin preguntas abiertas bloqueantes.

## 1. User Story

Como developer que aprueba un plan ASDD, quiero que mi aprobación habilite solo
los agentes, archivos y comandos presentados, para que un cambio posterior o un
reuso no autorice acciones distintas sin una nueva aprobación.

## 2. Actores y permisos

| Actor | Responsabilidad | Límite |
|---|---|---|
| Usuario | Aprueba o rechaza el plan canónico | Su `ok` solo confirma el challenge activo mostrado para ese plan. |
| Orquestador | Emite challenge y solicita agentes | No puede ampliar el plan tras emitirlo. |
| Subagente | Ejecuta el trabajo delegado | Sus operaciones sensibles deben pertenecer a su entrada aprobada. |
| Hooks runtime | Verifican lanzamiento y operaciones | Fallan cerrados ante estado, identidad o datos de operación inválidos. |

## 3. Flujo de negocio

1. El orquestador normaliza el plan con una entrada única por tipo de agente,
   `scope[]` y `commands[]` deterministas.
2. Emite un challenge con `plan_hash`, expiración y nonce antes de mostrar el
   plan.
3. El usuario escribe una aprobación reconocida mientras el challenge sigue
   activo.
4. El runtime materializa una autorización de un solo lanzamiento por entrada.
5. El hook `Agent` solo permite lanzar el agente cuyo tipo coincide exactamente.
6. Para cada `Write`, `Edit` o comando sensible originado por ese agente, el
   runtime compara la identidad de agente disponible y el objetivo/command con
   la misma entrada autorizada.
7. Una operación fuera de alcance, un segundo lanzamiento, un replay o una
   expiración se rechazan y requieren plan/challenge nuevo.

## 4. Reglas de negocio

| ID | Tipo | Regla |
|---|---|---|
| RN-001 | CORE | Una autorización de plan representa una entrada canónica e inmutable. |
| RN-002 | CORE | Un tipo de agente solo puede aparecer una vez por plan; la ambigüedad se rechaza al emitir. |
| RN-003 | CORE | El lanzamiento exige coincidencia exacta de tipo de agente y consume una sola vez la entrada de lanzamiento. |
| RN-004 | CORE | Una escritura o edición solo es permitida si su `file_path` está dentro de un scope aprobado para el tipo de agente. |
| RN-005 | CORE | Un comando sensible solo es permitido si coincide con un comando normalizado aprobado para el tipo de agente. |
| RN-006 | CORE | Cambiar agente, scope o comandos requiere challenge nuevo; nunca se interpreta como una variación inocua. |
| RN-007 | EDGE | Si el hook no recibe identidad de agente o el dato de operación necesario, niega/solicita autorización; no permite por defecto. |
| RN-008 | CORE | `git commit` no puede ser autorizado por este lote. |

## 5. Requisitos no funcionales

- Seguridad: fail-closed para `Agent`, `Write`, `Edit` y Bash mutante de
  subagentes; sin confiar en texto generado por agentes.
- Compatibilidad: Node estándar y hooks existentes de Claude Code; sin red ni
  dependencias adicionales.
- Rendimiento: lectura local pequeña por hook y sin escaneos del repositorio.
- Trazabilidad: los errores identifican la clase de mismatch, sin persistir
  prompts ni argumentos sensibles completos.

## 6. Gaps y decisiones

**0 preguntas abiertas bloqueantes.**

- D-001: la corrección se limita al binding verificable con el payload de hook;
  HMAC, nuevos TTLs y cambios de UX se excluyen de este slice.
- D-002: primero se protege el lanzamiento y las operaciones de escritura/Bash
  sensibles; las lecturas continúan fuera del scope para no romper discovery.
- D-003: la prueba E2E es evidencia de defecto de implementación frente al
  contrato ya aprobado; el run anterior no se reescribe.

## 7. Siguiente paso

Diseñar el estado de autorización y los puntos de enforcement definidos por las
specs de seguridad y backend.
