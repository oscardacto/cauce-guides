---
name: asdd-security-secrets-scan
description: Detecta secrets hardcodeados — API keys, tokens, contraseñas, certificados y connection strings.
---

## Rol

Detector de secrets. Busca credenciales y datos sensibles hardcodeados que nunca deben estar en el código versionado.

## Cuándo activar

- Antes de cualquier commit o PR con archivos de configuración o código nuevo
- Revisión de un repositorio que históricamente pudo tener secrets
- Como verificación rápida en cualquier fase
- Fases: **Analizar, Diseñar, Construir, Verificar** (transversal)

## Cuándo NO invocar

- El issue es vulnerabilidad de código (no credencial) — usar `security-code-scan`.
- Se evalúa cumplimiento (PCI-DSS, ASVS) — usar `security-compliance`.
- Es CVE en dependencia — usar `security-dependency-audit`.


## Patrones a buscar

### Credenciales de servicios cloud
```
AWS_SECRET_ACCESS_KEY, aws_secret, AZURE_CLIENT_SECRET
GCP_SERVICE_ACCOUNT, GOOGLE_API_KEY
```

### Tokens y API keys
```
api_key, apikey, api_secret, access_token, auth_token
bearer, private_key, secret_key, client_secret
```

### Credenciales de base de datos
```
DATABASE_URL con credenciales embebidas
password=, passwd=, pwd= seguido de valor
connection string con usuario:contraseña
```

### Claves criptográficas
```
-----BEGIN RSA PRIVATE KEY-----
-----BEGIN PRIVATE KEY-----
ssh-rsa, ecdsa-sha2
```

### Patrones de valor sospechoso
```
Strings aleatorios > 20 caracteres asignados a variables con nombre sensible
Tokens en formato JWT hardcodeados (eyJ...)
```

## Archivos de alto riesgo a revisar

- `.env`, `.env.local`, `.env.production` — verificar que no estén versionados
- `config/`, `settings/`, `secrets/` — directorios de configuración
- `docker-compose.yml`, `kubernetes/*.yaml` — configuraciones de despliegue
- `*.json`, `*.yaml`, `*.toml` — archivos de configuración genéricos
- Historial de git — `git log -p` puede revelar secrets eliminados pero presentes en commits anteriores

## Qué no es un secret

- Valores de ejemplo en plantillas (`your-api-key-here`, `<REPLACE_ME>`)
- Variables de entorno referenciadas sin valor (`$API_KEY`, `process.env.API_KEY`)
- Claves públicas de cifrado asimétrico

## Remediación inmediata si se encuentra un secret

1. **No hacer push** si aún no está en remoto
2. Si ya está en remoto: revocar la credencial **antes** de hacer cualquier otra cosa
3. Eliminar del código y reemplazar por variable de entorno
4. Limpiar el historial de git si el secret estuvo en commits anteriores (`git filter-repo`)
5. Agregar el archivo al `.gitignore`

## Formato de reporte

```markdown
## Secrets Scan — {repositorio / módulo}

**Fecha**: {YYYY-MM-DD}
**Estado**: ✅ Sin hallazgos | ❌ Hallazgos críticos

| ID | Tipo | Archivo | Línea | Acción requerida |
|---|---|---|---|---|
| SEC-001 | API Key | `src/config.ts` | 12 | Revocar y mover a variable de entorno |
```

## Outputs

- `docs/security/secrets-scan-{fecha}.md` — reporte de hallazgos con acciones inmediatas

## Gotchas

- **Eliminar el secret del último commit no es suficiente** — el secret sigue en el historial de git. Quien tenga acceso al repo (incluido fork antiguo) lo encuentra con `git log -p`. Acción inmediata: revocar el secret + reescribir historial con `git filter-repo` + forzar rotación a todos los devs.
- **Falsos positivos en archivos de prueba** — fixtures con tokens fake (`"token": "test-12345"`). Usar allowlist de paths o anotación `# pragma: allowlist secret` reconocible por el scanner.
- **Secrets en logs y crash reports** — el código está limpio pero `console.log(config)` imprime el password en CloudWatch. Auditar también los logs históricos antes de marcar PASS.
- **Variables de entorno con valor real en `.env.example`** — el `.example` se versiona. Debe contener placeholders (`API_KEY=your-key-here`), nunca el valor real de dev/staging.
- **Confundir "no en el repo" con "no expuesto"** — un secret en variables de CI/CD también puede filtrarse via logs de jobs públicos. Forks en GitHub Actions reciben los secrets del PR si no se restringe.

