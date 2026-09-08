# Dependencias runtime de ATF Web

> Aplica **solo** si activás el pipeline **ATF Web** (`sofka-asdd-atf-web-qa-engineer`,
> comandos `/sofka-asdd:qa-web-*`). El core de ASDD (agentes, skills, hooks, workflow
> de fases) no necesita ninguna de estas dependencias — podés adoptar el template
> completo sin instalarlas si no vas a correr pruebas E2E guiadas por browser.

## Por qué existen

El pipeline ATF Web ejecuta pruebas E2E reales con Playwright (navegación guiada,
capturas de evidencia, validaciones visuales/UX/A11y) y produce un dashboard HTML
de reporte. Ese trabajo requiere librerías de Node.js que **no forman parte del
core del template** — viven declaradas en el `package.json` de la raíz del
repositorio adoptado, no se instalan automáticamente al copiar los artefactos
`.claude/`.

## Qué instala cada dependencia

| Paquete | Tipo | Para qué lo usa ATF Web |
|---|---|---|
| `@playwright/mcp` | dependency | Servidor MCP de Playwright — navegación guiada por browser desde los sub-agentes de ejecución (`.claude/atf-web-steps/execute.md`) |
| `glob` | dependency | Resolución de patrones de archivos en scripts atómicos de `.claude/tools/` (ej. localizar `.xlsx` de requisitos, artefactos por run) |
| `mssql` | dependency | Driver de SQL Server — validaciones `SELECT` contra base de datos cuando `db_driver: mssql` en `appweb.yaml` (skill `sofka-asdd-atf-web-db-validator`) |
| `@playwright/test` | devDependency | Motor de ejecución E2E — corre los specs generados por el pipeline de diseño de CPs |
| `axe-core` | devDependency | Motor de auditoría de accesibilidad — usado por `sofka-asdd-atf-web-visual-ux-a11y-validator` |
| `mammoth` | devDependency | Conversión de `.docx` a texto plano — parseo de HUs/FRS entregadas en Word (paso 0.4 de diagnóstico) |
| `pdf-parse` | devDependency | Extracción de texto de `.pdf` — material de referencia adjunto por el cliente |
| `pptx2json` | devDependency | Parseo de `.pptx` — material de referencia en presentaciones |
| `xlsx` | devDependency | Lectura/escritura de matrices de casos de prueba en Excel (Flujo Fábrica, paso 0.4b) |

## Instalación

Desde la raíz del proyecto que adoptó el template:

```bash
npm install @playwright/mcp glob mssql
npm install -D @playwright/test axe-core mammoth pdf-parse pptx2json xlsx
npx playwright install chromium
```

Si tu proyecto usa otro gestor de paquetes, adaptá el equivalente
(`pnpm add` / `pnpm add -D`, `yarn add` / `yarn add -D`) conservando la
separación dependency vs. devDependency de la tabla anterior — algunos
scripts de `.claude/tools/` corren en runtime de CI/CD donde las
devDependencies pueden no estar disponibles.

Alternativa equivalente: el `package.json` de la raíz del template ya declara
estas dependencias en sus secciones `dependencies`/`devDependencies` con el
script `setup` (`npm install && npx playwright install chromium`). Si tu
proyecto conserva ese `package.json` tal cual (sin fusionarlo con uno propio),
correr `npm run setup` cubre el mismo resultado.

## Caveat de versiones

Las versiones exactas están fijadas en el `package.json` del template (ver
`dependencies`/`devDependencies` en la raíz). Mantenelas en sync con esa
referencia — si tu proyecto ya tiene `mssql`, `xlsx` u otra de estas
librerías instalada con una versión distinta por otra razón (backend propio,
otro pipeline de datos), verificá compatibilidad antes de forzar la versión
del template: pueden aparecer incompatibilidades de API entre major versions
(por ejemplo, `mssql` v11 vs. versiones v9/v10 con firmas de conexión
distintas).

## Automatización futura

Hoy la instalación es manual (este documento). El plan a mediano plazo es
automatizarla vía el CLI de adopción del template, condicionada a un perfil
`atf_web` en `.sofka-asdd/sofka-asdd-atf.lock` con fusión determinística de
`package.json` (`json-deep-merge`), análoga al mecanismo `file_merge` que ya
usa `.sofka-asdd/cli-contract.json` para `.gitignore`. Es un follow-up sin
fecha comprometida — hasta que se implemente, seguí los pasos manuales de
este documento.

## Referencias

- `.claude/agents/sofka-asdd-atf-web-qa-engineer.md` — agente que consume estas dependencias en runtime.
- `/sofka-asdd:qa-web-setup-app` — primer comando a ejecutar tras instalar las dependencias, para alistar una app nueva en el pipeline.
