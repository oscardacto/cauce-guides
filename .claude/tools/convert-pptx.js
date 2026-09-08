#!/usr/bin/env node
/**
 * ATF — Convierte archivos .pptx a .md en la carpeta de requirements.
 * Uso:
 *   node .claude/tools/convert-pptx.js [carpeta]
 *   node .claude/tools/convert-pptx.js requirements/
 *   node .claude/tools/convert-pptx.js ruta/al/archivo.pptx
 *
 * Default: requirements/
 *
 * - Convierte cada .pptx a .md extrayendo texto por slide
 * - Cada slide se separa con "## Slide N — {título}"
 * - Las notas del presentador se incluyen como blockquote debajo de cada slide
 * - El .pptx original se mueve a processed/
 * - Si el .md ya existe y es más reciente que el .pptx → skip
 *
 * Nota: pptx2json extrae texto plano — las imágenes incrustadas no se exportan.
 */

const fs = require('fs');
const path = require('path');

// ─── Dependencia ────────────────────────────────────────────────────────────

function loadParser() {
  try {
    return require('pptx2json');
  } catch {
    console.error(
      '❌ pptx2json no instalado. Ejecuta:\n' +
      '   npm install --save-dev pptx2json\n' +
      '   (desde la raíz del proyecto)'
    );
    process.exit(1);
  }
}

// ─── Extracción de texto desde estructura JSON de pptx2json ─────────────────

/** Recorre recursivamente el objeto buscando nodos a:t (texto de PowerPoint) */
function extractTexts(obj) {
  const results = [];
  if (!obj || typeof obj !== 'object') return results;
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'a:t') {
      if (Array.isArray(v)) {
        v.forEach(t => { if (typeof t === 'string' && t.trim()) results.push(t.trim()); });
      } else if (typeof v === 'string' && v.trim()) {
        results.push(v.trim());
      }
    }
    if (typeof v === 'object') results.push(...extractTexts(v));
  }
  return results;
}

/**
 * Extrae textos agrupados por párrafo (a:p) para preservar la estructura.
 * Cada a:p genera una línea; los a:t dentro del mismo a:p se concatenan.
 */
function extractParagraphs(obj) {
  const paragraphs = [];

  function walk(node) {
    if (!node || typeof node !== 'object') return;

    // Si encontramos un a:p (párrafo), extraer sus textos como una sola línea
    if (node['a:p']) {
      const pNodes = Array.isArray(node['a:p']) ? node['a:p'] : [node['a:p']];
      for (const p of pNodes) {
        const texts = extractTexts(p);
        if (texts.length) paragraphs.push(texts.join(''));
      }
      return; // No descender más dentro de a:p (ya lo procesamos)
    }

    for (const v of Object.values(node)) {
      if (typeof v === 'object') walk(v);
    }
  }

  walk(obj);
  return paragraphs;
}

/** Intenta identificar el título del slide (primer texto o el más prominente) */
function guessTitle(paragraphs) {
  if (!paragraphs.length) return '';
  // El título suele ser el primer párrafo corto
  const first = paragraphs[0];
  if (first.length <= 100) return first;
  return first.substring(0, 80) + '...';
}

// ─── Conversión de un archivo ───────────────────────────────────────────────

