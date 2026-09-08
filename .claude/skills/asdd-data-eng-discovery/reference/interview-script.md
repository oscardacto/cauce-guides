# Guion de entrevista — Discovery Técnico de datos

Guion estructurado para la sesión de discovery del **Procedimiento B** (post-firma).
Sirve para conducir la conversación con el equipo técnico del cliente y completar
`templates/technical-discovery.md`. Cada bloque mapea directo a una sección de ese
template — al terminar la sesión, las respuestas deberían llenarla sin huecos.

Este guion **no ejecuta nada**: es para entrevistar, escuchar y documentar. Ninguna
pregunta autoriza tocar la infraestructura del cliente.

---

## Instrucciones de uso

**Cuándo se usa:** contrato firmado y acceso al equipo técnico del cliente. Si el
proyecto todavía no se firmó, no es este guion — es el Procedimiento A (revisión de
preventa).

**Quiénes deben estar en la reunión:**
- Por el cliente: un líder técnico (arquitecto, tech lead o líder de datos) **y** al
  menos un owner de los sistemas origen que conozca los datos de primera mano. Sin
  alguien que conozca las fuentes reales, el inventario queda en supuestos.
- Si hay sistema legacy en juego, sumar a quien lo opera hoy.
- Por Guide: el ingeniero responsable del discovery. El arquitecto puede asistir o
  recibir el `.md` después para revisión.

**Duración estimada:** 60-90 minutos. Si hay muchas fuentes (>8), partir en dos
sesiones: una para fuentes y calidad, otra para coexistencia, equipo y restricciones.

**Cómo conducirla:**
- Llevar el template `technical-discovery.md` abierto y completarlo en vivo cuando se
  pueda. No confiar en la memoria.
- Preguntar por una fuente a la vez; no saltar entre sistemas.
- Cuando una respuesta sea vaga ("creo que diario", "más o menos limpio"), anotarlo
  como gap explícito, no inventar el dato.
- Pedir artefactos en el momento: diccionario de datos, diagramas, contratos vigentes,
  muestras de archivos. Vale más una muestra real que diez respuestas.
- No prometer arquitectura ni soluciones en la sesión. El objetivo es capturar, no diseñar.

---

## Bloque 1 — Inventario de fuentes de datos

Repetir este bloque **por cada sistema origen**. Alimenta la tabla "Inventario de
fuentes de datos" del template (Fuente, Sistema origen, Tipo, Volumen, Frecuencia,
Formato, Calidad conocida, Owner técnico, SLA Origen).

**Identificación y tecnología**
1. ¿Cómo se llama esta fuente y de qué sistema sale? (ERP, CRM, base de datos, API, archivo plano)
2. ¿Qué tecnología la respalda? (motor de BD y versión, proveedor SaaS, tipo de API, archivos en SFTP/bucket)
3. ¿Qué tipo de datos contiene? Clasificar como uno de:
   `transaccional` (operaciones del día a día) · `maestro` (entidades de negocio: clientes, productos) ·
   `evento` (logs, streams, clicks) · `referencia` (catálogos, tablas de códigos) · `externo` (proveedor tercero).
4. ¿Hay un diccionario de datos o esquema documentado? ¿Nos lo pueden compartir hoy?

**Volumen y frecuencia**
5. ¿Qué volumen maneja? (filas totales, GB, o cuántos registros nuevos por día)
6. ¿Cada cuánto cambian los datos en origen y cada cuánto necesitan ingestarse?
   (tiempo real, micro-batch, batch diario, semanal, on-demand)
7. ¿Hay picos conocidos? (cierre de mes, campañas, fechas regulatorias)
8. ¿Cómo se extraen hoy los datos de este sistema, si es que ya se extraen? (full, incremental, CDC, export manual)

**Formato**
9. ¿En qué formato llegan o se exponen? (CSV, JSON, Parquet, tabla de BD, mensajes de cola)
10. ¿Hay un esquema fijo o cambia con el tiempo? ¿Quién avisa cuando cambia?

**Calidad conocida**
11. ¿Qué problemas de calidad conocen en esta fuente? (lo que el equipo ya sabe que duele)
12. ¿Hay columnas con nulos frecuentes? ¿Cuáles y por qué?
13. ¿Hay duplicados? ¿Existe una clave única confiable por registro?
14. ¿Hay problemas de encoding, fechas en formatos mezclados, números como texto, separadores inconsistentes?
15. ¿Hay datos que vienen "sucios" desde captura manual? (campos libres, typos sistemáticos)

**SLA existente**
16. ¿Hay hoy algún acuerdo de disponibilidad o frescura sobre esta fuente? (cuándo está lista, cada cuánto se actualiza)
17. ¿Qué pasa hoy cuando esta fuente falla o llega tarde? ¿Alguien se entera, hay alerta?

