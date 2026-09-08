# Project Brief — Checkout de 1 clic

> **Ejemplo de referencia ASDD**. Feature ficticio para ilustrar el formato
> esperado de un project brief. Ver otros archivos en `docs/.example/` para
> ver la trazabilidad completa (brief → spec → ADR → sign-off).

| Campo | Valor |
|---|---|
| **Tipo** | Feature evolutiva |
| **Owner** | Product team — e-commerce |
| **Stakeholders** | Retail ops, finance, security, customer support |
| **Fecha** | 2026-04-23 |
| **Status** | approved |

## 1. Problema

El checkout actual requiere 4 pasos (carrito → dirección → pago → confirmación),
lo que produce una tasa de abandono del 38% medida sobre la ventana móvil.
Competencia directa (Amazon, MercadoLibre) ofrece checkout de 1 clic para
usuarios autenticados con método de pago y dirección guardados.

## 2. Objetivo

Reducir el checkout a **un solo clic** para usuarios elegibles, manteniendo
la tasa de fraude actual (< 0.3%) y cumpliendo PCI-DSS.

## 3. Resultado esperado

| KPI | Baseline | Target 90 días |
|---|---|---|
| Conversión mobile | 62% | ≥ 72% |
| Tiempo de checkout (p50) | 48s | ≤ 6s |
| Tasa de fraude | 0.28% | ≤ 0.3% |
| CSAT post-compra | 4.1 | ≥ 4.2 |

## 4. Alcance

### Dentro de alcance

- Usuarios autenticados con al menos 3 compras previas sin contracargo.
- Métodos de pago ya guardados (tarjeta tokenizada, wallet propia).
- Dirección de envío predeterminada.
- Flujo web (mobile + desktop).
- Confirmación por email + push notification.

### Fuera de alcance

- Usuarios anónimos (guest checkout).
- Pago con nuevos métodos (onboarding de tarjetas).
- Edición de dirección en el flujo de 1 clic (forzar fallback al flujo completo).
- App nativa iOS/Android (en siguiente ciclo).
- Items con restricciones de envío (edad, ubicación).

## 5. Restricciones

- **Regulatorias**: PCI-DSS v4.0 — no manipular PAN en frontend; tokens siempre.
- **Técnicas**: el servicio de tokenización actual (Vault) soporta 200 TPS;
  el feature debe quedar dentro de ese límite.
- **Tiempo**: MVP en 6 semanas; rollout por cohortes tras sign-off.
- **Presupuesto**: 2 developers + 1 QA + 1 security part-time.

## 6. Dominio y regulaciones aplicables

- **Dominio activo**: retail / e-commerce.
- **Regulaciones**: PCI-DSS v4.0, Ley de Protección de Datos (habeas data).
- **Gotchas del dominio**: refunds en 1 clic pueden habilitar fraude
  amistoso — definir política con finance.

## 7. Supuestos

- El servicio de recomendación de método de pago "default" ya está en producción.
- La cohorte inicial (power users) acepta opt-in explícito.
- El equipo de anti-fraude puede adaptar reglas actuales sin cambiar modelos.

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Compras por error de usuario | Alto en CSAT | Ventana de cancelación de 60s post-clic |
| Tokenización falla a escala | Bloqueo total | Fallback al checkout clásico con aviso |
| Regulador observa "consentimiento insuficiente" | Legal | Opt-in explícito con registro firmado |

## 9. Definition of Done del brief

- [x] Problema y resultado esperado medibles.
- [x] Alcance y fuera-de-alcance explícitos.
- [x] Restricciones identificadas (regulatorias + técnicas + tiempo + equipo).
- [x] Dominio activo confirmado y gotchas listados.
- [x] Riesgos con mitigación concreta.
- [x] Status: `approved` — listo para `/sofka-asdd:analyze`.

## 10. Siguiente paso

Ejecutar `/sofka-asdd:analyze` para extraer requirements y acceptance criteria
a partir de este brief.
