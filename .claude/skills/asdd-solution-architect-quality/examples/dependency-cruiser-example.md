# Fitness Function — dependency-cruiser (TypeScript / JS)

**Atributo:** Maintainability / Modularity
**Sistema:** Web SPA (React + TS)
**Tipo:** Invariante arquitectónico de dependencias entre módulos

## Invariantes que validamos

1. `src/features/*` NO puede importar de otro `src/features/*` (features aisladas).
2. `src/shared/ui/*` NO puede importar de `src/features/*` (UI compartida no depende de features).
3. NO hay ciclos de dependencias (orphan, circular).
4. `src/api/*` NO puede importar de `src/features/*` (la capa de API es agnóstica).
5. Hojas de estilos solo en su feature, no cross-import.

## Configuración `.dependency-cruiser.cjs`

```javascript
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: { orphan: true, pathNot: '\\.(test|spec)\\.tsx?$' },
      to: {},
    },
    {
      name: 'features-isolated',
      comment: 'Una feature no puede importar de otra feature.',
      severity: 'error',
      from: { path: '^src/features/([^/]+)/' },
      to: {
        path: '^src/features/([^/]+)/',
        pathNot: '^src/features/$1/',
      },
    },
    {
      name: 'shared-no-features',
      comment: 'src/shared no puede depender de src/features.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/features/' },
    },
    {
      name: 'api-no-features',
      severity: 'error',
      from: { path: '^src/api/' },
      to: { path: '^src/features/' },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'] },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/[^/]+' },
    },
  },
};
```

## Integración en CI

`package.json`:
```json
{
  "scripts": {
    "deps:check": "depcruise --config .dependency-cruiser.cjs src",
    "deps:graph": "depcruise --config .dependency-cruiser.cjs --output-type dot src | dot -T svg > dependency-graph.svg"
  },
  "devDependencies": {
    "dependency-cruiser": "^16.0.0"
  }
}
```

GitHub Actions:
```yaml
- name: Dependency rules
  run: npm run deps:check
```

PR rojo si alguna regla `severity: error` se viola.

## Mensaje de error típico

```
error features-isolated: src/features/checkout/CheckoutForm.tsx →
  src/features/cart/utils/format.ts

  Una feature no puede importar de otra feature.
```

Acción: mover `format.ts` a `src/shared/utils/` o duplicar el helper en `checkout/utils/`.

## Generación de grafo

`npm run deps:graph` produce `dependency-graph.svg` — útil para reviews
arquitectónicas trimestrales y para detectar centralidad inesperada (un
módulo importado por todos = candidato a refactor).

## Mantenimiento

- Cuando se agrega un nuevo top-level (ej. `src/widgets/`), actualizar las reglas.
- Severity `warn` para reglas en transición; `error` para invariantes consolidados.
- Si una regla se viola legítimamente, discutir si corregir el código o ajustar la regla — nunca silenciar sin discusión.
