# DA_ADE48 — Minutograma de Despliegue
**Solución:** {nombre-solucion} | **Ambiente:** {dev / qa / pdn} | **Fecha de Release:** {YYYY-MM-DD HH:mm}

## Información General
| Campo | Valor |
|---|---|
| **Release ID** | REL-{NNN} |
| **Ambiente destino** | dev / qa / pdn |
| **Ventana de despliegue** | {YYYY-MM-DD HH:mm} — {HH:mm} |
| **Responsable de release** | {nombre} |
| **Rollback aprobado por** | {nombre} |

## Prerrequisitos
- [ ] {ej. Rama `release/v{X.Y.Z}` aprobada y mergeada}
- [ ] {ej. Pipeline CI/CD en verde (build + tests)}
- [ ] {ej. Artefactos publicados en registro de contenedores}
- [ ] {ej. Variables de entorno configuradas en {ambiente}}
- [ ] {ej. Backups de BD ejecutados y verificados}

## Plan de Actividades
| # | Actividad | Responsable | Duración estimada | Ambiente | Estado |
|---|---|---|---|---|---|
| 1 | {ej. Ejecutar migraciones de BD} | {nombre} | 5 min | {ambiente} | Pendiente |
| 2 | {ej. Desplegar imagen {servicio}} | {nombre} | 10 min | {ambiente} | Pendiente |
| 3 | {ej. Smoke tests post-deploy} | {nombre} | 15 min | {ambiente} | Pendiente |
| 4 | {ej. Validación de integración con {sistema}} | {nombre} | 10 min | {ambiente} | Pendiente |
| 5 | {ej. Go/No-Go decisión} | {responsable release} | 5 min | — | Pendiente |

## Plan de Rollback
| Trigger | Acción | Responsable | Tiempo estimado |
|---|---|---|---|
| {ej. Error en smoke tests} | {ej. Revertir imagen al tag anterior} | {nombre} | 10 min |
| {ej. Falla en migración de BD} | {ej. Restaurar backup pre-deploy} | {nombre} | 20 min |

## Validación Post-Despliegue
- [ ] {ej. Health check de todos los servicios: HTTP 200}
- [ ] {ej. Métricas de error rate < 0.1% en primeros 15 min}
- [ ] {ej. Logs sin errores críticos en primeros 10 min}
- [ ] {ej. Notificar a stakeholders: release exitoso}

## Control de Cambios
| Versión | Descripción | Autor | Fecha |
|---|---|---|---|
| 0.1 | Versión inicial | {autor} | {fecha} |
