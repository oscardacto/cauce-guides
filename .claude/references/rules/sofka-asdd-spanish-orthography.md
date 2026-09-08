# Ortografía en Español — Zero Tolerancia

**Todo texto visible al usuario DEBE estar en español con ortografía correcta. Sin excepciones.**

## Alcance — Qué es "texto visible al usuario"

### Backend
- Mensajes en anotaciones de validación del framework (ej: Bean Validation `@NotBlank(message = "...")`, class-validator) devueltos al cliente en respuestas de error.
- Mensajes en excepciones de dominio cuyo texto llega al body de respuestas de error (400/409).
- Strings literales en respuestas HTTP (body, headers de error).

### Frontend
- Labels, placeholders, tooltips, breadcrumbs, títulos, descripciones en templates/componentes.
- Mensajes de validación en schemas del cliente (ej: Zod `z.string().min(1, "...")`, Yup).
- Mensajes de notificaciones de UI (toast, alert, modal, confirmación).
- Textos en atributos de accesibilidad (`aria-label`, `title`, `alt`) visibles al usuario.
- Strings en sistemas de internacionalización (i18n keys con contenido en español).

## Reglas de Ortografía

- **Tildes OBLIGATORIAS** en todas las palabras que las necesitan.
- **Signos dobles OBLIGATORIOS**: `¿...?` y `¡...!`.
- Tests que validan strings en español DEBEN actualizarse junto con el texto corregido.

## Palabras que SIEMPRE llevan tilde

información, dirección, teléfono, número, código, página, selección, atención, documentación, evaluación, negociación, validación, institución, clasificación, descripción, calificación, configuración, parametrización, gestión, año, módulo, clínica, técnica, médico, rehabilitación, actualización, corrección, programación, razón, obligatorio, contraseña, obligatoria, dígitos.

## Exclusiones — NO aplica esta regla

- Códigos de error en respuestas técnicas (siempre SCREAMING_SNAKE_CASE inglés — `VALIDATION_ERROR`).
- Logs (siempre en inglés — `log.error("Failed to process...")`).
- Comentarios de código y documentación técnica (Javadoc, JSDoc).
- Nombres de métodos, clases, variables (siempre en inglés).
- Documentación OpenAPI / Swagger (puede estar en inglés, es documentación técnica).

## Al crear o modificar texto en español

1. Verificar tildes y ortografía ANTES de hacer commit.
2. Actualizar tests que validan esos strings.
3. Si el texto es un mensaje de excepción en dominio/aplicación: verificar que el tipo de excepción sea el correcto según la política de manejo de errores del proyecto.
