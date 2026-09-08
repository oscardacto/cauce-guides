---
name: asdd-ba-specification-lead-extraccion
description: Extrae reglas de negocio de documentos crudos, clasificadas CORE/EDGE. Se activa dentro de asdd-ba-specification-lead.
---

## Rol

Extractor de reglas de negocio. Lee documentos fuente y transforma el lenguaje natural implícito en reglas atomizadas, clasificadas y con trazabilidad a la fuente.

## Cuándo activar

- El asdd-ba-specification-lead recibe documentos fuente adicionales (RFP, BRD, transcripción, correo o acta) además de la referencia de la EDT, y se necesita extraer las reglas antes de construir la SPEC
- Se necesita un inventario de reglas antes de construir la sección de reglas de negocio de la SPEC
- El texto fuente tiene reglas mezcladas con narrativa, jerga o redundancias

## Proceso de extracción

1. Leer el documento fuente completo
2. Identificar toda oración que exprese obligación, prohibición, condición o excepción
3. Atomizar: una regla = una oración, sin conjunciones "y" que mezclen dos reglas
4. Clasificar cada regla:
   - `[CORE]` — aplica al flujo principal en condiciones normales
   - `[EDGE]` — aplica a casos excepcionales, bordes o condiciones especiales
5. Registrar la fuente (párrafo/sección de origen) para trazabilidad
6. Detectar contradicciones entre reglas del mismo documento
7. Marcar reglas incompletas como `[REQUIERE_CLARIFICACIÓN]` — en el campo `"estado"` del JSON usar el valor sin corchetes: `"REQUIERE_CLARIFICACIÓN"` (es un enum de string, no un marcador de texto)

## Formato del inventario de reglas (JSON)

```json
{
  "feature": "{nombre del feature}",
  "fuente": "{nombre del documento origen}",
  "fecha_extraccion": "{fecha}",
  "reglas": [
    {
      "id": "RN-001",
      "tipo": "CORE",
      "texto": "{regla atomizada en una oración}",
      "fuente_parrafo": "{cita textual breve del párrafo de origen}",
      "estado": "COMPLETA | REQUIERE_CLARIFICACIÓN",
      "contradiccion_con": null
    },
    {
      "id": "RN-002",
      "tipo": "EDGE",
      "texto": "{regla de excepción atomizada}",
      "fuente_parrafo": "{cita textual}",
      "estado": "REQUIERE_CLARIFICACIÓN",
      "contradiccion_con": "RN-001"
    }
  ],
  "reglas_incompletas": ["RN-002"],
  "contradicciones": [{"entre": ["RN-001", "RN-002"], "descripcion": "{detalle}"}]
}
```

## Criterios de atomización

Una regla está atomizada cuando:
- Tiene exactamente una condición (SI X)
- Tiene exactamente una acción o restricción (ENTONCES Y)
- Puede ser evaluada como verdadera o falsa en un caso concreto
- No requiere interpretación adicional para ser aplicada

Una regla NO está atomizada cuando:
- Usa "y también" para unir dos acciones diferentes
- Usa "dependiendo del caso" sin especificar los casos
- Contiene términos como "generalmente", "normalmente", "en la mayoría de casos"

## Inputs

- Documentos fuente en `inputs/{feature}/` (texto, PDF, transcripción, correo, acta)
- (Opcional) Glosario del dominio para desambiguar términos

## Outputs

- Inventario JSON de reglas atomizadas — **es un insumo intermedio, no la tabla final**. asdd-ba-specification-lead lo transforma al construir la sección de reglas de negocio: agrega los corchetes `[CORE]`/`[EDGE]`, completa la columna "Impacto en implementación" y transcribe en formato tabla.
- Lista de reglas `[REQUIERE_CLARIFICACIÓN]` y `[VACÍO_DE_FUENTE]` — se materializan como **filas GAP-NNN** en la sección de decisiones requeridas y gaps (no se transcriben como marcadores sueltos).
- Lista de contradicciones detectadas

## Anti-patterns

- **Reglas compuestas** — "el sistema valida el monto Y notifica al usuario Y registra en auditoría" son 3 reglas, no 1.
- **Copiar y pegar** — transcribir párrafos del documento original sin atomizar. Un párrafo de 5 líneas suele contener 3-4 reglas distintas.
- **Inventar reglas** — inferir reglas que no están en el documento para "completar" el set. Si no está en el fuente, va como `[VACÍO_DE_FUENTE]` en la sección de decisiones requeridas y gaps.
