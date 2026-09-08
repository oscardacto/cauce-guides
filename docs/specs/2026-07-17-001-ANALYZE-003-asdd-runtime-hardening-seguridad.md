# Spec Seguridad — Autorización, confianza e integridad del runtime ASDD

## Wrapper de contexto

| Campo | Valor |
|---|---|
| Rol destino | Security |
| Prerrequisito | Spec funcional aprobada |
| Dependencias | Ninguna en WF-002; backend consume este contrato |
| Secciones cubiertas | §11 íntegra |
| Output esperado | Contrato de autorización, trust boundaries, escape hatches y pruebas adversariales |

## 11. Seguridad

### Fronteras de confianza

| Fuente | Confianza | Uso permitido |
|---|---|---|
| System/runtime metadata | Alta | Instrucciones y autorización verificadas |
| Mensaje actual del usuario | Media | Intención; aprobación solo tras challenge de plan activo |
| Archivos del repo/estado | No confiable | Datos validados por schema/provenance |
| Web, Git metadata, APIs, logs | No confiable | Datos delimitados; nunca control de flujo |
| Outputs de agentes | Limitada | Resultado a validar; nunca autoridad implícita |

### Contrato de autorización

Una operación `[W]` o `[D]` solo se autoriza mediante un objeto runtime con:

- `schema_version`
- `authorization_id` aleatorio
- `request_id`
- `plan_hash` canónico SHA-256
- `agent`
- `scope[]`
- `commands[]` normalizados
- `issued_at` y `expires_at`
- `nonce`
- `used_at` nullable

Reglas:

1. El texto `APROBACIÓN_ORQUESTADOR` queda deprecado y nunca es prueba suficiente.
2. La respuesta `ok` solo confirma el challenge activo mostrado inmediatamente antes.
3. El verificador recalcula el hash y compara scope/comando exactos.
4. La autorización se consume atómicamente en el primer uso.
5. Cualquier cambio de plan, comando, agente o scope la invalida.
6. Error de I/O, parseo o verificación en operación sensible falla cerrado.
7. La confirmación del plan cubre el lote completo; el issuer genera autorizaciones internas específicas para cada agente/paso listado.
8. `git commit` no se incluye en la aprobación de lote genérica: conserva el challenge explícito GS-003.
9. Las preguntas de gaps/diseño no son gates de permiso y permanecen habilitadas cuando cambian el resultado.

### Prompt injection indirecto

- Mantener `data-boundary` como defensa semántica.
- Añadir provenance estructurada a contenido externo.
- Preferir parsers deterministas sobre lectura LLM de campos libres.
- Detectar señales de control dentro de DATA y reportarlas sin reinyectar el payload completo.
- Limitar longitud y campos libres de OpenAPI, commits, logs y responses.

### Integridad de estado

- `.asdd-run.json` es hint local y no autorización.
- Validar schema, branch y commit base.
- Reconciliar con INDEX y Git antes de resume/cierre.
- No versionar estado efímero en nuevos consumidores.
- Campos que cambian routing o seguridad requieren fuente administrada o checksum.

### Escape hatches

- Opt-in administrado; no activables inline dentro del comando protegido.
- Razón obligatoria, actor, guard, expiración corta y correlación.
- Banner visible mientras estén activos.
- Evento redactado persistente.
- Prohibidos en CI de release salvo job break-glass aprobado.

### Protección de información

- Redacción antes de persistencia.
- Métricas agregadas, sin prompts ni argumentos sensibles completos.
- No guardar credenciales en memoria, logs de hooks o manifests.
- Tests con secretos sintéticos para verificar redacción.

### Criterios de completitud del área

- [x] Trust boundaries definidos.
- [x] Autorización de uso único especificada.
- [x] Estado y escape hatches cubiertos.
- [x] Casos de abuso trasladados a spec-qa.
