# Guía del huésped · LIVING POP

**Versión:** 0.1.0
**Estado:** Parcial — 2 de 4 secciones cerradas
**Gobierna:** ADR-004 v1.1 (tokens de marca)
**Regla dura:** este documento nunca contiene credenciales. Ni wifi, ni código de cerradura, ni QR. Esos viajan por WhatsApp, por reserva.

---

## 1 · La casa

**La ducha**

Abre la llave y listo: el calentador a gas se enciende solo. El agua tarda unos segundos en llegar caliente.

**La cafetera**

El café lo dejamos nosotros. Es de Cuckoo Café, tostado acá en Popayán.

Llena el depósito con agua fría hasta la marca que necesites. La línea de 12 tazas es el máximo.

El filtro es permanente: va en su canasta, sin papel. Encima, el café molido — una cucharada colmada por taza es un buen punto de partida.

Tapa cerrada, jarra sobre la placa, y enciendes.

Si quieres servirte antes de que termine, puedes retirar la jarra. Devuélvela antes de veinte segundos o el filtro se desborda.

Cuando termines, un ciclo corto solo con agua deja el filtro limpio para el siguiente café.

---

**Pendiente en esta sección**

| Ítem | Qué hace falta |
|---|---|
| Cocina | Qué electrodomésticos hay y cuál tiene truco |
| TV y mueble giratorio | Cómo se gira, cómo se enciende, si hay streaming |
| Calefacción | Si existe y cómo se usa |
| Edificio | Piso, ascensor, dónde queda el shut de basura |

---

## 2 · La casa se cuida sola, casi

**El sonido viaja.**
Las paredes del edificio son delgadas y hay vecinos permanentes. Después de las 10 de la noche, conversación normal. No es espacio para reuniones ni fiestas.

**Solo quienes están en la reserva.**
El apartamento es para las personas registradas. Si alguien más va a quedarse, escríbeme antes y lo ajustamos.

**La puerta del edificio es de todos.**
No abras a personas que no conoces ni dejes entrar a nadie detrás de ti. La seguridad del edificio depende de que cada quien entre con su propio acceso.

**El aire de la casa.**
No se fuma dentro, ni se consumen sustancias. El olor se queda en los textiles y lo hereda quien viene después.

**La basura.**
Déjala en la caneca de la cocina, en bolsa cerrada. Del resto nos encargamos nosotros. Si se acumula más de la cuenta, el shut del piso queda justo frente al ascensor.

**Sin mascotas.**
Por ahora no recibimos animales. Si viajas con uno, avísame y te recomiendo dónde sí.

**Las zonas comunes.**
Gimnasio, coworking y lavandería son del edificio, no del apartamento. Se usan con el mismo cuidado con que usarías los tuyos.

---

## 3 · Popayán

> **PENDIENTE.** Nada de esta sección está escrito.
> Formato de cada entrada: nombre · dirección · minutos a pie. Sin foto (Q-09).

| Ítem | 2 noches | 30 noches |
|---|---|---|
| Tres sitios para almorzar | Sí | Sí |
| Café | Sí | Sí |
| Farmacia y urgencias | Sí | Sí |
| Cajeros | Sí | Sí |
| Supermercado y plaza de mercado | — | Sí |
| Lavandería | — | Sí |

---

## 4 · La salida

**Check-out: 11:00 a.m.**

Antes de irte:

- Deja la loza usada en el lavaplatos. No hace falta lavarla.
- Apaga luces y TV.
- Cierra la puerta del balcón.
- Deja las toallas usadas en el baño.
- Revisa cargadores y documentos.

La puerta se cierra sola. No hay llaves que devolver.

Si necesitas salir más tarde, escríbeme el día anterior y miramos el calendario.

**Contacto:** 350 370 8191

---

## Spec de maquetación

Para el repositorio. Aquí no va código.

**Formato.** Un archivo estático, una sola página, scroll vertical continuo. Sin PWA, sin Service Worker, sin navegación por pestañas. Las cuatro secciones en el orden de este documento.

**Tokens.** ADR-004 v1.1 sin desviación.

- Fondo CAL `#F2EEE6`. Texto TINTA `#16130F` (16,00:1).
- Bloques de sección sobre NIEBLA `#E2DCD1` si hacen falta cortes. TINTA sobre NIEBLA = 13,57:1.
- TEJA `#A94D28` solo sobre CAL, y solo en la hora de check-out y el teléfono. Sobre NIEBLA queda en 4,07:1 y no se usa en texto pequeño.
- CHIRIMÍA `#E9A227` no se usa en v0.1.
- Titulares de sección en Fraunces Regular a 28 px o más. Todo lo demás Inter. La hora de check-out y el teléfono en IBM Plex Mono.
- Retícula 8 px. Margen 24 px hasta 767, 90 px desde 768.
- **Sin firma al pie.** Decisión del propietario, 16 de septiembre de 2026, que deroga la línea anterior de este mismo punto (ver «Decisiones registradas»). `logo_B_wordmark.svg` se retira del repo: contiene `B5714F` —Terracota, derogado por ADR-004 y **prohibido en el build por el punto siguiente de esta misma sección**— y `EB Garamond`, que no pertenece al sistema tipográfico (Georgia serif · sans · mono). Es un asset de la exploración de julio que sobrevivió al cambio de sistema. Sus tres `fill` (`#211C18`, `#2E2925`, `#F6F1E7`) tampoco son tokens de ADR-004. La página va sin firma hasta que exista un wordmark construido con el sistema vigente.

