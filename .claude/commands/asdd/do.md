---
description: Override explícito de ruta LIGHT — delega directo a un agente sin activar el workflow de fases.
allowed-tools: [Read, Write, Edit, Grep, Glob, Task]
---

Override explícito de ruta LIGHT. Úsalo cuando sabés que la tarea es simple y
querés saltarte la clasificación automática de `ORC-001-B`.

## Comportamiento

- Fuerza ruta **LIGHT** independientemente del score de clasificación
- El orquestador delega directamente al agente más adecuado según el tipo de request
- **No desactiva** el contrato de escalamiento `ORC-001-C` — el agente puede escalar igual si descubre complejidad oculta
- **No aplica** a requests que caen en exclusiones duras (auth, pagos, PII, pipelines, contratos públicos) — en esos casos el orquestador rechaza el override e indica el comando de fase correcto

## Cuándo usarlo

```
/asdd:do cambiá el color del botón primario a #F5A623
/asdd:do renombrá `getUserById` a `findUserById` en user.service.ts
/asdd:do ¿qué hace el middleware de logging?
/asdd:do el test de AuthService falla con "token expired" — arreglalo
```

## Cuándo NO usarlo

- Features nuevas o cambios estructurales — usá `/asdd:build`
- Bugs cuya causa no conocés — dejá que el clasificador decida (puede ser Tipo 4)
- Cualquier cambio en auth, pagos, PII o pipelines

## Relación con ORC-001-B

`/asdd:do` es el override manual de `ORC-001-B`. Si el clasificador automático
ya eligió LIGHT para tu request, no necesitás este comando — el comportamiento
es el mismo. Usalo solo cuando la clasificación automática elegiría FULL y vos
sabés que no es necesario.
