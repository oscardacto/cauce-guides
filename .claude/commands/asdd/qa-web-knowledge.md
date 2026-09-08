---
description: Extrae conocimiento de dominio de los documentos de contexto y lo persiste incrementalmente. Independiente del pipeline.
mode: 'agent'
---

Procesa documentos de contexto/dominio para enriquecer la base de conocimiento del proyecto
**sin ejecutar el pipeline de pruebas**.

**Antes de ejecutar, deposita los documentos en:**

```
docs/testing/atf-web/requirements/context/
```

Formatos soportados: `.md`, `.txt`, `.docx`, `.pdf`

Estos documentos pueden ser: reglas de negocio, glosarios, documentación de onboarding,
guías de arquitectura, manuales de procesos, o cualquier material de referencia del dominio.

---

**Ejecuta el @.claude/atf-web-steps/knowledge.md**

El agente realizará:

1. **Inventario y conversión** — lista archivos, convierte `.docx` a `.md`
2. **Extracción de conocimiento** — destila glosario, comportamientos, gotchas, referencias
3. **Merge incremental** — persiste en `knowledge/app_behavior.md` y `knowledge/test_gotchas.md` sin sobreescribir lo existente
4. **Archivo** — mueve documentos procesados a `docs/testing/atf-web/requirements/processed/`
5. **NotebookLM** — alimenta el cuaderno si está habilitado en `appweb.yaml`

**Outputs:**

- `knowledge/app_behavior.{app_name}.md` — términos de glosario y comportamientos del sistema
- `knowledge/test_gotchas.{app_name}.md` — gotchas y advertencias para testing
- `docs/testing/atf-web/requirements/processed/knowledge_extraction_log.json` — log acumulativo de extracciones

---

**Tip:** Ejecutar este prompt **antes** del pipeline de pruebas (`agent_run`) permite
que el Diagnostician encuentre el knowledge base ya enriquecido, mejorando la calidad del
análisis de testabilidad.
