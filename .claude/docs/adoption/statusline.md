# Guía de activación — Statusline en Claude Code

Cómo activar un indicador visual de porcentaje de contexto en Claude Code para implementar los umbrales de compactación proactiva definidos en `asdd-anti-loops.md`.

## Por qué: feedback visual del límite de atención del modelo

Los LLMs tienen presupuesto de atención finito. A medida que el contexto crece, la precisión del razonamiento cae. **El % de contexto usado es el feedback NO-CIEGO para decidir cuándo compactar** antes de que se desgrade la calidad.

Regla de oro (`asdd-anti-loops.md`):

| Contexto usado | Estado | Acción obligatoria |
|---|---|---|
| < 60% | Normal | Continuar |
| 60–70% | Alerta | Priorizar Grep sobre Read; evitar reads de archivos >100 líneas |
| 70–80% | Alto | Compactar al terminar paso o fase actual |
| > 80% | Crítico | Compactar ANTES del próximo Agent tool call |
| > 90% | Bloqueante | STOP — compactar antes de cualquier acción |

**Sin statusline, operás a ciegas.** Con statusline, el % está ahí siempre, sin preguntar.

## Opción 1: Comando interactivo (rápido, recomendado)

En el chat de Claude Code, ejecutar:

```
/statusline show model name and context percentage with a progress bar
```

Claude Code generará un script, lo colocará en `.claude/statusline.sh` (o equivalente) y actualizará `settings.json` automáticamente. **Fin.**

Si Claude Code no reconoce el comando (versión antigua), pasar a Opción 2 (manual).

## Opción 2: Configuración manual en `settings.json`

### Paso 1: Editar `.claude/settings.json`

Buscar o crear el bloque `"statusLine"`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/statusline.sh"
  }
}
```

### Paso 2: Crear el script `~/.claude/statusline.sh`

```bash
#!/bin/bash

# Leer JSON desde stdin — el harness de Claude Code suministra:
# { "context_window": { "used_percentage": 65.2, "remaining_percentage": 34.8, ... }, ... }

read -r json_input

# Extraer % usado con jq (fallback a 0 si null o error)
used_pct=$(echo "$json_input" | jq -r '.context_window.used_percentage // 0' 2>/dev/null || echo "0")

# Convertir a entero para visualización
used_int=$(printf "%.0f" "$used_pct")

# Generar barra visual (10 segmentos, cada uno es 10%)
filled=$((used_int / 10))
empty=$((10 - filled))
bar=$(printf '%*s' "$filled" | tr ' ' '█')
bar="$bar$(printf '%*s' "$empty" | tr ' ' '░')"

# Color según umbral (ANSI)
if (( $(echo "$used_pct < 60" | bc -l) )); then
  color='\033[32m'  # verde
elif (( $(echo "$used_pct < 70" | bc -l) )); then
  color='\033[33m'  # amarillo (alerta)
elif (( $(echo "$used_pct < 80" | bc -l) )); then
  color='\033[33m'  # amarillo (alto)
else
  color='\033[31m'  # rojo (crítico)
fi
reset='\033[0m'

