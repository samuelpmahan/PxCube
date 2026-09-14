// scripts/build-launcher.mjs
//
// Reads experiences/*/experience.json and the per-Experience build outputs
// in staging/exp-*, then writes dist/:
//   dist/index.html               the launcher: Clean / Exp tabs + manifest accordion
//   dist/experiences/<id>/...     each THING that built green
//
// The manifest is the extension point. Known fields render as rows; every
// other key lands in the accordion's "everything else" block as JSON, so
// wiring in whatever you need never requires touching this generator.

import {
  readdirSync, readFileSync, mkdirSync,
  writeFileSync, existsSync, renameSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';

const EXP = 'experiences';
const STAGING = 'staging';
const DIST = 'dist';

// A THING must never navigate the shelf page itself. The launcher strips
// these tokens even if a manifest declares them; the back button is the
// only way home.
const FORBIDDEN_TOKENS = new Set([
  'allow-top-navigation',
  'allow-top-navigation-by-user-activation',
]);

const KNOWN_FIELDS = new Set([
  'title', 'description', 'version', 'track', 'entry', 'build', 'outDir', 'sandbox',
]);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));

const manifests = [];
for (const ent of readdirSync(EXP, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue;
  const mf = join(EXP, ent.name, 'experience.json');
  if (!existsSync(mf)) continue;
  manifests.push({ id: ent.name, ...JSON.parse(readFileSync(mf, 'utf8')) });
}

// Anything that is not explicitly clean is exp. The clean tab stays honest:
// only deliberately promoted THINGs appear there.
const trackOf = (m) => (m.track === 'clean' ? 'clean' : 'exp');

const sandboxFor = (m) =>
  (m.sandbox && m.sandbox.length ? m.sandbox : ['allow-scripts'])
    .filter((t) => !FORBIDDEN_TOKENS.has(t))
    .join(' ');

const extrasOf = (m) => {
  const o = {};
  for (const [k, v] of Object.entries(m)) {
    if (k !== 'id' && !KNOWN_FIELDS.has(k)) o[k] = v;
  }
  return o;
};

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, 'experiences'), { recursive: true });

const shipped = [];
const failed = [];
for (const m of manifests) {
  const staged = join(STAGING, `exp-${m.id}`);
  if (existsSync(staged)) {
    renameSync(staged, join(DIST, 'experiences', m.id));
    shipped.push(m);
  } else {
    failed.push(m);
  }
}

const card = (m) => `
      <button class="card" data-id="${esc(m.id)}" data-sandbox="${esc(sandboxFor(m))}">
        <strong>${esc(m.title || m.id)}</strong>
        <span>${esc(m.description || '')}</span>
        <em>${esc(m.version || '')}</em>
      </button>`;

const failedCard = (m) => `
      <div class="card failed">
        <strong>${esc(m.title || m.id)}</strong>
        <span>build failed, not shipped this run</span>
      </div>`;

const shelfFor = (track) => {
  const items = shipped.filter((m) => trackOf(m) === track);
  const fails = failed.filter((m) => trackOf(m) === track);
  const empty = items.length === 0 && fails.length === 0
    ? `<p class="empty">${track === 'clean' ? 'Nothing promoted to clean yet.' : 'No experiments yet.'}</p>`
    : '';
  return items.map(card).join('') + fails.map(failedCard).join('') + empty;
};

const manifestAccordion = (m) => {
  const rows = [
    ['title', m.title], ['description', m.description], ['version', m.version],
    ['track', trackOf(m)], ['entry', m.entry], ['build', m.build],
    ['outDir', m.outDir], ['sandbox', sandboxFor(m)],
  ].map(([k, v]) => `<div class="row"><dt>${esc(k)}</dt><dd>${esc(v ?? '')}</dd></div>`).join('');
  const ex = extrasOf(m);
  const extraBlock = Object.keys(ex).length
    ? `<h4>everything else, wired in as needed</h4><pre>${esc(JSON.stringify(ex, null, 2))}</pre>`
    : '';
  return `
    <details class="manifest">
      <summary><code>${esc(m.id)}</code> ${esc(m.title || '')} <span class="badge ${trackOf(m)}">${esc(trackOf(m))}</span></summary>
      <div class="panel"><dl>${rows}</dl>${extraBlock}</div>
    </details>`;
};

const state = existsSync('ntc-state.json') ? JSON.parse(readFileSync('ntc-state.json', 'utf8')) : { schemaVersion: 1, work: [], types: {}, results: [] };
const payload = JSON.stringify({ ...state, manifests, packagedIds: shipped.map(m => m.id) }).replaceAll('<', '\\u003c');
const html = readFileSync(new URL('./shell.html', import.meta.url), 'utf8')
  .replace('<!-- CLEAN -->', shelfFor('clean'))
  .replace('<!-- EXP -->', shelfFor('exp'))
  .replace('<!-- MANIFESTS -->', manifests.map(manifestAccordion).join(''))
  .replace('<!-- STATE -->', payload);
writeFileSync(join(DIST, 'index.html'), html);
for (const file of ['shell.css', 'shell.mjs']) writeFileSync(join(DIST, file), readFileSync(new URL('./' + file, import.meta.url)));
console.log(`launcher: ${shipped.length} shipped, ${failed.length} failed`);
