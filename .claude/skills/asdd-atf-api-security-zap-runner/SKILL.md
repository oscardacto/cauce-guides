---
name: asdd-atf-api-security-zap-runner
description: Scan dinámico con OWASP ZAP en modo baseline o full cuando los probes ligeros no alcanzan. Requiere ZAP instalado.
used_by:
  - asdd-atf-api-security
---

## Propósito

Complementar `owasp-api-checks` (chequeo rápido) con un **scan dinámico profundo** usando OWASP ZAP. Es opcional dentro del pipeline de seguridad y se invoca solo si:

- El proyecto tiene ZAP disponible localmente o vía contenedor
- La API tiene endpoints suficientes para que el scan dé valor
- El cliente lo solicita explícitamente

## Cuándo invocar

- Solo si `optional_pipelines.security: true` **y** el cliente lo solicitó (config adicional)
- Tras `owasp-api-checks` para profundizar findings detectados
- **Nunca contra producción**

## Inputs

| Parámetro | Tipo | Descripción |
|---|---|---|
| `parsed_contracts` | array | Para importar al ZAP |
| `session_config` | object | Para `app.url`, validar `environment !== production` |
| `credentials` | object | Para sesión autenticada en ZAP |
| `scan_mode` | enum | `baseline` (rápido, ~5min) \| `full` (active scan, ~30min) |
| `zap_endpoint` | string | URL del ZAP proxy (default `http://127.0.0.1:8080`) |
| `zap_api_key` | string | Para autenticar contra la API de ZAP |

## Pre-requisitos

1. **ZAP corriendo** como daemon o desktop con API habilitada
2. **API key** configurada en ZAP (`-config api.key=...`)
3. **Conectividad** desde el host del runner al ZAP y desde ZAP al servicio bajo prueba
4. (Opcional) **Sesión autenticada** preconfigurada en ZAP si la API requiere auth

## Modos de scan

### `baseline` (default)

- Crawler pasivo: recorre los endpoints declarados en el contrato sin enviar payloads ofensivos
- Detecta: headers de seguridad ausentes, cookies inseguras, info disclosure
- Duración: 3-10 min
- Riesgo: muy bajo

### `full` (active scan)

- Baseline + envío de payloads activos: SQL injection, XSS, command injection, path traversal
- Detecta: vulnerabilidades explotables
- Duración: 15-60 min
- Riesgo: medio — puede crear registros o disparar alarmas
- **Confirmación adicional del usuario antes de ejecutar**

## Proceso

1. **Validación pre-scan:**
   - `app.environment !== 'production'`
   - ZAP accesible en `zap_endpoint`
   - API key válida
2. **Import del contrato:** subir `parsed_contracts[*]` a ZAP via API (formato OpenAPI).
3. **Configurar contexto:** si `auth.requires_auth`, configurar autenticación (Bearer/Cookie/Basic).
4. **Ejecutar scan** según `scan_mode`.
5. **Polling** del estado hasta `status: 100`.
6. **Descargar reporte JSON** de ZAP.
7. **Convertir a formato canónico ATF** (alinear con `findings.json` de owasp-api-checks).
8. **Capturar evidencia** de cada finding con `shared-evidence-collector`.

## Output

```json
{
  "run_id": "{run_id}",
  "scan_mode": "baseline | full",
  "started_at": "{ISO 8601}",
  "completed_at": "{ISO 8601}",
  "duration_seconds": 320,
  "zap_version": "2.15.0",
  "scope": {
    "target_url": "https://api-qa.example.com/v1",
    "openapi_imported": true,
    "endpoints_scanned": 4,
    "urls_visited": 28,
    "requests_sent": 1240
  },
  "findings_summary": {
    "high": 2,
    "medium": 5,
    "low": 8,
    "informational": 12
  },
  "findings": [
    {
      "id": "ZAP-001",
      "zap_alert_id": "40012",
      "name": "Cross Site Scripting (Reflected)",
      "severity": "high",
      "confidence": "medium",
      "cwe": "CWE-79",
      "owasp_mapping": "API8",
      "affected_url": "https://api-qa.example.com/v1/search?q=<script>",
      "description": "...",
      "evidence": "El response refleja el payload sin escape en el campo 'message'",
      "remediation": "Aplicar output encoding en el body de respuesta. Considerar Content-Security-Policy.",
      "evidence_path": "docs/testing/atf/{run_id}/security/evidence/ZAP-001/"
    }
  ],
  "consolidated_with_owasp_checks": true,
  "next_step": "Revisar findings con severity high junto con findings de owasp-api-checks para reporte consolidado en final-report.md"
}
```

## Reglas duras

1. **Pre-flight check obligatorio.** Validar entorno, ZAP, credenciales antes de cualquier scan.
2. **Active scan requiere confirmación.** El modo `full` exige un OK explícito del usuario ya que envía payloads.
3. **Aislar findings ATF.** Aunque ZAP detecte cosas fuera del scope (endpoints no documentados), reportar solo los que están en `parsed_contracts`.
4. **Consolidar con owasp-api-checks.** Si los dos skills detectan el mismo problema, deduplicar y referenciar ambos.
5. **No mutar el ZAP host.** El skill consume la API de ZAP pero no cambia configuración global del usuario.

## Errores comunes

| Código | Causa |
|---|---|
| `ZAP-001` | ZAP no accesible en `zap_endpoint` |
| `ZAP-002` | API key inválida |
| `ZAP-003` | Import de OpenAPI falló — contrato malformado |
| `ZAP-004` | Scan en estado `paused` >5min — investigar |
| `ZAP-005` | Active scan rechazado por usuario — abortar |

## Cuándo NO invocar

- ZAP no disponible en el entorno — usar solo `owasp-api-checks`
- `app.environment: production` — abortar
- Cliente no autorizó scan dinámico — usar solo análisis estático

## Anti-patterns

- **Active scan sin confirmar.** Es destructivo en potencia.
- **Scanear sin importar OpenAPI primero.** ZAP exploraría endpoints no documentados y aumentaría ruido.
- **Reportar todos los findings de ZAP** incluyendo `informational` con severidad inflada.
- **Re-ejecutar ZAP en cada corrida.** El active scan es costoso — usar baseline rutinario y full a demanda.

## Referencias

- Template: `templates/zap-result.template.json`
- Ejemplo: `examples/example-zap-baseline-clienteejemplo.json`
- Documentación ZAP API: https://www.zaproxy.org/docs/api/
