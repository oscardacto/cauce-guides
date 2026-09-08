# DA_ADE35 — Drivers de Arquitectura
**Solución:** {nombre-solucion} | **Versión:** {version} | **Fecha:** {YYYY-MM-DD}
**Trazabilidad:** Derivado de DA_ADE36 Business Drivers

## 1. Requerimientos Funcionales Arquitecturalmente Relevantes
| ID | Nombre | Descripción | Justificación Arquitectónica |
|---|---|---|---|
| RF-01 | {nombre} | {descripción} | {por qué impacta la arquitectura} |

## 2. Atributos de Calidad (QAs)
| ID | QA | Escenario de Prueba | Métrica | Driver de Negocio |
|---|---|---|---|---|
| QA-01 | Disponibilidad | {situación → respuesta esperada} | 99.9% uptime | OE-01 |
| QA-02 | Rendimiento | {bajo carga X → latencia < Y ms} | p95 < 500ms | OE-01 |
| QA-03 | Seguridad | {intento de acceso no autorizado → rechazo en < 1s} | 0 breaches | RN-01 |
| QA-04 | Escalabilidad | {5x carga → sin degradación} | escala horizontal | OE-02 |

## 3. Restricciones Técnicas
| ID | Restricción | Justificación |
|---|---|---|
| RT-01 | {ej. No modificar el Core System legacy} | {razón de negocio o técnica} |

## 4. Fuera de Alcance
- {Componente o funcionalidad excluida explícitamente}

## 5. Riesgos Técnicos
| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| RI-01 | {descripción del riesgo} | Alta/Media/Baja | Alto/Medio/Bajo | {estrategia} |

## 6. Architecture Concerns (Conflictos entre Drivers)
| ID | Concern | Drivers en Conflicto | Decisión Preliminar |
|---|---|---|---|
| AC-01 | {ej. Seguridad vs Rendimiento} | QA-02 vs QA-03 | {ver ADR-001} |

## Control de Cambios
| Versión | Descripción | Autor | Fecha |
|---|---|---|---|
| 0.1 | Versión inicial | {autor} | {fecha} |
