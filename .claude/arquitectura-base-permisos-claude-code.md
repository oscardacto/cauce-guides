# Arquitectura Base de Permisos para Claude Code

> Destilado de la auditoría de permisos y protecciones realizada en ClaudeCore SBS (julio-agosto 2026).
> Sirve como plantilla para arrancar cualquier proyecto nuevo sin repetir la investigación.
>
> **Cada afirmación lleva su nivel de certeza:**
>
> | Marca | Significado |
> |-------|-------------|
> | **[MEDIDO]** | Comprobado ejecutándolo en este entorno, con resultado observado |
> | **[DOCUMENTADO]** | Está en la documentación oficial de Claude Code |
> | **[ISSUE]** | Reportado públicamente en `anthropics/claude-code` |
> | **[INFERENCIA]** | Deducción razonada a partir de evidencia, no comprobada directamente |
> | **[NO DEMOSTRADO]** | Quedó sin verificar |
>
> Nada en este documento es una buena práctica genérica traída de afuera. Si no lleva marca, es
> criterio de diseño explícito, no un hecho.

---

## 1. Objetivos

Una arquitectura de permisos para un flujo de desarrollo automatizado tiene **un solo objetivo
central**: que el agente pueda trabajar de corrido en las tareas rutinarias, y que el humano
intervenga exactamente en los puntos donde su decisión aporta algo.

Eso se descompone en cuatro objetivos operativos:

**Eliminar la fatiga de aprobación.** Un flujo donde el 69% de las operaciones piden autorización
**[MEDIDO]** no produce seguridad: produce clics automáticos. El humano deja de leer lo que aprueba,
y el prompt pierde su función. Reducir el ruido **es** una medida de seguridad, no una concesión.

**Hacer que la política sea un artefacto de equipo, no de máquina.** La política debe viajar con el
repositorio y funcionar al clonar, sin que cada persona reconstruya su configuración. Todo lo que
sea específico de una máquina (rutas absolutas, credenciales) debe quedar fuera por diseño, no por
disciplina.

**Colocar cada control en la capa donde es fiable.** La capa de reglas y la capa de hooks tienen
capacidades distintas y verificables. Poner un control en la capa equivocada produce **falsa
seguridad**: una regla visible que no funciona es peor que su ausencia declarada, porque nadie
vuelve a mirarla.

**Que la política sea estable en el tiempo.** El indicador de una arquitectura correcta no es su
tamaño sino su tasa de cambio: si hay que tocarla más de una vez al mes, el modelo de capacidades
está mal dimensionado. Una política que crece con cada sesión no es una política, es un registro.

Un quinto objetivo, que solo aparece cuando algo falla: **que las protecciones fallen de forma
visible**. Comprobamos que sin Node los hooks fallan y el comando **pasa** **[MEDIDO]** — sin aviso.
Una protección que se desactiva en silencio es la peor de todas, porque el equipo sigue confiando
en ella.

---

## 2. Principios demostrados

### 2.1 Versionar la política del proyecto, mantener personal solo lo de máquina

**Evidencia.** Al inicio, el registro de hooks vivía dentro del archivo personal, y ese archivo
estaba en `.gitignore` **[MEDIDO]**. Consecuencia: quien clonaba el repo recibía los scripts de hook
pero **ninguno se activaba**, porque no hay auto-discovery — un script no registrado nunca corre.

**Por qué funciona.** La documentación define el archivo de proyecto como el pensado para
compartirse, y el local como personal y auto-excluido de git **[DOCUMENTADO]**. Las listas de ambos
se **fusionan** al cargar **[DOCUMENTADO]**, así que no hay duplicación: las protecciones llegan del
repositorio y lo personal lo aporta cada quien.

**Riesgo que evita.** Protecciones inertes en las máquinas del equipo, creyendo que están activas.

### 2.2 Separar lo compartido de lo personal es una medida de seguridad, no de orden

**Evidencia.** El archivo personal acumulaba **12 tokens JWT, una appKey de larga vida y
contraseñas de BD en texto plano** dentro de comandos `curl` aprobados, más 234 reglas con rutas
absolutas de un usuario **[MEDIDO]**. Alguien lo había gitignoreado con razón — pero eso arrastró
también el registro de hooks.

