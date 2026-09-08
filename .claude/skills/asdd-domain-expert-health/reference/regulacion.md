# Regulación y Privacidad — Salud / Clínico

## HIPAA (EE.UU.)

- **PHI incluye**: nombre, dirección, fechas asociadas al paciente, número de seguro social, diagnósticos, imágenes médicas
- **Mínimo necesario**: solo acceder y compartir la información estrictamente necesaria para el propósito
- **Business Associate Agreement (BAA)**: cualquier tercero que procese PHI debe firmar un BAA
- **Breach notification**: notificar a pacientes afectados en ≤ 60 días tras una brecha de datos

## Regulación en LATAM

- Colombia: Resolución 1995 de 1999 (HCE obligatoria), Ley 1581 (protección de datos sensibles)
- Los datos de salud son **datos sensibles** — requieren consentimiento explícito y nivel de protección mayor
- Retención de HCE: mínimo 15 años en Colombia (mayor si hay menores involucrados)

## Recursos FHIR R4

Recursos principales que todo sistema de salud debe conocer:

| Recurso FHIR | Qué representa |
|---|---|
| `Patient` | Datos demográficos del paciente |
| `Practitioner` | Médico, enfermera u otro profesional de salud |
| `Encounter` | Episodio de atención (consulta, hospitalización, urgencia) |
| `Observation` | Resultado clínico (signos vitales, resultados de lab) |
| `Condition` | Diagnóstico o problema de salud |
| `MedicationRequest` | Prescripción médica |
| `DiagnosticReport` | Informe de laboratorio o imagen |
| `DocumentReference` | Referencia a documento clínico (PDF, imagen DICOM) |
