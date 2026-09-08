# Strict TDD — Módulo de Ciclo de Implementación

Módulo cargado por `asdd-developer-feature` cuando `.asdd/testing-capabilities.yaml`
tiene `strict_tdd: true`. No cargar en otro contexto.

## Paso 0 — Leer configuración de testing

Antes de tocar cualquier archivo de código:

```
Leer .asdd/testing-capabilities.yaml
├── Registrar test_runner = testing.runner.command
├── Registrar capas disponibles:
│     unit.available, integration.available, e2e.available
├── Registrar coverage.command (si available: true)
└── Registrar quality tools (linter, type_checker)
```

Si el archivo no existe o `strict_tdd: false` → este módulo no aplica, continuar con flujo estándar de `developer-feature`.

---

## Ciclo TDD por tarea

Repetir este ciclo completo para **cada tarea** en la lista de trabajo. Completar el ciclo antes de pasar a la siguiente tarea.

### Step 0: Safety Net (Red de Seguridad)

Antes de modificar cualquier archivo:

```
Detectar archivos de producción que serán modificados por esta tarea.
Ejecutar tests que cubren esos archivos:
  - Go:     go test ./{package}/...
  - JS/TS:  {runner} --testPathPattern={archivo}
  - Python: pytest {módulo}/
  - Java:   mvn test -Dtest={ClaseTest}

Registrar baseline: "N tests pasando antes de modificar"

Si algún test falla ANTES de tocar código:
  → Reportar como "Pre-existing failure" y DETENER.
  → No intentar arreglar el fallo previo — escalar al Tech Lead.
```

### Step 1: Entender

```
1. Leer la descripción de la tarea
2. Leer los criterios de aceptación de la spec (docs/specs/{feature}.md)
3. Leer decisiones del diseño relevantes (docs/architecture/decisions/)
4. Identificar la capa de test apropiada (ver sección "Elección de capa" abajo)
5. Leer patrones de tests existentes en el proyecto para seguir el estilo
```

### Step 2: RED — Escribir el test primero

```
GATE: No escribir código de producción hasta que el test esté escrito.

1. Crear o abrir el archivo de test
2. Escribir el test desde la spec — qué DEBE hacer el código, no cómo lo hace
3. El test referencia código de producción que AÚN NO EXISTE
4. Ejecutar el test → DEBE FALLAR (rojo)
   - Si pasa sin código de producción → el test no prueba nada, revisarlo
   - Si falla con "cannot find module" o "undefined" → correcto, continuar
5. GATE: No avanzar hasta que el test esté escrito y falle por la razón correcta
```

**Preferencia: Funciones puras**

```
✅ PREFERIR — determinístico, sin efectos secundarios, trivialmente testeable:
function calcularDescuento(precio: number, cantidad: number): number {
  return cantidad >= 5 ? precio * cantidad * 0.1 : 0
}

❌ EVITAR — side effects, estado global, difícil de testear:
function calcularDescuento(item: Item) {
  estadoGlobal.ultimoDescuento = item.precio * 0.1  // efecto secundario
  actualizarDOM()                                    // efecto secundario
  return estadoGlobal.ultimoDescuento
}
```

Antes de escribir una clase o método complejo: evaluar si la lógica puede extraerse a una función pura primero.

### Step 3: GREEN — Mínimo código para pasar

```
GATE: No agregar más código del estrictamente necesario para pasar el test.

1. Escribir el código de producción mínimo
2. "Fake it" es válido: valores hardcodeados son aceptables en GREEN
   ej: return 10  // si el test solo espera 10
3. Ejecutar el test → DEBE PASAR (verde)
4. GATE: No avanzar hasta que el test pase

Si no pasa:
  → Corregir la implementación (no el test, salvo que el test sea incorrecto)
  → Recordar: MÍNIMO para pasar — no anticipar casos futuros
```

### Step 4: TRIANGULATE — Generalizar

```
GATE: Obligatorio. Solo puede omitirse con justificación explícita en la tabla de evidencia.

1. Agregar un segundo caso de test con inputs DISTINTOS al primero
2. Si el primer caso era: calcularDescuento(100, 5) == 10
   El segundo debe ser: calcularDescuento(200, 3) == 0 (no aplica descuento)
3. Ejecutar todos los tests → si el hardcoding rompió → generalizar la implementación
4. Repetir hasta cubrir todos los escenarios de la spec

Mínimo: 2 casos de test por comportamiento definido en la spec.
Si la spec solo define 1 escenario → registrar como "Triangulación: N/A (spec con 1 escenario)"
```

### Step 5: REFACTOR — Limpiar sin romper

```
1. Con todos los tests en verde, mejorar el código:
   - Extraer constantes con nombre significativo
   - Extraer funciones si el bloque es largo
   - Mejorar naming
   - Eliminar duplicación
2. Ejecutar tests después de CADA cambio
3. GATE: Los tests deben seguir pasando en verde

Lo que NO se puede hacer en REFACTOR:
  ✗ Agregar funcionalidad nueva
  ✗ Cambiar el comportamiento observable
  ✗ Omitir correr los tests después de cada cambio
```

---

## Elección de capa de test

Determinar la capa según qué hace la tarea:

```
¿Qué hace la tarea?
│
├── Lógica pura (transformaciones, cálculos, validaciones)
│   └── → Unit test (siempre, sin excepción)
│
├── Renderizado de un componente individual
│   ├── Integration disponible → Integration test
│   └── Integration no disponible → Unit test + mocks
│
├── Flujo entre múltiples módulos o servicios
│   ├── Integration disponible → Integration test
│   └── Integration no disponible → Unit test + mocks mínimos
│
└── Flujo completo del usuario (inicio a fin)
    ├── E2E disponible → E2E test
    ├── E2E no disponible, Integration sí → Integration test
    └── Solo Unit disponible → Unit test

Regla: usar la capa MÁS ALTA disponible para el tipo de comportamiento.
NUNCA saltar una tarea porque la capa ideal no está disponible.
```