# Emitir la línea del statusline
printf "${color}${bar}${reset} %3d%% contexto usado\n" "$used_int"
```

### Paso 3: Hacer el script ejecutable

```bash
chmod +x ~/.claude/statusline.sh
```

### Paso 4: Verificar que Claude Code lo carga

Consultar la documentación de Claude Code: `code.claude.com/docs/en/statusline.md`. El statusline se renderiza automáticamente bajo la ventana de entrada después de ejecutar cualquier tool.

## Cómo funciona (para curiosos)

El campo `context_window.used_percentage` es **pre-calculado** por el harness antes de pasar el JSON al script:

- **Incluye**: todo lo que consume contexto en la sesión (system prompt, mensajes pasados, instrucciones ASDD inyectadas, búsquedas en memoria, etc.)
- **No incluye**: lo que está por venir en el siguiente prompt del usuario (los umbrales son prospectivos — deciden si *vas* a compactar antes de que el usuario hable de nuevo)
- **Puede ser `null`**: al inicio de la sesión (antes del primer tool call) o tras `/compact` (contexto se limpia; harness tarda un momento en recalcular)

Si el script recibe `null` en `used_percentage`, fallback a 0 (la barra mostrada será vacía — significa "contexto recién limpio").

## Umbrales: cuándo actuar (recordatorio)

Estos son los umbrales que tu statusline debería comunicarte:

| % mostrado | Acción |
|---|---|
| 0–60% | 🟢 Normal — seguro continuar con cualquier operación |
| 60–70% | 🟡 Alerta — preferir Grep antes que Read; evitar archivos >100 líneas |
| 70–80% | 🟡 Alto — planificar compactar al terminar el paso o fase actual |
| 80–90% | 🔴 Crítico — compactar ANTES del próximo Agent tool call |
| 90–100% | 🛑 Bloqueante — STOP inmediato; compactar; nada de operaciones hasta compactar |

## Alternativas de script

### Versión minimalista (sin colores, sin barra)

```bash
#!/bin/bash
read -r json_input
used=$(echo "$json_input" | jq -r '.context_window.used_percentage // 0' 2>/dev/null || echo "0")
printf "%.0f%% contexto\n" "$used"
```

### Versión con emoji y advertencia (para > 80%)

```bash
#!/bin/bash
read -r json_input
used=$(echo "$json_input" | jq -r '.context_window.used_percentage // 0' 2>/dev/null || echo "0")
used_int=$(printf "%.0f" "$used")

if (( $(echo "$used > 80" | bc -l) )); then
  printf "⚠️  CONTEXTO CRÍTICO: %d%% — considera /compact\n" "$used_int"
else
  printf "%d%% contexto\n" "$used_int"
fi
```

## Troubleshooting

### El statusline no aparece

1. Verificar que `settings.json` tiene la sección `"statusLine"` correcta (sin typos).
2. Verificar que el script `~/.claude/statusline.sh` existe y es ejecutable: `ls -la ~/.claude/statusline.sh`.
3. Ejecutar un tool call para forzar una ejecución del statusline (no aparece en reposo, solo tras acciones).
4. Si el script tiene un error, Claude Code lo silencia — testear el script directamente:

   ```bash
   echo '{"context_window":{"used_percentage":65.2}}' | ~/.claude/statusline.sh
   ```

### El porcentaje siempre muestra 0 o null

- El harness aún no ha calculado el % (raro, solo en inicio de sesión). Ejecutar un tool y reintentar.
- El script falla al parsear JSON (jq no instalado o roto). Verificar: `jq --version`.
- Fallback en el script a un valor por defecto incorrecto. Revisar la línea de `jq -r`.

### Quiero desactivarlo temporalmente

Comentar o eliminar la sección `"statusLine"` en `settings.json`. Vuelve a aparecer cuando corrijas la configuración.

## Integración con la cultura ASDD

El statusline es **herramienta de concientización**, no gate automático. El umbrales de `asdd-anti-loops.md` son guías de conducta para el agente (y tú, leyendo el reporte):

- **< 60%**: operá con libertad — contexto sobra
- **60–70%**: sé selectivo — usa Grep + offset/limit en Read, no files completos
- **70–80%**: prepárate — cierra el paso/fase actual, compacta al terminar
- **80–100%**: **STOP** — compacta antes de continuar, sin excepciones

Estos umbrales están codificados en `asdd-anti-loops.md` como **recordatorio activo**, no como garantía dura (el harness no frena automáticamente si ignoras la regla). **Tú decides respetar el guardrail.**

## Referencias

- `asdd-anti-loops.md` — "Compactación Proactiva — Prevenir Alucinaciones por Contexto Lleno"
- `asdd-anti-loops.md` — "Token Management — Patrón de 3 Capas"
- Official Claude Code docs: `code.claude.com/docs/en/statusline.md`
