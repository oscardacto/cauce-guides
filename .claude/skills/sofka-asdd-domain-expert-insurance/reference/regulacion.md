# Regulación y Compliance — Seguros

## Superintendencia Financiera de Colombia (y equivalentes LATAM)

- Las aseguradoras deben estar autorizadas para operar cada ramo de seguro
- Las tarifas y condiciones generales de pólizas requieren aprobación regulatoria
- Reservas técnicas son auditadas periódicamente — los sistemas deben soportar el cálculo exacto
- Tiempos máximos de respuesta a siniestros definidos por regulación (típico 30 días hábiles para respuesta inicial)
- Protección de datos de asegurados bajo leyes de habeas data locales

## IFRS 17 (International Financial Reporting Standard)

- Estándar contable para contratos de seguro vigente desde 2023
- Impacta cómo se reconocen ingresos, pasivos y márgenes en el tiempo
- Los sistemas de core de seguros deben soportar el modelo de medición IFRS 17
- **Crítico**: usar tipos `decimal`/`numeric` para todos los montos — nunca `float`