**Owner técnico**
18. ¿Quién es el responsable técnico de esta fuente? (equipo o persona que sabemos a quién llamar si rompe)
19. ¿Ese owner puede dar acceso y responder dudas durante el proyecto, o hay que escalar?

---

## Bloque 2 — Consumidores y casos de uso

Captura para quién es la plataforma y qué SLA debe cumplir. Alimenta "Señales para
el arquitecto" y las restricciones de tipo SLA del template.

20. ¿Quién usa estos datos hoy? (áreas, equipos, roles — analistas, negocio, modelos, apps)
21. ¿Para qué los usan? (reportes, decisiones operativas, dashboards, modelos de ML, alimentar otra app)
22. ¿Con qué frecuencia los necesitan? (en vivo, varias veces al día, una vez al día, mensual)
23. ¿Qué tan tolerantes son a que el dato llegue tarde? ¿Qué pasa si llega con 1 hora / 1 día de retraso?
24. ¿Qué esperan del nuevo sistema en disponibilidad y frescura? (cuándo debe estar listo el dato cada día)
25. ¿Hay consumidores que NO podemos romper? (un reporte regulatorio, un proceso crítico de negocio)
26. ¿Hay consumidores nuevos que el sistema actual no atiende y este proyecto debería habilitar?

---

## Bloque 3 — Coexistencia y migración

Determina cuál de los tres escenarios aplica (sección "Escenario de integración" del
template) y, si aplica, llena la tabla "Detalle de coexistencia".

**Identificar el escenario**
27. ¿Hay un sistema legacy que seguirá corriendo cuando el nuevo entre en producción?
28. Según la respuesta, clasificar:
    - **Migración limpia:** el legacy se apaga; source va directo a la nueva plataforma, nada corre en paralelo.
    - **Coexistencia temporal:** legacy y nuevo corren juntos un tiempo, con **fecha de corte definida**.
    - **Coexistencia permanente:** arquitectura híbrida estable; ambos conviven indefinidamente sin fecha de corte.

**Si hay coexistencia (temporal o permanente)**
29. ¿Por cuánto tiempo deben convivir? ¿Hay una fecha de corte comprometida?
30. ¿Hay tablas o entidades que existen en el viejo y en el nuevo a la vez? ¿Cuáles?
31. Por cada entidad que convive: ¿cuál sistema es la fuente de verdad mientras dura la convivencia?
32. ¿En qué dirección fluyen los datos durante la convivencia? (legacy→nuevo, bidireccional, ninguno)
33. ¿Qué condición dispara el corte definitivo? (validación completa, fin de período, decisión de negocio)
34. ¿Cómo se notifican cambios de esquema entre los dos sistemas mientras conviven?
    Referencia de preaviso de **breaking-change: mínimo 1 día laborable (impacto bajo) o 2 días laborables (impacto medio/alto)**, sin contar fines de semana ni festivos. Ajustable por acuerdo entre equipos.

**Fechas y responsables**
35. ¿Hay una fecha de migración comprometida con el negocio o con un regulador? ¿Es movible?
36. ¿Quién valida y firma que la migración está completa y correcta? (persona o equipo concreto)
37. ¿Qué criterio define "migración completa"? (conteos cuadran, reconciliación, aprobación de negocio)

---

## Bloque 4 — Equipo y capacidades del cliente

Determina cuánto puede operar el cliente por sí mismo después de la entrega. Alimenta
"Señales para el arquitecto".

38. ¿Tienen experiencia previa en cloud y plataformas de datos? ¿Con cuáles?
39. ¿Qué herramientas usan hoy para datos? (ETL, orquestador, BI, notebooks, warehouse actual)
40. ¿Cuánta gente del equipo del cliente trabajará con la plataforma? ¿Qué perfiles? (ingeniería, análisis, ops)
41. ¿Tienen quién opere y mantenga la solución después de que Guide entregue, o esperan soporte continuo?
42. ¿Hay rotación de soporte / monitoreo de pipelines, o nadie mira los datos fuera de horario?
43. ¿Qué nivel de autonomía esperan al cierre? (operar solos, co-gestión, Guide mantiene)

---

## Bloque 5 — Restricciones

Cada restricción se documenta en formato Guide:
`Tipo | Dureza (dura / semi-dura / blanda) | Origen | Impacto en arquitectura | Vigencia`.

