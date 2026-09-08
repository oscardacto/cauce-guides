'use strict';

const path = require('path');

// .claude/dashboard/lib → .claude/dashboard → .claude → raíz del proyecto.
// Son 3 niveles desde que el dashboard vive bajo .claude/ (antes estaba en la raíz
// del repo y subía 2). Si este archivo se mueve, ajustar el conteo acá.
const PROJECT_ROOT = path.join(__dirname, '..', '..', '..');
const OUTPUT_BASE  = path.join(PROJECT_ROOT, 'docs', 'testing', 'atf-web');

module.exports = { PROJECT_ROOT, OUTPUT_BASE };
