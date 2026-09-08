# Skill PRE-FLIGHT — Bloque estándar compartido

> Referenciar desde el frontmatter de todo skill que cree o modifique archivos de código.

## Bloque PRE-FLIGHT obligatorio (insertar como Paso 0 en cada skill)

```bash
# Verificar rama dedicada — NUNCA trabajar en ramas protegidas (sofka-asdd-git-safety.md GS-001)
# Por defecto: main, master, qa, dev, develop — configurable via SOFKA_ASDD_PROTECTED_BRANCHES (CSV)
protected="${SOFKA_ASDD_PROTECTED_BRANCHES:-main,master,qa,dev,develop}"
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
IFS=',' read -ra PROTECTED_LIST <<< "$protected"
for p in "${PROTECTED_LIST[@]}"; do
  if [[ "$branch" == "$p" ]]; then
    echo "BLOQUEADO: estás en '$branch'. Crear rama dedicada antes de continuar."
    echo "Sugerencia: git checkout -b feat/<descripcion>"
    exit 1
  fi
done
echo "Rama OK: $branch"
```

## Qué verificar en cada skill según su tipo

### Skills que crean archivos (scaffolding, generación de módulos, componentes)
1. **Rama dedicada** (bloque arriba)
2. **Directorio destino existe** — verificar que no se está creando en lugar equivocado
3. **No duplicado** — verificar que no existe ya un equivalente

### Skills que modifican código (refactoring, fixes, análisis estático)
1. **Rama dedicada** (bloque arriba)
2. **Tests actuales pasan** — ejecutar los tests del módulo antes de cualquier cambio
3. **Baseline capturado** — snapshot del estado actual antes de modificar

### Skills de verificación (análisis, auditoría, búsqueda de bugs)
1. **Scope Declaration** — publicar en chat qué archivos se van a analizar antes de empezar
2. Estos skills son READ-ONLY — nunca crean ni modifican archivos

## Cuando un PRE-FLIGHT falla

- **Rama protegida** → STOP. No continuar bajo ninguna circunstancia. Ver `sofka-asdd-git-safety.md` (GS-001).
- **Tests ya rotos** → STOP. Reportar exactamente qué falla. No continuar — el baseline roto hace imposible saber si los cambios posteriores introdujeron nuevos fallos.
- **Directorio no existe** → STOP. Notificar al usuario — puede ser un argumento incorrecto.
- **Duplicado detectado** → Presentar el duplicado al usuario y esperar confirmación explícita antes de crear uno nuevo.

## Relación con otras reglas

- `sofka-asdd-git-safety.md` (GS-001): NUNCA en ramas protegidas
- `sofka-asdd-system-integrity.md`: tests fallidos SIEMPRE se arreglan — baseline roto no es excusa para continuar
- Surgical Changes (sección en `sofka-asdd-developer-frontend.md` y `sofka-asdd-developer-backend.md`, embedded): solo tocar lo declarado
- `sofka-asdd-anti-loops.md`: si el PRE-FLIGHT falla 2 veces con el mismo error → STOP y escalar al usuario
