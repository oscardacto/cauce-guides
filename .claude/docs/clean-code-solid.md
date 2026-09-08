# Clean Code & SOLID

> Doc normativo on-demand (#3644). Referenciado por las skills que lo requieren; no se carga always-loaded (criterio #3671).

Aplica a todo agente que escriba o modifique código de producción.

## Pre-Write (TODO agente DEBE revisar ANTES de escribir código)

- **Estándares de calidad**: consultar la documentación de calidad del proyecto (si existe en `.claude/docs/`).
- **Idioma**: código en inglés, mensajes al usuario en español, logs en inglés, commits en español (subject + cuerpo; tipos `feat`/`fix`/etc. en inglés por ser keywords de conventional-commits).
- **Coverage**: los umbrales exactos se declaran en el CLAUDE.md del proyecto consumidor. Referencia típica: global ≥ 80%, capa de dominio ≥ 90%, aplicación ≥ 85%, infraestructura ≥ 75%.

## SOLID

- **SRP:** 1 clase / componente / hook = 1 responsabilidad.
- **OCP:** Extensible via composición / props / variantes — sin modificar código existente.
- **LSP:** Implementaciones de una misma interfaz deben ser intercambiables.
- **ISP:** Interfaces pequeñas y enfocadas. Evitar interfaces "dios" que fuercen a implementar métodos no usados.
- **DIP:** Dependencias hacia abstracciones. La capa de dominio define puertos; las capas externas los implementan.

## Clean Code

- Nombres descriptivos (mínimo 3 caracteres). Funciones cortas (referencia: ≤ 30 líneas para lógica pura — ajustar al stack del proyecto).
- Complejidad ciclomática baja (CC ≤ 10). DRY (3+ repeticiones → abstraer). KISS. YAGNI.
- Guard clauses sobre nesting profundo. Nesting máximo: 2 niveles. Preferir `const` sobre `let`.
- Sin magic numbers/strings (usar constantes nombradas). Sin dead code. Sin código comentado. Sin efectos secundarios ocultos.
- Boy Scout Rule: dejar el código más limpio de lo que se encontró — escalar oportunidades de mejora a `asdd-tech-lead` (skill: refactoring) si exceden el scope del ticket.

## Exception Handling

Aplica a todo agente que escriba código con operaciones que pueden fallar (I/O, red, parseo, integración).

### Principios

- **Fallar rápido y explícito**: lanzar la excepción más específica disponible. Nunca silenciar errores con `catch {}` vacío o `catch (Exception e) { log(e); }` sin relanzar.
- **Capturar solo lo que podés manejar**: no atrapar `Exception` / `Throwable` / `Error` genéricos salvo en el boundary de la aplicación (controlador HTTP, consumer de mensajes, main).
- **Excepciones de dominio vs técnicas**: las excepciones de dominio comunican reglas de negocio violadas (deben tener mensaje en español para el usuario); las técnicas son errores de infraestructura (mensaje en inglés, nunca expuesto al usuario).
- **No usar excepciones como control de flujo**: `if/else` para condiciones esperadas; excepción solo para condiciones verdaderamente excepcionales.
- **Cleanup garantizado**: toda operación con recurso externo (archivo, conexión, lock) usa `finally` / `try-with-resources` / `using` / `defer` — sin excepción.

### Antipatrones prohibidos

| Antipatrón | Por qué está prohibido |
|---|---|
| `catch (Exception e) {}` (silencio) | Oculta fallos reales; hace el debug imposible |
| Retornar `null` en lugar de lanzar | El caller no sabe que falló; propaga corrupción silenciosa |
| Lanzar `new Exception("error")` genérico | Sin información para diagnosticar; usar tipo específico |
| Capturar y relanzar sin información adicional | Pierde el stack trace original; usar `throw` (sin argumento) o envolver con `cause` |
| `printStackTrace()` en producción | Expone internals; usar el logger del proyecto |
| Mensaje de excepción con datos de usuario (PII) | Viola privacidad; el mensaje debe ser genérico |

### Estructura mínima en boundary de aplicación

```
try {
  resultado = casoDeUso.ejecutar(comando)
} catch (ExcepcionDeDominio e) {
  // traducir a respuesta de error del cliente (400/409)
} catch (ExcepcionDeInfraestructura e) {
  // loguear + respuesta genérica (500)
  // NUNCA exponer el mensaje técnico al cliente
}
```