**Prohibido en el build.** Cualquier aparición de `1B1A18`, `EFE6D4`, `B5714F`, `Jost`, `Cinzel`, `DejaVu`, `LP-S_arco`, `Casa Patio`. Cualquier hit es defecto.

**Aire.** Mínimo 35 % de área libre. Sin degradados, sin sombras, sin bordes tipo píldora.

---

## Orden de trabajo

**Tarea.** Página estática única, scroll vertical continuo, secciones en el orden de este documento.

Regla de renderizado: **una sección sin contenido no se maqueta.** No lleva titular vacío, ni «próximamente», ni placeholder. Hoy eso significa que la sección 3 (Popayán) no existe en la página, y que la sección 1 muestra solo la cafetera. Un titular sin nada debajo le dice al huésped que la guía está incompleta; una guía corta y completa no dice nada.

**Contexto.** Los tokens de la sección anterior son normativos, no sugerencias. Provienen de ADR-004 v1.1.

**Restricciones.**

- Cero credenciales en el bundle, en cualquier forma.
- Sin PWA, sin Service Worker, sin router, sin build step si se puede evitar.
- Sin librerías de animación. Sin dependencias de terceros para tipografía: Inter, Fraunces e IBM Plex Mono autohospedadas.
- Sin `localStorage` ni estado persistente. La página no recuerda nada.
- No inventar assets de marca. Se usa `logo_B_wordmark.svg` tal como está en el repo. Si no está, se maqueta sin firma y se deja el hueco.
- Los archivos `logo_A_sello.*` y los PNG de logo no entran al repo de la guía. No se usan y son ruta de importación equivocada.

**Verificación.** El agente corre por sí mismo y devuelve la salida cruda, no un resumen:

1. `grep` de la lista de prohibidos del build
2. Lighthouse
3. Render a 390 px de ancho

## Definición de terminado

| # | Criterio |
|---|---|
| 1 | `grep` de prohibidos sin resultados |
| 2 | Lighthouse Performance ≥ 95 |
| 3 | Contraste AA 4,5:1 en todo el texto |
| 4 | Cero scroll horizontal a 390 px |
| 5 | Retícula 8 px, margen 24 px hasta 767 y 90 px desde 768 |
| 6 | Cero credenciales en el bundle |
| 7 | Área libre ≥ 35 % |

---

## Decisiones registradas

**Se eliminó el cierre de multas.** «El incumplimiento puede generar multas o cancelación de la reserva» es lenguaje de contrato y contradice el arquetipo Cuidador. Si la reserva entra por Airbnb, la cancelación la ejecuta la plataforma bajo sus reglas.

**Se eliminó «comportamientos inapropiados».** No es verificable y no informa. Quien iba a portarse mal no se detiene ahí; quien no, se siente sospechoso.

**Firma: wordmark, no arco.** ~~Decisión del propietario, 15 de septiembre.~~ **SUPERADA el 16 de septiembre de 2026 — no se borra, es el registro de por qué se intentó.** Deroga la línea de ADR-004 v1.1 que fijaba `LP-arcoL-*.svg` como símbolo. La guía iba a firmar con `logo_B_wordmark.svg`. El sello circular (`logo_A_sello`) queda descartado: muere al tamaño de un pie de página, donde el texto curvo no se lee.

Motivo de la superación: al revisar el asset, el wordmark resultó ser de la exploración de julio y no del sistema vigente — `B5714F` y `EB Garamond` adentro. La guía va sin firma. El descarte del sello sigue en pie.

Pendiente de resolver con el sistema de marca: si el wordmark reemplaza al arco en todo el sistema o solo en producto digital, y qué pasa con la serif del wordmark frente a la Inter vectorizada de los lockups. Mientras eso no se decida, esta es una decisión local de la guía, no del sistema.

**La basura no se baja por defecto.** El aseo lo hace la operación. El shut se menciona como salida para volumen alto, no como instrucción. Pedirle al huésped que baje basura que nosotros íbamos a recoger es trabajo inventado.

**Paredes delgadas confirmado.** La regla de sonido de la sección 2 queda como está: es un hecho del edificio, no una precaución genérica.

**Sin credenciales.** Q-26 confirmó que el código de cerradura y el QR rotan por estadía. Esa es la implementación correcta de credencial efímera y no se toca. La guía es pública y no las contiene.

---

## Abierto

| # | Qué | Dueño |
|---|---|---|
| — | Contenido de las secciones 1 y 3 | Propietario |
| Q-20 | Baseline de mensajes operativos | Propietario |
