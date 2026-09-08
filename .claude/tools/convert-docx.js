#!/usr/bin/env node
/**
 * ATF — Convierte archivos .docx a .md.
 * Uso:
 *   node .claude/tools/convert-docx.js [carpeta]
 *   node .claude/tools/convert-docx.js requirements/
 *   node .claude/tools/convert-docx.js ruta/al/archivo.docx
 *
 * Default: requirements/
 *
 * - Acepta archivo individual o carpeta (auto-detect — ).
 * - Convierte cada .docx a .md usando mammoth (texto + estructura).
 * - Imágenes embebidas → {nombre-doc}/images/ e insertadas como ![](...).
 * - El .docx original se mueve a processed/ (mismo nivel del .docx).
 * - Si el .md ya existe y es más reciente que el .docx → skip.
 */

const fs = require('fs');
const path = require('path');

async function loadMammoth() {
  try {
    return require('mammoth');
  } catch {
    console.error(
      '❌ mammoth no instalado. Ejecuta:\n' +
      '   npm install --save-dev mammoth\n' +
      '   (desde la raíz del proyecto)'
    );
    process.exit(1);
  }
}

async function convertDocx(docxPath, mdPath) {
  const mammoth = await loadMammoth();
  const buffer = fs.readFileSync(docxPath);

  // Carpeta de imágenes junto al .md: {nombre-sin-ext}/images/
  const docBaseName = path.basename(mdPath, '.md');
  const imagesDir = path.join(path.dirname(mdPath), docBaseName, 'images');
  let imageCount = 0;

  const options = {
    buffer,
    convertImage: mammoth.images.imgElement(async (image) => {
      const ext = image.contentType.split('/')[1] || 'png';
      imageCount++;
      const imgName = `image-${String(imageCount).padStart(3, '0')}.${ext}`;

      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      const imgData = await image.read();
      fs.writeFileSync(path.join(imagesDir, imgName), imgData);

      // Ruta relativa desde el .md hacia la imagen
      const relPath = `./${docBaseName}/images/${imgName}`;
      return { src: relPath };
    }),
  };

  const result = await mammoth.convertToMarkdown(options);

  if (result.messages.length > 0) {
    console.log(`   ⚠️  Warnings para ${path.basename(docxPath)}:`);
    for (const msg of result.messages) {
      console.log(`      - ${msg.message}`);
    }
  }

  fs.writeFileSync(mdPath, result.value, 'utf-8');
  return { chars: result.value.length, images: imageCount };
}

async function main() {
  const input = path.resolve(process.argv[2] || 'docs/testing/atf-web/requirements');

  // P52 — auto-detect archivo vs carpeta (mismo patrón que convert-pdf.js / convert-pptx.js).
  const isFile = fs.existsSync(input) && fs.statSync(input).isFile();
  const isDir  = fs.existsSync(input) && fs.statSync(input).isDirectory();

  if (!isFile && !isDir) {
    console.error(`❌ Ruta no encontrada: ${input}`);
    process.exit(1);
  }

  let files;
  let folder;
  if (isFile) {
    if (!input.toLowerCase().endsWith('.docx')) {
      console.error(`❌ El archivo no es .docx: ${input}`);
      process.exit(1);
    }
    files  = [path.basename(input)];
    folder = path.dirname(input);
  } else {
    folder = input;
    files  = fs.readdirSync(folder).filter(f => f.toLowerCase().endsWith('.docx'));
  }

  if (files.length === 0) {
    console.log('✅ Sin archivos .docx — nada que convertir.');
    return;
  }

  const originalsDir = path.join(folder, 'processed');

  console.log(`📄 Encontrados ${files.length} archivo(s) .docx en ${folder}\n`);

  let converted = 0;
  let skipped = 0;

  for (const file of files) {
    const docxPath = path.join(folder, file);
    const mdName = file.replace(/\.docx$/i, '.md');
    const mdPath = path.join(folder, mdName);

    // Skip si el .md ya existe y es más reciente
    if (fs.existsSync(mdPath)) {
      const docxStat = fs.statSync(docxPath);
      const mdStat = fs.statSync(mdPath);
      if (mdStat.mtimeMs > docxStat.mtimeMs) {
        console.log(`   ⏭️  ${mdName} (ya existe, más reciente que .docx)`);
        skipped++;
        continue;
      }
    }

    console.log(`   🔄 ${file} → ${mdName}`);
    const { chars, images } = await convertDocx(docxPath, mdPath);
    const imgMsg = images > 0 ? ` | 🖼️  ${images} imagen(es) → ${mdName.replace(/\.md$/, '')}/images/` : '';
    console.log(`      ✅ ${chars} caracteres extraídos${imgMsg}`);

    // Mover .docx original a subcarpeta
    if (!fs.existsSync(originalsDir)) {
      fs.mkdirSync(originalsDir, { recursive: true });
    }
    const backupPath = path.join(originalsDir, file);
    fs.renameSync(docxPath, backupPath);
    console.log(`      📦 Original movido a processed/`);

    converted++;
  }

  console.log(`\n✅ Resultado: ${converted} convertido(s), ${skipped} omitido(s)`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});