# Permisos nativos de Claude Code vs. confirmaciones ASDD

## Problema frecuente

El mensaje en inglés **“Do you want to proceed with agents?”** pertenece al sistema de permisos nativo de Claude Code. No lo genera ORC-010 ni un agente ASDD, por lo que modificar rules o prompts del template no lo elimina.

## Configuración local

Cada usuario puede ajustar los permisos en `.claude/settings.local.json` y seleccionar el modo de permisos adecuado en la interfaz de Claude Code. La configuración local no debe versionarse ni imponerse globalmente desde el template.

Ejemplo orientativo y deliberadamente acotado:

```json
{
  "permissions": {
    "allow": [
      "Agent(*)",
      "Read(*)",
      "Grep(*)",
      "Glob(*)"
    ]
  }
}
```

La sintaxis exacta depende de la versión instalada de Claude Code. Verificarla contra su documentación antes de copiar el ejemplo.

## Trade-off

Permitir agentes automáticamente reduce interrupciones nativas, pero también elimina un punto de confirmación del CLI. Es una decisión consciente del usuario. Los gates ASDD para plan, Git y operaciones sensibles continúan aplicando de forma independiente.

## Diagnóstico rápido

- Prompt en inglés al invocar agentes: probablemente permiso nativo.
- Prompt en español que presenta plan/scope/comandos: ceremonia ASDD.
- Pregunta sobre un gap cuyo resultado cambia el diseño: pregunta de conocimiento; debe conservarse.
- Pregunta para repetir autorización de un paso ya incluido en el plan: fricción ASDD; debe eliminarse con aprobación de lote.