**Por qué funciona.** Separando por naturaleza del contenido (compartible vs. específico de máquina)
en lugar de por comodidad, los secretos no tienen camino al repositorio.

**Riesgo que evita.** Credenciales en el historial de git. Y un efecto secundario descubierto: la
separación protege incidentalmente contra el bug de sobrescritura reportado en **[ISSUE #9814]** —
si los clics escriben en el archivo personal, no pueden destruir la política del proyecto.

### 2.3 Política por capacidades, no por comandos

**Evidencia.** Una allow-list acumulada por clics durante meses llegó a **1.088 reglas, de las
cuales el 84% eran match exacto sin wildcard** y el 44% contenía un marcador que garantizaba que no
volvería a coincidir: rutas absolutas, SHAs de commit, tickets, UUIDs de directorios temporales,
puertos **[MEDIDO]**. Caso emblemático: **101 reglas de `curl` y `curl` seguía preguntando**.

Al reemplazarla por ~300 reglas organizadas por capacidad funcional, los prompts de un ciclo de
trabajo bajaron de **69% a 8-11%** **[MEDIDO]**.

**Por qué funciona.** Una regla de capacidad cubre las invocaciones futuras; una regla exacta cubre
solo la que ya ocurrió. Al escribirla a mano se elige el nivel de generalidad; al acumularla por
clics, no.

**Riesgo que evita.** Una política que crece indefinidamente sin reducir el ruido. Y confirmado por
medición: borrar las 540 reglas muertas **no cambió ni un prompt** **[MEDIDO]** — eran peso muerto,
no cobertura.

### 2.4 Los hooks complementan a los permisos; no son intercambiables

**Evidencia.** Las capacidades de cada capa quedaron delimitadas por medición:

| | Capa de reglas | Capa de hooks |
|---|---|---|
| Bloquear | sí | sí **[MEDIDO]** |
| Preguntar | sí | **no** **[MEDIDO]** |
| Expresar composición (pipe a shell) | **no** **[MEDIDO]** | sí |
| Parsear un destino (host de una URL) | **no** | sí **[MEDIDO]** |
| Costo | nulo | 1,6 ms como módulo / **309 ms como hook** **[MEDIDO]** |

**Por qué funciona.** Todo lo que requiera composición, parseo o contexto pertenece al hook, donde
se analiza el texto completo con código. Todo lo que sea "esta herramienta sí / esta no" pertenece a
las reglas.

**Riesgo que evita.** Escribir reglas que parecen proteger y no lo hacen. Ejemplo concreto: intentar
restringir `curl` a `localhost` con una regla deja pasar `http://localhost.evil.com`, porque la
regla compara por substring; el hook parsea la URL y compara el hostname real **[MEDIDO]**.

### 2.5 Una sola forma de wildcard es fiable

**Evidencia.** Una regla `deny` de **un segmento** bloqueó el comando; la misma intención expresada
con **dos wildcards** no coincidió, mientras el control de un segmento sí funcionaba en la misma
corrida **[MEDIDO]**. Esto confirma **[ISSUE #9408]**, cerrado como *not planned*.

**Por qué funciona.** Limitarse al prefijo de un segmento hace que el comportamiento de la regla sea
predecible.

**Riesgo que evita.** Reglas `deny` que no disparan. Es el peor caso posible: **una regla `deny` que
no funciona falla abierta y genera confianza falsa.**

### 2.6 `ask` se evalúa antes que `allow`, y la especificidad no altera el orden

**Evidencia.** Tres reglas `ask` amplias sobre git anulaban **145 reglas `allow`** más específicas
del mismo dominio **[MEDIDO]**. Más tarde, con la política nueva, esas mismas 3 líneas provocaban
**11 de los 15 prompts** de una jornada; quitarlas bajó el ruido del 29% al 8% **[MEDIDO]**.

**Por qué funciona.** Sabiendo el orden, un dominio con lecturas permitidas y escrituras controladas
se modela **enumerando las lecturas en `allow` y dejando las escrituras sin regla** (caen al prompt
por defecto), nunca con un `ask` amplio más excepciones.

**Riesgo que evita.** Reglas muertas que dan la impresión de estar configuradas. En este proyecto
fueron 145; el patrón se repitió con las 44 reglas nuevas hasta que se quitó el `ask` amplio.

### 2.7 Fallar hacia la fricción, nunca hacia la exposición

**Evidencia.** Aplicado en dos decisiones concretas. Primera: al enumerar lecturas de git en lugar
de permitir todo y exceptuar escrituras, un subcomando olvidado **pregunta** en vez de pasar. La
lista de operaciones de escritura de git es abierta y crece; la de lectura es acotada y estable.
Segunda: al acotar reglas amplias (`docker *` → subcomandos concretos), las operaciones no
enumeradas volvieron a preguntar sin necesidad de reintroducir un `ask` **[MEDIDO]**.

**Por qué funciona.** Los dos modos de fallo tienen costos asimétricos: olvidar una lectura cuesta
un prompt; olvidar una escritura puede costar trabajo perdido.

**Riesgo que evita.** Que un olvido de configuración se convierta en un permiso.

### 2.8 La protección importa donde no hay diff que revisar

**Evidencia.** Al decidir qué proteger contra modificación del propio agente, la línea útil resultó
ser otra que la esperada: para archivos **versionados**, `git diff` ya es el control — cualquier
alteración aparece en la revisión del PR. Se protegieron solo los archivos de datos que definen las
protecciones **[MEDIDO: la protección dispara]**, y se dejaron fuera los hooks, skills y prompts
maestros versionados.

**Por qué funciona.** Proporciona el control al riesgo real y evita bloquear el desarrollo del
propio framework.

**Riesgo que evita.** Sobre-protección que rompe el mantenimiento. Caso detectado: proteger los
documentos técnicos regenerados por un skill del proyecto **habría roto ese skill**.

### 2.9 La suite de pruebas es el artefacto que sostiene todo lo demás

**Evidencia.** Las pruebas de los hooks detectaron, en distintos momentos: dos falsos negativos
graves (alias de PowerShell sin cubrir, matcheo sensible a mayúsculas), un tercero que destruía el
repositorio (`rm -rf .git` sin barra final pasaba), y dos bugs propios durante el desarrollo del
toolkit **[MEDIDO]**. Ninguno era visible por inspección.

**Por qué funciona.** Un caso de prueba en ambas direcciones (uno que permita, uno que bloquee) por
cada patrón agregado convierte cada cambio futuro en verificable.

**Riesgo que evita.** Que la seguridad basada en análisis de texto se degrade sin que nadie lo note.

---

## 3. Qué debe contener un proyecto nuevo

Solo elementos cuya utilidad quedó demostrada en esta auditoría.

**Configuración**

- ☐ Archivo de política del proyecto, **versionado**, con la política y el registro de hooks
- ☐ Archivo personal, **ignorado por git**, reservado a lo específico de máquina
- ☐ Regla explícita en `.gitignore` para el archivo personal
- ☐ Nota en la documentación prohibiendo copiar reglas generadas por clic al archivo compartido

**Política**

- ☐ Bloque `allow` organizado por capacidades funcionales
- ☐ Bloque `deny` para lo que no tiene caso de uso legítimo — **una sola forma de wildcard por regla**
- ☐ Decisión explícita sobre `ask`: si se usa, enumerar; **nunca una regla amplia con excepciones**
- ☐ Cero rutas absolutas, tokens, identificadores de ticket, SHAs, puertos o UUIDs en las reglas

**Hooks**

- ☐ Registro de hooks en el archivo versionado (no hay auto-discovery **[MEDIDO]**)
- ☐ Bit de ejecución de los wrappers **en el índice de git** (necesario en Linux/macOS)
- ☐ Datos de las protecciones separados de la lógica, en archivo aparte
- ☐ Autoprotección de los archivos de datos que definen las protecciones
- ☐ Hook de arranque que verifique los prerrequisitos del entorno

**Verificación**

- ☐ Suite de pruebas de los hooks, con casos en ambas direcciones
- ☐ Validador de las restricciones de la política (que ninguna regla contenga lo prohibido)
- ☐ Corpus fijo de comandos con su veredicto esperado, para detectar deriva al cambiar la política
- ☐ Checklist manual de lo que solo el runtime puede confirmar

**Documentación**

- ☐ Requisitos del entorno **como obligatorios**, con la consecuencia de no cumplirlos
- ☐ Tabla de hechos verificados del runtime, con su fecha de verificación
- ☐ Limitaciones conocidas, cada una con su prueba
- ☐ Nota de mantenibilidad: qué se puede extender sin tocar la lógica, y cuál es la señal de que hay que revisar el diseño

---

## 4. Política mínima recomendada

Solo capacidades. Sin comandos concretos.

| Capacidad | Decisión | Razón |
|---|---|---|
| **Inspección** (leer archivos, listar, ver metadatos) | ALLOW | Sin efectos secundarios. Es la mayor parte de cualquier análisis |
| **Búsqueda y transformación de texto** | ALLOW | Sin efectos secundarios; la edición en sitio la cubre el hook |
| **Descubrimiento del entorno** (qué herramientas hay, qué versión) | ALLOW | Solo lectura de metadatos |
| **Build y compilación** | ALLOW | Determinista y reversible. Sin esto no hay ciclo de trabajo |
| **Ejecución de tests** | ALLOW | Su propósito es fallar sin consecuencias |
| **Instalación desde manifiesto versionado** (lockfile) | ALLOW | El contenido ya pasó por revisión de PR |
| **Agregar una dependencia nueva** | ASK | Introduce código no revisado que ejecuta scripts de instalación |
| **Escritura de archivos dentro del proyecto** | ALLOW | **Solo si un hook protege los archivos sensibles** |
| **Borrado de archivos** | ALLOW | Mismo condicionante. Sin el hook, esta capacidad no debería ser ALLOW |
| **Diagnóstico del sistema** (procesos, red, en lectura) | ALLOW | Solo lectura de estado |
| **Control de procesos locales** | ALLOW | Impacto local y recuperable |
| **Ejecución de scripts del propio repositorio** | ALLOW | Revisables. Y es incoherente permitir un intérprete y no un script del repo |
| **Red hacia servicios locales** | ALLOW | Necesario para probar lo que se desarrolla |
| **Red hacia Internet** | ASK o DENY vía hook | La capa de reglas **no puede** distinguir el destino de forma fiable |
| **Consulta de base de datos en solo lectura, por una vía que garantice el modo** | ALLOW | La garantía viene de la herramienta, no de la regla |
| **SQL directo** | ASK | El matching de prefijo **no distingue** una consulta de un `DROP` |
| **Historial de versiones en lectura** | ALLOW | No modifica estado |
| **Historial de versiones en escritura** | ASK | Toca estado compartido con el equipo |
| **Reescritura de historia publicada** | DENY | Destruye trabajo de terceros |
| **Migraciones de esquema** | ASK | Irreversible sin plan de rollback |
| **Acceso remoto** | ASK | Sale de la máquina local |
| **Escalada de privilegios** | ASK | Rompe todo supuesto de contención |
| **Publicación a un registro externo** | ASK | Efecto externo irreversible |
| **Ejecución de código descargado** | DENY vía hook | Sin caso de uso legítimo. **No expresable como regla** |
| **Modificación de los archivos que definen las protecciones** | Proteger vía hook | El gate es sobre el agente; un humano sigue pudiendo |
| **Borrado de raíz o del perfil de usuario** | DENY | Refuerzo declarativo de una protección que el runtime ya trae |

Dos observaciones que salieron de aplicar esta tabla:

- **Las capacidades de escritura y borrado solo pueden ser ALLOW si existe la capa de hooks.** Sin
  ella, esta política es imprudente.
- **La frontera útil no es por herramienta sino por riesgo.** Separar "build" de "agregar
  dependencia" aportó; separar una herramienta de build de otra, no.

---

## 5. Hooks

### Cuándo usar permisos

Cuando la decisión es **"esta herramienta sí, esta no"** y se puede expresar como un prefijo de un
segmento. La capa de reglas es gratuita, declarativa y visible en el repositorio.

### Cuándo usar un hook

Cuando la decisión requiere algo que una regla no puede hacer, y esto quedó delimitado por medición:

- **Composición** — reconocer que dos operaciones inocuas juntas son peligrosas. Requiere dos o más
  segmentos variables, forma que **no funciona** **[MEDIDO]**.
- **Parseo** — clasificar un destino, un argumento o una estructura. Una regla compara texto; un
  hook puede parsear.
- **Contexto** — consultar una lista externa, el estado del entorno o el contenido de un archivo.
- **Normalización** — distinguir lo que un comando *hace* de lo que *menciona*. Ejemplo medido: una
  redirección de stderr no es una escritura, y el cuerpo de un heredoc es dato, no comandos.

### A qué capa pertenece un problema

| Síntoma | Capa | Por qué |
|---|---|---|
| "Esta herramienta debería poder correr sin preguntar" | Reglas | Es una decisión de capacidad |
| "Esto es peligroso solo cuando se combina con aquello" | Hook | Composición |
| "Depende de a dónde apunta" | Hook | Parseo |
| "Depende de qué archivo toca" | Hook | Contexto |
| "El comando lo menciona pero no lo hace" | Hook | Normalización |
| "Necesito que pregunte, no que bloquee" | **Reglas, obligatoriamente** | Un hook **no puede** escalar a pregunta **[MEDIDO]** |
| "Empieza con una asignación de variable o un bucle" | **Ninguna** | No hay regla posible **[MEDIDO]**. Se resuelve moviendo la lógica a un script |

### Tres restricciones que condicionan cualquier diseño

**Un hook puede bloquear pero no preguntar.** Verificado: la decisión `deny` desde un hook detiene
el comando; la decisión `ask` **no produce prompt** si una regla `allow` ya lo cubre **[MEDIDO]**.
Los casos de juicio se resuelven denegando con un mensaje accionable, o dejándolos en la capa de
reglas.

**Un hook que no puede ejecutarse falla abierto.** Sin su intérprete disponible, el wrapper termina
con un código de error y el runtime **deja pasar el comando** **[MEDIDO]**. De ahí la necesidad de
verificar los prerrequisitos al arrancar la sesión.

**Un hook adicional tiene costo por comando.** Registrar un segundo hook sobre el mismo evento
cuesta un arranque de intérprete extra en **cada** comando (~309 ms medidos), contra ~1,6 ms si es un
módulo cargado por el primero **[MEDIDO]**. Separar por responsabilidad **sí**; separar por registro,
solo con razón.

### Sobre los canales de salida

Un hook de arranque tiene dos canales con propósito distinto **[DOCUMENTADO]**: uno inyecta contexto
que **lee el modelo**, y otro antepone texto al primer prompt que **ve el usuario**. Una advertencia
de seguridad no puede depender de que el modelo se acuerde de relatarla.

---

## 6. Errores que descubrimos

### 6.1 Política acumulada por clics

**Cómo detectarlo.** Contar qué proporción de reglas tiene wildcard. Si la mayoría es match exacto,
la política se acumuló, no se diseñó. Aquí: **84% exacto** **[MEDIDO]**.

**Impacto.** Crece indefinidamente sin reducir el ruido: 1.088 reglas y el 69% de las operaciones
seguía preguntando.

**Solución.** Reemplazar, no ampliar. Ampliar una lista de reglas exactas no resuelve el problema,
porque el problema es su especificidad.

### 6.2 Reglas irrepetibles

**Cómo detectarlo.** Buscar rutas absolutas, SHAs, tickets, UUIDs, puertos y tokens en las reglas.
Aquí: **44% tenía al menos uno** **[MEDIDO]**.

**Impacto.** Peso muerto que nunca volverá a coincidir. Comprobado: borrar 540 de ellas **no cambió
ni un prompt** **[MEDIDO]**.

**Solución.** Un validador automático que falle si una regla contiene esos marcadores.

### 6.3 Ausencia total de capa `deny`

**Cómo detectarlo.** Contar las reglas `deny`. Aquí eran **cero** en los tres niveles **[MEDIDO]**.

**Impacto.** Sin contrapeso declarativo, ampliar `allow` es puro aumento de superficie.

**Solución.** Un `deny` mínimo para lo que no tiene caso de uso legítimo, **con la forma de wildcard
que funciona**.

### 6.4 Falsa seguridad por wildcards que no funcionan

**Cómo detectarlo.** Buscar reglas con dos o más wildcards. Probar una equivalente de un segmento
como control, en la misma corrida.

**Impacto.** El peor de todos: una regla `deny` visible que no dispara **genera confianza falsa**.
Alguien leerá la política y concluirá que está cubierto.

**Solución.** Prohibir la forma multi-segmento en el validador. Si el control hace falta, va al hook.

### 6.5 Regla `ask` amplia que anula las `allow` específicas

**Cómo detectarlo.** Para cada regla `allow`, comprobar si alguna `ask` la cubre. Aquí: **145 reglas
anuladas** **[MEDIDO]**.

**Impacto.** Reglas muertas que aparentan configuración. El síntoma es "configuré esto y sigue
preguntando".

**Solución.** Enumerar. Nunca una regla amplia con excepciones específicas, porque el orden de
evaluación no lo permite.

### 6.6 Registro de hooks en el archivo no versionado

**Cómo detectarlo.** Verificar si el archivo que registra los hooks está en `.gitignore`.

**Impacto.** Los scripts viajan al clonar, pero **ninguno se activa** — no hay auto-discovery
**[MEDIDO]**. El equipo cree tener protecciones inertes.

**Solución.** El registro de hooks es política de proyecto y va versionado.

### 6.7 Secretos dentro de las reglas de permiso

**Cómo detectarlo.** Buscar patrones de credencial en los archivos de configuración.

**Impacto.** Las credenciales de larga vida no expiran solas. Aquí: 12 JWT (ya expirados) y **una
appKey sin expiración** **[MEDIDO]**.

**Solución.** Purgar y rotar lo que no expira. Un JWT vencido es ruido; una API key vencida no
existe.

### 6.8 Protección que falla en silencio

**Cómo detectarlo.** Ejecutar el hook sin su intérprete disponible y observar el código de salida.
Aquí: **exit 127 → el comando pasa** **[MEDIDO]**.

**Impacto.** El equipo trabaja creyendo que los archivos sensibles están protegidos.

**Solución.** Documentar el prerrequisito como obligatorio y verificarlo al arrancar la sesión, por
un canal que **vea el usuario**.

### 6.9 Regla de ruta mal escrita que falla abierta

**Cómo detectarlo.** Intentar la operación que la regla debería interceptar y observar si dispara.
Aquí: una regla de glob relativo **no disparó** y no hubo ningún error **[MEDIDO]**.

**Impacto.** Una regla de seguridad que no existe en la práctica. Aparece en la política, no protege.

**Solución.** Toda regla de seguridad se verifica ejecutándola. Si no se puede verificar, no se
incluye.

### 6.10 Inconsistencia entre intérpretes

**Cómo detectarlo.** Probar la misma operación con distintos intérpretes. Aquí se permitía ejecutar
cualquier script de un intérprete desde cualquier ruta, incluso fuera del repositorio, pero un
script del propio repositorio con otro intérprete pedía autorización **[MEDIDO]**.

**Impacto.** Fricción sin ganancia: la asimetría no aportaba seguridad, solo prompts.

**Solución.** Revisar la política por *capacidad*, no por herramienta.

### 6.11 Falso positivo inherente al análisis de texto

**Cómo detectarlo.** Ocurre solo: un comando que **menciona** una operación protegida como dato se
bloquea igual. Nos pasó **cuatro veces** durante la propia auditoría **[MEDIDO]** — al leer un
archivo cuyo nombre coincidía con un patrón, al escribir un mensaje de commit y al armar payloads de
prueba.

**Impacto.** Fricción impredecible, y difícil de explicar a quien no conoce el hook.

**Solución.** Normalizar antes de analizar (descartar cuerpos de heredoc, neutralizar contenido
entre comillas) y **mantener los casos de prueba en archivos**, no en comandos, porque un comando
con casos peligrosos como dato se bloquea a sí mismo.

### 6.12 Evasión por invocación con ruta absoluta

**Cómo detectarlo.** Probar la operación restringida invocando el ejecutable por su ruta completa.

**Impacto.** Una regla `ask`/`deny` basada en el nombre del comando **se evade** **[MEDIDO]**.

**Solución.** No quedó resuelta. Documentada como limitación; ver §9.

---

## 7. Flujo recomendado para un proyecto nuevo

Solo pasos que ejecutamos realmente.

**1. Verificar el entorno antes de diseñar.** Qué intérpretes y herramientas existen de verdad.
Saltarnos esto nos costó recomendar una solución basada en una herramienta que no estaba instalada.

**2. Verificar el comportamiento del runtime con experimentos baratos.** Antes de escribir la
política: probar si una regla `deny` de un segmento bloquea, si la de dos segmentos también, si el
archivo se recarga en vivo, si un hook puede preguntar, si las reglas de ruta disparan. Son minutos
y **tres de nuestros supuestos resultaron falsos**.

**3. Crear el archivo de política versionado y registrar los hooks.** Sin registro, los hooks no
existen.

**4. Escribir la política por capacidades.** A mano. Con la forma de wildcard que funciona.

**5. Validar automáticamente.** Que el archivo sea válido, que no haya reglas irrepetibles, ni
duplicados, ni formas no fiables, ni `allow` anuladas por `ask`.

**6. Verificar a mano lo que solo el runtime confirma.** Que las reglas cargan, que los `deny`
bloquean, que las reglas de ruta disparan. Una regla de seguridad no verificada no cuenta.

**7. Medir el ruido con un corpus representativo.** Un conjunto fijo de operaciones de una jornada
real, con su veredicto. Es lo que convierte "parece mejor" en un número.

**8. Trabajar unos días con la política vieja superpuesta.** Al fusionarse las listas, la vieja solo
puede permitir más, nunca menos: sirve de red mientras se detectan huecos.

**9. Limpiar lo viejo por clases, midiendo entre pasos.** Primero lo que contiene secretos, después
lo cubierto por la nueva política y lo irrepetible, y al final lo que exige criterio. Si los prompts
no suben, la clasificación era correcta.

**10. Ajustar con los prompts reales como entrada.** Cada prompt inesperado es un dato: o falta una
capacidad, o es estructuralmente inexpresable, o es intencional.

---

## 8. Lo que NO haría de nuevo

Nueve decisiones que cambiaron **durante** esta auditoría. Todas son errores propios, no del runtime.

**1. Recomendar una herramienta sin verificar que existe.** Propuse usar un intérprete y su librería
para leer hojas de cálculo. **No estaba instalado en ninguno de los dos shells.** La verificación del
entorno va primero, no después del diseño.

**2. Diseñar controles sobre una forma de wildcard sin probarla.** Diseñé una separación de destinos
de red en tres niveles usando dos wildcards por regla, y la recomendé con confianza. Después medí
que esa forma **no funciona**. Toda forma de regla se prueba antes de construir sobre ella.

**3. Validar el diseño contra mi propio modelo del matcher.** Mis simulaciones traducían el wildcard
a expresión regular — mi supuesto, no el matcher real. Validaban la *lógica* de los patrones, no su
*funcionamiento*. Hoy separaría explícitamente "verifica intención" de "verifica comportamiento".

**4. Concluir a partir de un test roto.** Para simular la ausencia de un intérprete sobrescribí la
variable de entorno de rutas, y con eso rompí también la resolución del shell: **todos** los
escenarios daban el mismo resultado, incluido el que debía funcionar. La conclusión se sostuvo por
suerte. Hoy exijo que un test tenga un **control que debe pasar**; si el control también falla, el
test está roto.

**5. Usar el canal equivocado para una advertencia de seguridad.** El aviso de entorno iba a un canal
que **lee el modelo**, no el usuario. Una advertencia que depende de que el modelo la relate no es
una advertencia.

**6. Escribir reglas de seguridad sin verificar que disparan.** Agregué autoprotección con reglas de
glob relativo. **No dispararon, y no hubo ningún error.** Hoy no incluyo una regla de seguridad que
no vi funcionar.

**7. Proponer el cambio grande cuando el chico daba el mismo resultado.** Recomendé reemplazar un
archivo completo de 540 reglas cuando **borrar 3 líneas producía el mismo número medido**. Medir
primero la intervención mínima.

**8. Sobre-escapar en el archivo de configuración.** Escribí cuatro barras invertidas donde iba una.
La regla no coincidía con nada y el archivo era JSON válido: **fallo silencioso**. Cualquier regla
con escapado se prueba con un caso real.

**9. Confiar en un escáner de patrones sin verificar sus resultados.** Mi auditoría automática de
comandos problemáticos marcó 13 hallazgos que eran **falsos positivos** — analizaba el interior de
los scripts en vez de los comandos que se invocan — y contó cero scripts donde había varios, por una
extensión que olvidé incluir. Un escáner también necesita su caso de control.

Un patrón atraviesa las nueve: **casi todos los errores fueron de verificación, no de diseño.** Las
decisiones arquitectónicas resistieron; lo que falló fue dar por comprobado lo que solo estaba
razonado.

---

## 9. Decisiones que siguen abiertas

Sin propuestas de solución. Solo el registro de lo que no sabemos.

**El clasificador del runtime.** Existe una capa de decisión independiente de las reglas: bloqueó una
edición con un mensaje propio, y observamos prompts en comandos cuyos componentes estaban **todos**
permitidos por la política. **No sabemos** con qué criterio opera, si es configurable, ni cómo
predecirla. **Es el límite superior de cualquier trabajo de este tipo.**

**Si el hook de arranque efectivamente se dispara.** El script está probado de forma aislada, pero
**no verificamos** que el runtime lo invoque al arrancar la sesión, ni que sus dos canales de salida
lleguen a destino. Al ser silencioso cuando todo está bien, no se puede observar sin provocar el
fallo.

**La sintaxis correcta de las reglas de ruta.** La forma relativa no dispara **[MEDIDO]**. No
pudimos probar las alternativas. Queda sin saber cuál funciona, y por lo tanto **la autoprotección
por reglas quedó fuera de la política**.

**Si el bug de sobrescritura al aprobar sigue vigente.** **[ISSUE #9814]** reporta que aprobar de
forma permanente puede reemplazar la lista completa. **No lo verificamos** en esta versión. La
separación entre archivo compartido y personal mitiga el escenario, pero por diseño accidental.

**Cómo se generan las reglas.** La documentación describe algunas transformaciones (separación de
comandos compuestos, eliminación de wrappers) pero **no el algoritmo**: no está documentado qué
componente construye el texto de la regla ni por qué termina en match exacto. Observamos la
correlación —los comandos con comillas, rutas absolutas o separadores producen reglas exactas— pero
es **[INFERENCIA]**.

**Si el matcher separa los comandos compuestos al evaluar.** Un comando cuya cadena completa habría
coincidido con una regla pidió autorización, y el único fragmento sin cubrir era una construcción de
shell. Eso sugiere que evalúa por fragmentos, pero es **[INFERENCIA]**: no lo probamos de forma
aislada.

**Qué hace exactamente el comando de gestión de permisos.** No está documentado si permite editar
una regla existente para generalizarla. Si lo permitiera, sería la vía más limpia para migrar una
política acumulada. **No lo probamos.**

**La evasión por ruta absoluta.** Una regla basada en el nombre del comando se evade invocando el
ejecutable por su ruta completa **[MEDIDO]**. No encontramos forma de cerrarlo con el matching de
prefijo disponible.

**Perfiles por rol.** Evaluado y **descartado**: no existe mecanismo documentado, y el tier `ask` ya
implementa la separación de roles en tiempo de ejecución — quien aprueba es quien tiene la autoridad.
Queda abierto si un proyecto con requisitos de auditoría por rol necesitaría otra cosa.

---

## Cómo usar este documento

Los apartados **3** (checklist), **4** (capacidades) y **7** (flujo) son la plantilla operativa.

El apartado **2** explica por qué cada elemento está ahí, con su evidencia — sirve para justificar
las decisiones ante un equipo que no vivió la auditoría.

El apartado **6** es el que más tiempo ahorra: son los errores ya cometidos, con su forma de
detección.

El apartado **9** dice dónde **no** gastar esfuerzo: son incertidumbres del runtime, no problemas
resolubles con mejor configuración.

> **Los hechos marcados [MEDIDO] se verificaron en agosto de 2026 sobre una versión concreta de
> Claude Code.** El comportamiento del runtime puede cambiar. Antes de apoyarse en cualquiera de
> ellos en un proyecto nuevo, conviene repetir los experimentos del paso 2 del apartado 7: son
> minutos, y aquí tres supuestos resultaron falsos.
