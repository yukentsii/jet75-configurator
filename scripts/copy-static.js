// Copies renderer HTML/CSS next to the compiled JS.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'src', 'renderer');
const out = path.join(__dirname, '..', 'dist', 'renderer');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(src)) if (!f.endsWith('.ts')) fs.copyFileSync(path.join(src, f), path.join(out, f));