**Regulatorias** (sin asumir país ni ley — preguntar qué conocen ellos)
44. ¿Qué regulaciones aplican a estos datos según ustedes? ¿Quién en el cliente las conoce a fondo?
45. ¿Hay datos personales o sensibles (PII)? ¿Qué campos? ¿Hay que enmascararlos o cifrarlos?
46. ¿Hay requisitos de residencia de datos? (dónde pueden o no pueden vivir físicamente)
47. ¿Hay requisitos de auditoría o trazabilidad? (quién accedió a qué, retención de logs)
48. ¿Hay auditorías o revisiones de cumplimiento programadas que el proyecto deba respetar?

> Documentar todo esto en términos genéricos de governance (retención, PII, residencia,
> auditoría). **No nombrar países ni leyes específicas en el `.md`.**

**Presupuesto y tiempo**
49. ¿Hay un techo de presupuesto para cloud, licencias o cómputo?
50. ¿Hay deadlines comprometidos? ¿Con quién (negocio, regulador) y qué tan firmes son?

**Técnicas y organizacionales**
51. ¿Hay sistemas o tecnologías que NO se pueden modificar ni reemplazar? ¿Por qué?
52. ¿Hay un stack o proveedor obligatorio o vetado? ("solo nube X", "nada de SaaS", "solo SQL")
53. ¿Hay restricciones de red o conectividad para llegar a las fuentes? (VPN, on-prem, IP allowlist, sin salida a internet)
54. ¿Hay políticas de retención de datos definidas? ¿Cuánto se guarda cada tipo de dato y cuándo se purga?
55. ¿Quién aprueba decisiones de arquitectura del lado del cliente? ¿Hay arquitectura corporativa que limite opciones?

---

## Señales de alerta durante el discovery

Observar y anotar en "Señales para el arquitecto". Suelen indicar complejidad oculta
que aún no aparece en las respuestas formales:

- **"Eso lo sabe solo Fulano"** — conocimiento concentrado en una persona: riesgo de bus factor y de fuente no documentada.
- **Nadie conoce el volumen ni la frecuencia real** — probable que la fuente nunca se haya medido; el dato puede ser mucho mayor de lo dicho.
- **"Los datos están limpios"** dicho sin evidencia — pedir una muestra; casi siempre hay sorpresas.
- **No hay diccionario ni esquema** — el modelado costará más y habrá retrabajo.
- **Fecha de corte de migración sin responsable de validación** — el corte se va a postergar o se hará a ciegas.
- **Múltiples fuentes con la misma entidad y ninguna marcada como fuente de verdad** — conflicto de datos garantizado.
- **Extracción manual hoy** (alguien exporta un Excel) — proceso frágil, no reproducible, esconde reglas no escritas.
- **Cambios de esquema sin aviso entre equipos** — los pipelines se van a romper en silencio; falta contrato de datos.
- **Regulación mencionada al pasar sin owner claro** — riesgo de compliance que aparece tarde y caro.
- **El cliente no tiene quién opere la plataforma post-entrega** — la solución debe ser más simple o incluir transferencia de conocimiento.
- **Conectividad a la fuente "se resuelve después"** — bloqueante técnico clásico que frena toda la ingesta.

Marcar cada señal detectada como gap o como nota para el arquitecto. No se resuelven en
la sesión; se documentan para que el diseño las considere.

---

## Cierre — qué confirmar antes de terminar la sesión

1. **Inventario completo:** ¿quedó al menos una fila por cada fuente, con owner identificado?
   Las celdas sin dato se marcan como gap, no se dejan en blanco silencioso.
2. **Escenario de integración elegido:** ¿quedó claro si es migración limpia, coexistencia temporal o permanente?
3. **Fecha de corte y responsable de validación:** si hay coexistencia, ¿están ambos definidos?
4. **Restricciones críticas capturadas:** regulatorias, de presupuesto y de tiempo, en formato Guide.
5. **Artefactos prometidos:** confirmar qué documentos enviará el cliente y para cuándo
   (diccionario, esquemas, contratos, muestras de datos).
6. **Próximos pasos y owner de cada gap abierto:** quién resuelve qué y para cuándo.
7. **Acordar validación:** se comparte el `smart-data-eng-discovery-{cliente}.md` con el entrevistado para
   confirmar que lo capturado es correcto antes de pasarlo al arquitecto.

---

## Después de la entrevista

- Volcar las respuestas a `templates/technical-discovery.md` → produce `docs/specs/smart-data-eng-discovery-{cliente}.md`.
- Marcar explícitamente cada gap (pregunta sin respuesta clara) en "Gaps y preguntas abiertas".
- Trasladar las observaciones de complejidad a "Señales para el arquitecto".
- Compartir el draft con el entrevistado para validación dentro de las 24-48 h.
- Avisar a `asdd-data-governance` que hay inventario de fuentes y restricciones disponibles
  para iniciar el diccionario y el assessment en paralelo (no se bloquean mutuamente).
