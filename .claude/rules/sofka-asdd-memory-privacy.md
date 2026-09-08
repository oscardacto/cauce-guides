---
description: Memory privacy — datos sensibles nunca persisten, convención <private>
globs: "*"
---

# Memory Privacy

## Convención `<private>`

Contenido que el agente necesita en sesión pero NO debe persistir en memoria futura:
```
<private>
host: db-prod.empresa.internal
token: eyJhbGciOiJ...
</private>
```

## Qué NUNCA se persiste en `memory/`

| Categoría | Ejemplos |
|---|---|
| Datos sensibles de usuarios finales | Nombres, identificaciones, historiales, diagnósticos |
| Datos de clientes o terceros | RUC, contratos, información personal identificable |
| Credenciales | Passwords, API keys, tokens de acceso, connection strings |
| Hosts / IPs de producción | Servidores internos, URLs con datos reales |
| Queries con datos reales | Filas de BD identificables, payloads con PII |
| Tokens de sesión / JWT | Cualquier valor que autentique o autorice |
| Identificadores de organizaciones activas | Datos que identifiquen a clientes del proyecto |

**Regla:** Antes de escribir en `memory/` — verificar contra esta tabla. En caso de duda → no persistir.

> La lista de categorías sensibles específicas del dominio del proyecto consumidor
> (ej. PHI en salud, datos financieros en fintech) se amplía en el CLAUDE.md del proyecto.
