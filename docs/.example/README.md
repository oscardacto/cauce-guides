# `docs/.example/` — Ejemplos de referencia ASDD

Contenido de ejemplo que ilustra cómo lucen los artefactos ASDD **cuando están
bien hechos**. Sirven como plantilla copiable y como referencia para el
equipo cuando se arranca un ciclo nuevo.

## Feature ficticio

Todos los archivos de este directorio están construidos alrededor del mismo
feature ficticio: **"Checkout de 1 clic"** (e-commerce). Esto permite ver la
trazabilidad entre artefactos:

```
brief.md  →  spec.md  →  adr-001-example.md  →  signoff-example.md
(qué?        (cómo se       (decisión técnica     (evidencia de
 por qué?)    comporta?)     clave)                cumplimiento)
```

## Archivos

| Archivo | Qué ilustra | Fase ASDD |
|---|---|---|
| `brief.md` | Project brief inicial — alcance, objetivos, restricciones | Especificar |
| `spec.md` | Spec funcional con historias, AC, casos de uso y edge cases | Analizar |
| `adr-001-example.md` | ADR con alternativas evaluadas y decisión justificada | Diseñar |
| `signoff-example.md` | Sign-off QA con veredicto PASS | Verificar |

## Cómo usar

### Para arrancar un feature nuevo

1. Copiar el archivo relevante a la ruta real del ciclo.
2. Reemplazar contenido manteniendo la estructura.
3. Eliminar las secciones `<!-- Ejemplo: ... -->` de los templates.

```bash
# Ejemplo
cp docs/.example/brief.md docs/specs/brief-mi-feature.md
cp docs/.example/spec.md docs/specs/mi-feature.md
```

### Para onboarding

Los archivos sirven como material de lectura para developers nuevos:
muestran el nivel de rigor esperado en cada artefacto sin requerir un
feature real en curso.

### Para validar formato

Los agentes `producto`, `architect`, `qa-engineer` pueden referenciar estos
ejemplos para verificar que sus outputs tienen la misma estructura y
profundidad.

## Qué NO es este directorio

- **No es documentación activa del proyecto**. El prefijo `.` lo marca como
  "oculto" convencionalmente; los agentes no deben leerlo como contexto real.
- **No es la verdad operativa**. La spec real, el ADR real y el sign-off
  real viven en sus rutas estándar (`docs/specs/`, `docs/architecture/
  decisions/`, `docs/qa/`).
- **No se versiona por ciclo**. Es material estable; se actualiza si el
  formato del artefacto cambia, no por cambios de negocio.

## Mantenimiento

Revisar anualmente si los ejemplos siguen reflejando las mejores prácticas
vigentes. Cuando un template real (ADR, spec, sign-off) cambie su formato,
actualizar el ejemplo correspondiente en la misma PR.
