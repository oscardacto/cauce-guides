# Brief: remediación de binding de autorizaciones de plan

**Proyecto:** project-structure / runtime ASDD  
**Fecha:** 2026-07-17  
**Owner:** Maintainers de Guide ASDD

## ¿Qué construimos?

Corregimos la brecha entre el plan que aprueba el usuario y las acciones que
un subagente puede ejecutar. La autorización de lote debe permitir una sola
ejecución del agente declarado y verificar en los hooks de herramienta que las
escrituras y comandos sensibles permanecen dentro del alcance aprobado.

La evidencia primaria es una prueba E2E: después de aprobar un plan, el runtime
aceptó que el agente cambiara de archivos declarados a
`.claude/scripts/lib/asdd-plan-authorization-lib.mjs`. El plan-gate actual
solo consume por `subagent_type`; no compara `scope[]`, `commands[]`,
`plan_hash` ni `request_id`.

## ¿Para quién?

- Maintainers del template ASDD que definen los hooks y el protocolo ORC-010.
- Developers consumidores que aprueban un plan y necesitan que esa aprobación
  sea limitada, explicable y no reutilizable.

## Restricciones conocidas

- No se acepta el parche amplio generado durante la prueba E2E: cambia contratos
  de librería sin actualizar sus consumidores y mezcla HMAC/TTL con la corrección
  de binding.
- No introducir dependencias npm ni suponer un proveedor de CI.
- `git commit` continúa fuera del lote y conserva GS-003.
- La solución debe basarse únicamente en datos que Claude Code entrega a los
  hooks; los datos ausentes deben fallar cerrados para operaciones sensibles.
- Mantener el comportamiento de consultas TRIVIAL y las aprobaciones nativas no
  relacionadas con ASDD.

## Dominio

general — autorización de herramientas y gobernanza de agentes.

## Roles técnicos requeridos

- [x] Architect — cambia el límite de confianza entre `Agent` y herramientas.
- [x] Security — autorización, replay y fail-closed.
- [x] Tech Lead — cambio de contrato y regresiones.

## Artefactos de salida

- Este brief.
- Set de análisis por área: funcional, backend, seguridad y QA.
- ADR de diseño, implementación y pruebas de regresión en fases posteriores.
