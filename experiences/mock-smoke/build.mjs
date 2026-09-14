import fs from 'node:fs';
import { createHash } from 'node:crypto';
fs.mkdirSync('dist/local', { recursive: true });
fs.mkdirSync('dist/mock-pxc', { recursive: true });
for (const file of ['index.html','app.mjs','style.css']) fs.copyFileSync(file, `dist/${file}`);
fs.copyFileSync('../../local/mock-mounts.mjs', 'dist/local/mock-mounts.mjs');
const source = fs.readFileSync('../../mock-pxc/mock-pxc.mjs');
fs.writeFileSync('dist/mock-pxc/mock-pxc.mjs', source);
fs.writeFileSync('dist/seed-identity.mjs', `export default ${JSON.stringify(createHash('sha256').update(source).digest('hex'))};\n`);
