// launcher/build-launcher.mjs
//
// Reads experiences/*/experience.json and the per-Experience crisp outputs
// in staging/exp-*, then writes dist/:
//   dist/index.html               the launcher: Clean / Exp tabs + manifest accordion
//   dist/experiences/<id>/...     each THING that built green, with its crisp
//                                 receipt.json riding alongside
//
// Each THING is built by crisp, not by this script: the Actions workflow runs
// `crisp package` (validates mounts, builds, content-addresses the output
// chunks into a wiring-manifest receipt) and `crisp verify` (re-hashes the
// chunks against the receipt) per experience. This script only wires the
// resulting artifacts together: it copies the staged chunks into place and
// renders the receipt's wiring info in the manifest accordion, so what Sam
// reviews is exactly the bytes the receipt names.
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
  'title', 'description', 'version', 'track', 'entry', 'build', 'outDir',
  'sandbox', 'mounts', 'source',
]);

const esc = (s) =>
  String(s ?? '').replace(/[&<>\"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c]
  ));

const shortHash = (hex) => (hex ? `${hex.slice(0, 12)}` : '');

const manifests = [];
for (const ent of readdirSync(EXP, { withFileTypes: true })) {
  if (!ent.isDirectory()) continue;
  const mf = join(EXP, ent.name, 'experience.json');
  if (!existsSync(mf)) continue;
  manifests.push({ id: ent.name, ...JSON.parse(readFileSync(mf, 'utf8')) });
}