async function convertPptx(pptxPath, mdPath) {
  const PPTX2Json = loadParser();
  const parser = new PPTX2Json();
  const buffer = fs.readFileSync(pptxPath);
  const data = await parser.buffer2json(buffer);

  const docName = path.basename(pptxPath, '.pptx');

  // Identificar slides y notas ordenadas por número
  const slideKeys = Object.keys(data)
    .filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

  const noteKeys = Object.keys(data)
    .filter(k => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(k))
    .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

  const totalSlides = slideKeys.length;

  // Construir markdown
  let md = `# ${docName}\n\n`;
  md += `> Convertido automáticamente desde PPTX · ${totalSlides} slide(s) · ${new Date().toISOString().split('T')[0]}\n\n`;

  let totalTextChars = 0;

  for (let i = 0; i < slideKeys.length; i++) {
    const slideData = data[slideKeys[i]];
    const paragraphs = extractParagraphs(slideData);
    const title = guessTitle(paragraphs);

    // Notas del presentador (si existen)
    const noteData = noteKeys[i] ? data[noteKeys[i]] : null;
    const noteParagraphs = noteData ? extractParagraphs(noteData) : [];
    // Filtrar notas que son solo el número de slide o vacías
    const meaningfulNotes = noteParagraphs.filter(n =>
      n.trim() && !/^\d+$/.test(n.trim()) && n.trim().length > 2
    );

    md += `---\n\n`;
    md += `## Slide ${i + 1}${title ? ` — ${title}` : ''}\n\n`;

    // Contenido del slide (saltar el título si ya lo usamos en el heading)
    const bodyParagraphs = paragraphs.length > 0 && paragraphs[0] === title
      ? paragraphs.slice(1)
      : paragraphs;

    if (bodyParagraphs.length) {
      for (const p of bodyParagraphs) {
        md += `${p}\n\n`;
        totalTextChars += p.length;
      }
    } else if (!title) {
      md += `*(slide sin texto)*\n\n`;
    }

    // Notas del presentador como blockquote
    if (meaningfulNotes.length) {
      md += `**Notas del presentador:**\n`;
      for (const n of meaningfulNotes) {
        md += `> ${n}\n`;
        totalTextChars += n.length;
      }
      md += '\n';
    }

    totalTextChars += title.length;
  }

  // Metadata al final
  md += `\n---\n\n`;
  md += `*Fuente: ${path.basename(pptxPath)} · ${totalSlides} slides · Extraído con pptx2json*\n`;

  fs.writeFileSync(mdPath, md, 'utf-8');

  return {
    chars: md.length,
    slides: totalSlides,
    textLength: totalTextChars,
    notes: noteKeys.length,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const input = path.resolve(process.argv[2] || 'docs/testing/atf-web/requirements');
  const isFile = fs.existsSync(input) && fs.statSync(input).isFile();
  const isDir = fs.existsSync(input) && fs.statSync(input).isDirectory();

  if (!isFile && !isDir) {
    console.error(`❌ Ruta no encontrada: ${input}`);
    process.exit(1);
  }

  let filesToProcess = [];
  let folder = '';

  if (isFile) {
    if (!input.toLowerCase().endsWith('.pptx')) {
      console.error(`❌ El archivo no es .pptx: ${input}`);
      process.exit(1);
    }
    filesToProcess = [path.basename(input)];
    folder = path.dirname(input);
  } else {
    folder = input;
    filesToProcess = fs.readdirSync(folder).filter(f => f.toLowerCase().endsWith('.pptx'));
  }

  if (filesToProcess.length === 0) {
    console.log('✅ Sin archivos .pptx — nada que convertir.');
    return;
  }

  const originalsDir = path.join(folder, 'processed');

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   ATF — Convertir PPTX a Markdown                   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n  Carpeta: ${folder}`);
  console.log(`  Archivos: ${filesToProcess.length}\n`);

  let converted = 0;
  let skipped = 0;

  for (const file of filesToProcess) {
    const pptxPath = path.join(folder, file);
    const mdName = file.replace(/\.pptx$/i, '.md');
    const mdPath = path.join(folder, mdName);

    // Skip si el .md ya existe y es más reciente
    if (fs.existsSync(mdPath)) {
      const pptxStat = fs.statSync(pptxPath);
      const mdStat = fs.statSync(mdPath);
      if (mdStat.mtimeMs > pptxStat.mtimeMs) {
        console.log(`   ⏭️  ${mdName} (ya existe, más reciente que .pptx)`);
        skipped++;
        continue;
      }
    }

    console.log(`   🔄 ${file} → ${mdName}`);

    try {
      const result = await convertPptx(pptxPath, mdPath);
      console.log(`      ✅ ${result.slides} slide(s) · ${result.notes} con notas · ${result.textLength} chars texto · ${result.chars} chars markdown`);

      // Mover .pptx original a processed/
      if (!fs.existsSync(originalsDir)) {
        fs.mkdirSync(originalsDir, { recursive: true });
      }
      const backupPath = path.join(originalsDir, file);
      fs.renameSync(pptxPath, backupPath);
      console.log(`      📦 Original movido a processed/`);

      converted++;
    } catch (err) {
      console.log(`      ❌ Error: ${err.message}`);
    }
  }

  console.log(`\n══════════════════════════════════════════════════════`);
  console.log(`  Resultado: ${converted} convertido(s), ${skipped} omitido(s)`);
  if (converted > 0) {
    console.log(`  ⚠️  Nota: pptx2json extrae solo texto. Imágenes/diagramas`);
    console.log(`     del PPTX no se incluyen en el .md.`);
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