Capas disponibles: leer `testing.layers` en `.asdd/testing-capabilities.yaml`.

---

## Ejecución de tests

Correr SOLO el archivo de test relevante durante el ciclo. No correr la suite completa en cada paso (lento, rompe el ciclo).

```
Detectar runner desde testing.runner.command en .asdd/testing-capabilities.yaml

Por ecosistema:
  Go:     go test ./{paquete}/... -run {NombreTest}
  JS/TS:  {runner} --testPathPattern={ruta/al/test}
  Python: pytest {ruta/al/test.py}::test_{nombre}
  Java:   mvn test -Dtest={ClaseTest}#{método}
  .NET:   dotnet test --filter "FullyQualifiedName~{TestClass}.{Method}"

Correr suite completa solo al final de TODOS los ciclos de la sesión.
```

---

## Calidad de assertions — patrones prohibidos

Un assertion que no puede fallar no prueba nada. Estos patrones están PROHIBIDOS:

### Tautologías — CRÍTICO

```
❌ expect(true).toBe(true)
❌ assert True
❌ expect(resultado).toBeDefined()  // solo
❌ assertNotNull(resultado)         // solo, sin verificar el valor
```

### Ghost loops — CRÍTICO

```
❌ items.forEach(item => {
     expect(item.status).toBe('ACTIVE')  // si items está vacío, el test pasa sin probar nada
   })

✅ expect(items).toHaveLength(3)
   items.forEach(item => {
     expect(item.status).toBe('ACTIVE')
   })
```

### Smoke tests sin comportamiento — ADVERTENCIA

```
❌ render(<Componente />)
   expect(screen.getByRole('main')).toBeInTheDocument()
   // No verifica nada del negocio

✅ render(<CarritoCompras items={mockItems} />)
   expect(screen.getByText('Total: $150')).toBeInTheDocument()
   expect(screen.getByText('3 artículos')).toBeInTheDocument()
```

### Acoplamiento a detalles de implementación — ADVERTENCIA

```
❌ expect(elemento.className).toContain('text-red-500')  // CSS puede cambiar
❌ expect(spy).toHaveBeenCalledWith(internalArg)         // detalle interno

✅ expect(screen.getByRole('alert')).toBeInTheDocument()  // comportamiento observable
✅ expect(onError).toHaveBeenCalledWith('Saldo insuficiente')  // contrato público
```

### Exceso de mocks — ADVERTENCIA

```
Relación mocks/assertions:
  ≤ 3 mocks → Saludable
  4-6 mocks → Considerar extraer lógica a función pura y testear directo
  7+ mocks  → DETENER. Capa equivocada o diseño problemático.

Regla extraer-antes-de-mockear:
  Si el comportamiento es: transformación de datos, filtrado, lógica condicional
    → EXTRAER a función pura PRIMERO
    → Testear la función pura directamente (cero mocks)
```

### Qué hace un assertion real

Un assertion real cumple los tres:
1. **Invoca código de producción** — llama una función, método o renderiza un componente
2. **Compara contra un valor concreto** — no solo "definido" sino el valor exacto esperado
3. **Fallaría si el código cambia** — si la implementación es incorrecta, el test falla

---

## Tabla de evidencia TDD (OBLIGATORIA)

Al completar todos los ciclos de la sesión, incluir esta tabla en el output. La fase Verificar la auditará.

```markdown
### Evidencia TDD

| Tarea | Archivo de test | Capa | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|-------|-----------------|------|------------|-----|-------|-------------|----------|
| 1.1 Calcular descuento | `src/pricing/discount.test.ts` | Unit | ✅ 5/5 | ✅ Escrito | ✅ Pasó | ✅ 3 casos | ✅ Limpio |
| 1.2 Crear orden | `src/orders/order.test.ts` | Integration | N/A (nuevo) | ✅ Escrito | ✅ Pasó | ➖ 1 escenario en spec | ✅ Limpio |

### Resumen de tests
- Tests escritos esta sesión: {N}
- Tests pasando: {N}
- Capas usadas: Unit ({N}), Integration ({N}), E2E ({N})
- Funciones puras creadas: {N}
```

**Convenciones de la tabla:**
- Safety Net: `✅ N/N` (existentes corrían) | `N/A (nuevo)` (archivo nuevo, no había baseline)
- RED: `✅ Escrito` (test falló como esperado) | `❌ Omitido` (violación)
- GREEN: `✅ Pasó` | `❌ No pasó`
- TRIANGULATE: `✅ N casos` | `➖ N/A ({razón})` (solo con justificación)
- REFACTOR: `✅ Limpio` | `➖ Sin duplicación a eliminar`

---

## Reglas hard (no negociables)

```
1. NUNCA escribir código de producción antes del test — sin excepción
2. NUNCA saltar el gate GREEN — ejecutar los tests, no asumir que pasan
3. NUNCA omitir triangulación sin justificación explícita en la tabla
4. NUNCA escribir assertions triviales (tautologías, solo toBeDefined)
5. SIEMPRE correr Safety Net antes de modificar archivos existentes
6. SIEMPRE reportar la tabla de evidencia TDD al finalizar
7. Si el test runner falla por razones de infraestructura → reportar "Bloqueado: {razón}" y continuar
8. Para refactoring: SIEMPRE escribir approval tests ANTES de mover código
9. Correr SOLO el archivo de test relevante durante el ciclo, no la suite completa
10. Si se descubre una pre-existing failure en Safety Net → DETENER y escalar al Tech Lead
```
