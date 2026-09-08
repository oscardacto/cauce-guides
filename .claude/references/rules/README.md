# Reglas ASDD bajo demanda

Estas reglas no se auto-cargan. El flujo propietario debe resolverlas antes de
usarlas mediante:

```bash
node .claude/scripts/asdd-resolve-rule.mjs asdd-{nombre}
```

El resolver devuelve una ruta dentro de este directorio y rechaza nombres no
canónicos. Los controles universales conservan un núcleo compacto en
`.claude/rules/`; cuando ese núcleo declara una carga condicional, el detalle
normativo de este directorio debe leerse completo antes de la acción indicada.
El contrato machine-readable vive en `.asdd/rule-loading.json`.