// The crisp receipt staged next to each THING's chunks, when the build job
// packaged it. Absent for failed builds.
const receipts = new Map();
for (const m of manifests) {
  const rp = join(STAGING, `exp-${m.id}`, 'receipt.json');
  if (existsSync(rp)) {
    try {
      receipts.set(m.id, JSON.parse(readFileSync(rp, 'utf8')));
    } catch {
      // a corrupt receipt is a failed build; the THING still ships by path
    }
  }
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

const receiptBlock = (m) => {
  const r = receipts.get(m.id);
  if (!r) return '';
  const chunkRows = (r.chunks || [])
    .map((c) => `<div class="row"><dt>${esc(c.path)}</dt><dd><code>${esc(shortHash(c.sha256))}</code></dd></div>`)
    .join('');
  return `
      <h4>wiring manifest, crisp receipt</h4>
      <div class="row"><dt>entry chunk</dt><dd><code>${esc(shortHash(r.entryChunk))}</code></dd></div>
      <div class="row"><dt>chunks</dt><dd>${(r.chunks || []).length}</dd></div>
      <div class="row"><dt>packaged at</dt><dd>${esc(r.packagedAt || '')}</dd></div>
      ${chunkRows}`;
};

const manifestAccordion = (m) => {
  const rows = [
    ['title', m.title], ['description', m.description], ['version', m.version],
    ['track', trackOf(m)], ['entry', m.entry], ['build', m.build],
    ['outDir', m.outDir], ['sandbox', sandboxFor(m)],
    ['mounts', (m.mounts || []).join(', ')], ['source', m.source],
  ].map(([k, v]) => `<div class="row"><dt>${esc(k)}</dt><dd>${esc(v ?? '')}</dd></div>`).join('');
  const ex = extrasOf(m);
  const extraBlock = Object.keys(ex).length
    ? `<h4>everything else, wired in as needed</h4><pre>${esc(JSON.stringify(ex, null, 2))}</pre>`
    : '';
  return `
    <details class="manifest">
      <summary><code>${esc(m.id)}</code> ${esc(m.title || '')} <span class="badge ${trackOf(m)}">${esc(trackOf(m))}</span></summary>
      <div class="panel"><dl>${rows}</dl>${receiptBlock(m)}${extraBlock}</div>
    </details>`;
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Experiences</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #101014; color: #eee; }
  header { padding: 24px 24px 0; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  header p { margin: 0 0 16px; color: #999; font-size: 14px; }
  #tabs { display: flex; gap: 8px; padding: 0 24px; border-bottom: 1px solid #2c2c34; }
  #tabs button { background: none; border: none; border-bottom: 2px solid transparent; color: #999; padding: 10px 4px; margin-bottom: -1px; cursor: pointer; font: inherit; font-size: 14px; }
  #tabs button.active { color: #eee; border-bottom-color: #eee; }
  .tab { padding: 20px 24px 24px; }
  .tab[hidden] { display: none; }
  .shelf { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  .card { text-align: left; background: #1a1a20; border: 1px solid #2c2c34; border-radius: 12px; padding: 16px; color: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 8px; font: inherit; }
  .card:hover { border-color: #55555f; }
  .card strong { font-size: 16px; }
  .card span { color: #999; font-size: 13px; }
  .card em { color: #666; font-size: 12px; font-style: normal; }
  .card.failed { opacity: 0.55; cursor: default; border-style: dashed; }
  .empty { color: #666; font-size: 14px; }
  details.manifest { background: #1a1a20; border: 1px solid #2c2c34; border-radius: 12px; margin-bottom: 12px; }
  details.manifest summary { cursor: pointer; padding: 14px 16px; list-style: none; display: flex; gap: 10px; align-items: center; }
  details.manifest summary::-webkit-details-marker { display: none; }
  details.manifest summary::before { content: '▸'; color: #666; }
  details.manifest[open] summary::before { content: '▾'; }
  details.manifest code { font-size: 13px; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid #2c2c34; color: #999; }
  .badge.clean { color: #9ece9e; border-color: #3a5a3a; }
  .panel { padding: 0 16px 16px; }
  .panel dl { margin: 0; }
  .row { display: grid; grid-template-columns: 110px 1fr; gap: 8px; padding: 6px 0; border-top: 1px solid #26262c; font-size: 13px; }
  .row dt { color: #888; }
  .row dd { margin: 0; word-break: break-word; }
  .panel h4 { color: #888; font-size: 12px; margin: 16px 0 8px; font-weight: 600; }
  .panel pre { background: #101014; border: 1px solid #2c2c34; border-radius: 8px; padding: 12px; overflow: auto; font-size: 12px; }
  #viewer { position: fixed; inset: 0; display: flex; flex-direction: column; background: #101014; z-index: 10; }
  #viewer[hidden] { display: none; }
  #bar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #2c2c34; }
  #bar button { background: #1a1a20; color: inherit; border: 1px solid #2c2c34; border-radius: 8px; padding: 8px 12px; cursor: pointer; font: inherit; }
  #thing { flex: 1; border: 0; width: 100%; background: #fff; }
</style>
</head>
<body>
<header>
  <h1>Experiences</h1>
  <p>Clean is the trunk. Exp is the jungle. Each THING runs sandboxed in its own frame.</p>
</header>
<nav id="tabs">
  <button data-tab="clean" class="active">Clean</button>
  <button data-tab="exp">Exp</button>
  <button data-tab="manifests">Manifests</button>
</nav>
<section id="tab-clean" class="tab"><div class="shelf">
${shelfFor('clean')}
</div></section>
<section id="tab-exp" class="tab" hidden><div class="shelf">
${shelfFor('exp')}
</div></section>
<section id="tab-manifests" class="tab" hidden>
${manifests.map(manifestAccordion).join('')}
</section>
<section id="viewer" hidden>
  <div id="bar">
    <button id="back">&larr; back</button>
    <strong id="thing-title"></strong>
  </div>
  <iframe id="thing" title="experience"></iframe>
</section>
<script>
  const tabs = document.querySelectorAll('#tabs button');
  tabs.forEach((b) => b.addEventListener('click', () => {
    tabs.forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.id !== 'tab-' + b.dataset.tab; });
  }));
  document.addEventListener('click', (e) => {
    const el = e.target.closest('.card');
    if (!el || !el.dataset.id) return;
    const frame = document.getElementById('thing');
    frame.setAttribute('sandbox', el.dataset.sandbox);
    frame.src = './experiences/' + el.dataset.id + '/index.html';
    document.getElementById('thing-title').textContent = el.querySelector('strong').textContent;
    document.getElementById('viewer').hidden = false;
  });
  document.getElementById('back').addEventListener('click', () => {
    const frame = document.getElementById('thing');
    frame.removeAttribute('src');
    document.getElementById('viewer').hidden = true;
  });
</script>
</body>
</html>
`;

writeFileSync(join(DIST, 'index.html'), html);
console.log(`launcher: ${shipped.length} shipped, ${failed.length} failed`);
