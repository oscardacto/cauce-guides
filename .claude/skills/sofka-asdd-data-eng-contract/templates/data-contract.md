# Contrato de Datos — {Productor} → {Consumidor}
Versión: {1.0.0} | Fecha: {fecha} | Estado: {Draft / Activo / Deprecado}
Firmado por (productor): {nombre, cargo} | Firmado por (consumidor): {nombre, cargo}

---

## Partes

**Productor**
- Equipo: {nombre del equipo}
- Sistema que genera los datos: {nombre del sistema}
- Tabla / topic / endpoint: {nombre exacto}
- Responsable técnico: {nombre, contacto}

**Consumidor**
- Equipo: {nombre del equipo}
- Caso de uso: {para qué usa estos datos}
- Responsable técnico: {nombre, contacto}

---

## Schema comprometido

| Columna | Tipo de dato | Nullable | Descripción | PII |
|---|---|---|---|---|
| {columna} | {string/int/date/decimal} | {sí/no} | {qué representa} | {sí/no} |

**Nota:** columnas no listadas aquí pueden cambiar sin proceso de breaking-change. Solo las columnas de esta tabla son parte del contrato.

---

## SLA

| Dimensión | Compromiso | Penalización / Escalación |
|---|---|---|
| Frescura | {datos del día anterior disponibles antes de las {hora}} | {notificar a {canal} si se incumple} |
| Uptime | {99.X% en horario {horario}} | {proceso de escalación} |
| RPO | {máximo {X}h de pérdida de datos} | {proceso de escalación} |

---

## Control de acceso (ACL)

- **Puede leer:** {equipos/roles autorizados}
- **Requiere aprobación previa:** {proceso para solicitar acceso — a quién, por qué canal}
- **No puede acceder:** {restricciones explícitas}

---

## Proceso de breaking-change

Un breaking-change es cualquier modificación incompatible: renombrar columna, cambiar tipo de dato, eliminar columna, cambiar el grain de la tabla.

**Preaviso mínimo de referencia:** 1 día laborable (impacto bajo) o 2 días laborables (impacto medio/alto o con consumidores activos). No incluye fines de semana ni festivos. Ajustado por acuerdo: {X días acordados}

**Pasos:**
1. Productor notifica al consumidor con mínimo {X} días de anticipación por {canal}
2. Período de transición: ambas versiones activas simultáneamente durante {X días}
3. Consumidor migra a la nueva versión durante el período de transición
4. Fecha de corte: {fecha} — la versión anterior queda deprecada
5. Productor confirma deprecación al consumidor

**Cambios compatibles** (no requieren proceso de breaking-change):
- Agregar columna opcional
- Agregar filas
- Actualizar documentación de una columna

---

## Versionado semántico
- **MAJOR** (2.0.0): breaking change — renombrar, cambiar tipo, eliminar
- **MINOR** (1.1.0): cambio compatible — agregar columna opcional
- **PATCH** (1.0.1): fix de documentación, sin cambio de schema

---

## Historial de versiones
| Versión | Fecha | Cambio | Impacto |
|---|---|---|---|
| 1.0.0 | {fecha} | Versión inicial | — |
