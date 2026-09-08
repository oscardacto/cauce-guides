#!/usr/bin/env node
/**
 * ATF — Convierte archivos .pdf a .md en la carpeta de requirements.
 * Uso:
 *   node .claude/tools/convert-pdf.js [carpeta]
 *   node .claude/tools/convert-pdf.js requirements/
 *   node .claude/tools/convert-pdf.js ruta/al/archivo.pdf
 *
 * Default: requirements/
 *
 * - Convierte cada .pdf a .md extrayendo texto por página
 * - Cada página se separa con un heading "## Página N"
 * - El .pdf original se mueve a una subcarpeta .pdf-originals/
 * - Si el .md ya existe y es más reciente que el .pdf → skip
 *
 * Nota: pdf-parse extrae texto plano — las imágenes incrustadas en PDFs
 * no se exportan (limitación de la librería). Para PDFs con mapas visuales
 * o diagramas, usar herramientas externas o compartir directamente en el chat.
 */

const fs = require('fs');
const path = require('path');

// ─── Dependencia ────────────────────────────────────────────────────────────

function loadPdfParse() {
  try {
    const mod = require('pdf-parse');
    // pdf-parse puede exportar como default, como PDFParse, o como función directa
    if (typeof mod === 'function') return mod;
    if (typeof mod.default === 'function') return mod.default;
    if (typeof mod.PDFParse === 'function') return mod.PDFParse;
    // Fallback: buscar la primera función exportada que parezca el parser
    for (const key of Object.keys(mod)) {
      if (typeof mod[key] === 'function' && key.toLowerCase().includes('pdf')) return mod[key];
    }
    throw new Error('No se encontró la función de parseo en pdf-parse');
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.error(
        '❌ pdf-parse no instalado. Ejecuta:\n' +
        '   npm install --save-dev pdf-parse\n' +
        '   (desde la raíz del proyecto)'
      );
      process.exit(1);
    }
    throw err;
  }
}

// ─── Limpieza de texto ──────────────────────────────────────────────────────

/** Limpia artefactos comunes de extracción PDF */
function cleanText(text) {
  return text
    // Normalizar saltos de línea
    .replace(/\r\n/g, '\n')
    // Eliminar líneas con solo espacios
    .replace(/^\s+$/gm, '')
    // Colapsar 3+ saltos de línea a 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Intenta detectar y formatear tablas simples (filas con | separadores) */
function detectTables(text) {
  // Si el texto ya tiene pipes, probablemente es una tabla — dejar como está
  if (text.includes('|')) return text;
  return text;
}

// ─── Conversión de un archivo ───────────────────────────────────────────────

async function convertPdf(pdfPath, mdPath) {
  const PDFParse = loadPdfParse();
  const buffer = fs.readFileSync(pdfPath);
  const uint8 = new Uint8Array(buffer);

  const parser = new PDFParse(uint8);
  await parser.load();

  const result = await parser.getText();
  // result = { pages: [{text, num}], text: "concatenated", total: N }

  const totalPages = result.total || result.pages?.length || 0;
  const docName = path.basename(pdfPath, '.pdf');

  // Construir markdown con separación por página
  let md = `# ${docName}\n\n`;
  md += `> Convertido automáticamente desde PDF · ${totalPages} página(s) · ${new Date().toISOString().split('T')[0]}\n\n`;

  if (result.pages && result.pages.length > 0) {
    // Texto separado por página
    for (const page of result.pages) {
      const cleaned = cleanText(page.text || '');
      if (!cleaned) continue; // página vacía
      md += `---\n\n## Página ${page.num || result.pages.indexOf(page) + 1}\n\n`;
      md += cleaned + '\n\n';
    }
  } else if (result.text) {
    // Fallback: texto concatenado
    md += cleanText(result.text) + '\n';
  }

  // Metadata al final
  md += `\n---\n\n`;
  md += `*Fuente: ${path.basename(pdfPath)} · ${totalPages} página(s) · Extraído con pdf-parse*\n`;

  // Destruir parser para liberar recursos
  try { parser.destroy(); } catch {}

  fs.writeFileSync(mdPath, md, 'utf-8');

  return {
    chars: md.length,
    pages: totalPages,
    textLength: (result.text || '').length,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const input = path.resolve(process.argv[2] || 'docs/testing/atf-web/requirements');

  // Detectar si es un archivo individual o una carpeta
  const isFile = fs.existsSync(input) && fs.statSync(input).isFile();
  const isDir = fs.existsSync(input) && fs.statSync(input).isDirectory();

  if (!isFile && !isDir) {
    console.error(`❌ Ruta no encontrada: ${input}`);
    process.exit(1);
  }

  let filesToProcess = [];
  let folder = '';

  if (isFile) {
    if (!input.toLowerCase().endsWith('.pdf')) {
      console.error(`❌ El archivo no es .pdf: ${input}`);
      process.exit(1);
    }
    filesToProcess = [path.basename(input)];
    folder = path.dirname(input);
  } else {
    folder = input;
    filesToProcess = fs.readdirSync(folder).filter(f => f.toLowerCase().endsWith('.pdf'));
  }

  if (filesToProcess.length === 0) {
    console.log('✅ Sin archivos .pdf — nada que convertir.');
    return;
  }

  const originalsDir = path.join(folder, 'processed');

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   ATF — Convertir PDF a Markdown                    ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n  Carpeta: ${folder}`);
  console.log(`  Archivos: ${filesToProcess.length}\n`);

  let converted = 0;
  let skipped = 0;

  for (const file of filesToProcess) {
    const pdfPath = path.join(folder, file);
    const mdName = file.replace(/\.pdf$/i, '.md');
    const mdPath = path.join(folder, mdName);

    // Skip si el .md ya existe y es más reciente
    if (fs.existsSync(mdPath)) {
      const pdfStat = fs.statSync(pdfPath);
      const mdStat = fs.statSync(mdPath);
      if (mdStat.mtimeMs > pdfStat.mtimeMs) {
        console.log(`   ⏭️  ${mdName} (ya existe, más reciente que .pdf)`);
        skipped++;
        continue;
      }
    }

    console.log(`   🔄 ${file} → ${mdName}`);

    try {
      const result = await convertPdf(pdfPath, mdPath);
      console.log(`      ✅ ${result.pages} página(s) · ${result.textLength} chars texto · ${result.chars} chars markdown`);

      // Mover .pdf original a subcarpeta
      if (!fs.existsSync(originalsDir)) {
        fs.mkdirSync(originalsDir, { recursive: true });
      }
      const backupPath = path.join(originalsDir, file);
      fs.renameSync(pdfPath, backupPath);
      console.log(`      📦 Original movido a processed/`);

      converted++;
    } catch (err) {
      console.log(`      ❌ Error: ${err.message}`);
    }
  }

  console.log(`\n══════════════════════════════════════════════════════`);
  console.log(`  Resultado: ${converted} convertido(s), ${skipped} omitido(s)`);
  if (converted > 0) {
    console.log(`  ⚠️  Nota: pdf-parse extrae solo texto. Imágenes/diagramas`);
    console.log(`     del PDF no se incluyen en el .md.`);
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
