import { createPxC, registerPart, readPart, MissingPartError } from './pxc.js';
const $ = id => document.getElementById(id);
const state = JSON.parse($('ntc-state').textContent);
const manifests = new Map(state.manifests.map(m => [m.id, m]));
const results = new Map(state.results.map(r => [r.id, r]));
const packaged = new Set(state.packagedIds);
const retainedFrames = new Map();
let activeId = null, view = 'experiences';
const make = (tag, text, className) => {
  const el = document.createElement(tag); el.textContent = text ?? '';
  if (className) el.className = className;
  return el;
};
const short = value => value ? value.slice(0, 8) : 'not recorded';
const pretty = value => JSON.stringify(value, (_, v) => typeof v === 'function' ? '[Calculation function — inspect in owning DevTools]' : v, 2);
function button(text, action) { const el = make('button', text); el.onclick = action; return el; }
function inspect(kind, title, value, note = '') {
  $('inspector-kind').textContent = kind; $('inspector-title').textContent = title;
  $('inspector-value').textContent = pretty(value); $('inspector-note').textContent = note;
  if (!$('inspector').open) $('inspector').showModal();
}
function inspectManifest(id) {
  const manifest = manifests.get(id);
  inspect('tidy / manifest', manifest.title, { manifest, tidyType: Object.entries(state.types).find(([, value]) => value.root === `experiences/${id}`) ?? null }, 'Definition and registration captured with this artifact.');
}
function inspectBuild(id) {
  inspect('crisp / build', manifests.get(id).title, results.get(id) ?? manifests.get(id).attempt ?? { status: 'No build evidence supplied' }, `Artifact ${state.runId ?? 'not recorded'} · timings are packaging times, not runtime performance.`);
}
function inspectWork(item) { inspect('neat / work', item.id, item, 'The actual work item retained with this build.'); }

function showView(next) {
  view = next;
  for (const id of ['experience-panel', 'work-panel', 'builds-panel', 'mounts-panel', 'console-panel', 'viewer']) $(id).hidden = true;
  document.querySelectorAll('.nav-button').forEach(el => el.classList.toggle('selected', el.dataset.view === next));
  if (next === 'experiences' || next === 'manifests') {
    $('experience-panel').hidden = false;
    if (next === 'manifests') selectTab('manifests');
  } else if (next === 'experience') $('viewer').hidden = false;
  else $(`${next}-panel`).hidden = false;
  updateFrameLabels();
  refreshMounts();
}
function updateFrameLabels() {
  for (const el of document.querySelectorAll('.experience-link')) {
    if (retainedFrames.has(el.dataset.open)) el.querySelector('small').textContent = view === 'experience' && activeId === el.dataset.open ? 'Opened · in view' : 'Opened · retained';
  }
}
function selectTab(key) {
  document.querySelectorAll('#tabs button').forEach(el => el.classList.toggle('active', el.dataset.tab === key));
  document.querySelectorAll('.tab').forEach(el => { el.hidden = el.id !== `tab-${key}`; });
}
function openExperience(id) {
  const manifest = manifests.get(id);
  if (!manifest || !packaged.has(id)) return;
  for (const frame of retainedFrames.values()) { frame.hidden = true; frame.removeAttribute('id'); }
  let frame = retainedFrames.get(id);
  if (!frame) {
    frame = document.createElement('iframe'); frame.className = 'thing'; frame.title = manifest.title;
    frame.setAttribute('sandbox', (manifest.sandbox?.length ? manifest.sandbox : ['allow-scripts']).filter(t => !['allow-top-navigation', 'allow-top-navigation-by-user-activation'].includes(t)).join(' '));
    frame.src = `./experiences/${id}/index.html`;
    frame.addEventListener('load', refreshMounts);
    retainedFrames.set(id, frame); $('viewer').append(frame);
  }
  activeId = id; frame.id = 'thing'; frame.hidden = false;
  $('thing-title').textContent = manifest.title;
  $('frame-count').textContent = `${retainedFrames.size} opened frame${retainedFrames.size === 1 ? '' : 's'}`;
  document.querySelectorAll('.experience-link').forEach(el => el.classList.toggle('current', el.dataset.open === id));
  showView('experience');
}

// Read the owner APIs already exposed by the sandbox implementations. No new
// mirror of their domain stores, and no inference that packaged means running.
function ownerFor(id) {
  const win = retainedFrames.get(id)?.contentWindow;
  if (win?.pxCubeExperience) return { list: () => win.pxCubeExperience.list(), current: () => win.pxCubeExperience.current(), inspect: () => win.pxCubeExperience.inspect() };
  if (win?.pxCubeScaffold) return { list: () => Object.values(win.pxCubeScaffold.inspect().runs), current: () => win.pxCubeScaffold.current(), inspect: () => win.pxCubeScaffold.current() };
  if (win?.pxCubeMocks) return { list: () => win.pxCubeMocks.list(), current: () => null, inspect: () => win.pxCubeMocks.inspect() };
  return null;
}
function inspectOwner(id = activeId) {
  try {
    const owner = ownerFor(id);
    inspect('runtime / owner', manifests.get(id).title, owner ? owner.inspect() : { status: 'This frame does not expose a mount inspector.' }, 'Read now from this Experience’s owning context. The parent has not copied its store.');
  } catch (error) { inspect('runtime / unavailable', manifests.get(id)?.title ?? id, { error: error.message }); }
}
function refreshMounts() {
  const mounts = [];
  for (const [id] of retainedFrames) {
    try {
      const owner = ownerFor(id);
      if (!owner) { mounts.push({ id, unavailable: 'Inspector not exposed or still loading' }); continue; }
      const current = owner.current();
      const entries = owner.list();
      if (!entries.length) mounts.push({ id, unavailable: 'No mounts reported' });
      for (const entry of entries) mounts.push({ id, name: entry.name, kind: entry.kind, current: current?.name === entry.name, active: view === 'experience' && id === activeId });
    } catch { mounts.push({ id, unavailable: 'Mount inspection unavailable' }); }
  }
  $('mount-count').textContent = mounts.filter(m => m.name).length;
  if (view !== 'mounts') return;
  $('mount-rows').replaceChildren();
  if (!mounts.length) { const row = make('tr'); const cell = make('td', 'No Experience frames opened. Open one from the left to see its mounts.'); cell.colSpan = 5; row.append(cell); $('mount-rows').append(row); }
  for (const mount of mounts) {
    const row = make('tr'); row.dataset.owner = mount.id;
    const owner = make('td'); owner.append(button(manifests.get(mount.id).title, () => openExperience(mount.id)));
    const address = make('td'); address.append(make('code', mount.name ?? mount.unavailable));
    const actions = make('td'); actions.append(button('Owner', () => inspectOwner(mount.id)));
    row.append(owner, address, make('td', mount.kind ?? 'unknown'), make('td', mount.name ? (mount.current && mount.active ? 'In view' : 'Retained') : 'Opened frame'), actions);
    $('mount-rows').append(row);
  }
}

// PxConsole: discover / read / trace over retained and live worlds.
// Retained worlds are read straight from this browser's storage (the
// mock-mounts owner shape); live worlds are read from opened frames through
// their own inspectors. Reads go through a real PxC instance: each world is
// hydrated into parts and every open uses readPart (telemetry recorded,
// unknown addresses raise MissingPartError). The console never writes and
// never executes.
const describeIdentities = new WeakMap();
let describeNextId = 1;
function describeIdentity(value) {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return null;
  if (!describeIdentities.has(value)) describeIdentities.set(value, describeNextId++);
  return `object#${describeIdentities.get(value)}`;
}
// The devtools read boundary: own property descriptors with identity
// labels. Accessors and toJSON are never invoked; circular-safe.
function safeDescribe(value, depth = 3, seen = new Set()) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return { kind: 'primitive', type: typeof value, value };
  }
  if (seen.has(value)) return { kind: 'circular', identity: describeIdentity(value) };
  if (depth <= 0) return { kind: typeof value, identity: describeIdentity(value), note: 'depth limit' };
  seen.add(value);
  const own = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const name = typeof key === 'symbol' ? key.toString() : String(key);
    if ('get' in descriptor || 'set' in descriptor) {
      own[name] = { kind: 'accessor', enumerable: !!descriptor.enumerable, getter: !!descriptor.get, setter: !!descriptor.set, note: 'never invoked' };
    } else {
      own[name] = { kind: 'data', enumerable: !!descriptor.enumerable, writable: !!descriptor.writable, value: safeDescribe(descriptor.value, depth - 1, seen) };
    }
  }
  const proto = Object.getPrototypeOf(value);
  return { kind: typeof value, identity: describeIdentity(value), class: value.constructor?.name ?? null, prototype: proto?.constructor?.name ? `${proto.constructor.name}.prototype` : null, own };
}
function flattenParts(value, prefix, out) {
  out.push([prefix, value]);
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value) ? value.map((entry, index) => [String(index), entry]) : Object.entries(value);
    for (const [key, child] of entries) flattenParts(child, `${prefix}.${key}`, out);
  }
  return out;
}
function hydrateWorld(entry) {
  let pxc = createPxC();
  for (const [address, value] of flattenParts(entry.run.value ?? {}, entry.world, [])) {
    pxc = registerPart(pxc, address, value);
  }
  return pxc;
}
function experienceForKey(key) {
  const suffix = key.split(':').slice(1).join(':');
  if (manifests.has(suffix)) return suffix;
  if (key.startsWith('pxcube.mock-smoke.')) return 'mock-smoke';
  return suffix || 'unknown';
}
function discoverWorlds() {
  const worlds = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('pxcube.')) continue;
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(key)); } catch { continue; }
    if (!parsed || parsed.schemaVersion !== 1 || !parsed.runs || Array.isArray(parsed.runs)) continue;
    const experienceId = experienceForKey(key);
    for (const run of Object.values(parsed.runs)) {
      worlds.push({ world: run.name, experienceId, kind: run.kind ?? 'unknown', writes: run.changes?.length ?? 0, revision: parsed.revision, source: 'Retained', run });
    }
  }
  for (const [id] of retainedFrames) {
    try {
      const owner = ownerFor(id);
      const inspected = owner?.inspect();
      for (const run of Object.values(inspected?.runs ?? {})) {
        worlds.push({ world: run.name, experienceId: id, kind: run.kind ?? 'unknown', writes: run.changes?.length ?? 0, revision: inspected.revision, source: 'Live', run });
      }
    } catch { /* frame unreadable; the retained copy still lists */ }
  }
  return worlds;
}
let consoleSelected = null;
async function selectWorld(entry) {
  consoleSelected = entry;
  $('console-detail').hidden = false;
  $('console-detail-eyebrow').textContent = `World · ${entry.source}`;
  $('console-detail-title').textContent = `${entry.experienceId} · ${entry.world}`;
  // Direct inspection: the retained value is hydrated into a real PxC
  // instance and every open goes through readPart. Reads are recorded in
  // the board's telemetry; unknown addresses raise MissingPartError.
  let pxc = hydrateWorld(entry);
  const addresses = $('console-addresses'); addresses.replaceChildren();
  for (const address of [...pxc.parts.keys()].sort()) {
    const value = pxc.parts.get(address);
    const row = make('tr');
    const name = make('td'); name.append(make('code', address));
    const actions = make('td');
    actions.append(button('Read', () => {
      try {
        const result = readPart(pxc, address);
        pxc = result.pxc;
        inspect('pxc / read', address, { value: safeDescribe(result.value), read: pxc.telemetry.reads.at(-1) }, `Read through PxC. ${pxc.telemetry.reads.length} console reads recorded this session. The console has not written to this world.`);
      } catch (error) {
        if (error instanceof MissingPartError) {
          inspect('pxc / missing', address, { address, found: false }, 'PxC raised MissingPartError: the address is not a registered part.');
        } else inspect('pxc / error', address, { error: error.message });
      }
    }));
    row.append(name, make('td', value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value), actions);
    addresses.append(row);
  }
  const writes = $('console-writes'); writes.replaceChildren();
  const changes = entry.run.changes ?? [];
  if (!changes.length) { const row = make('tr'); const cell = make('td', 'No recorded writes.'); cell.colSpan = 4; row.append(cell); writes.append(row); }
  for (const change of changes) {
    const row = make('tr');
    row.append(make('td', String(change.step)), make('td', change.address), make('td', JSON.stringify(change.before)), make('td', JSON.stringify(change.after)));
    writes.append(row);
  }
  $('console-trace').textContent = 'Reading composition…';
  const trace = { world: entry.world, experience: entry.experienceId, kind: entry.kind, source: entry.source, mount: `${entry.world}.px.*` };
  try {
    const response = await fetch(`./experiences/${entry.experienceId}/pxcube-receipt.json`);
    if (response.ok) {
      const receipt = await response.json();
      trace.composition = receipt.composition ?? 'No composition recorded (not a cartridge overlay).';
    } else trace.composition = 'No receipt published for this experience.';
  } catch { trace.composition = 'Receipt unavailable.'; }
  $('console-trace').textContent = JSON.stringify(trace, null, 2);
  return full;
}
function refreshConsole() {
  if (view !== 'console') return;
  const query = $('console-filter').value.trim().toLowerCase();
  const deduped = new Map();
  for (const entry of discoverWorlds()) {
    const key = `${entry.experienceId}::${entry.world}`;
    if (!deduped.has(key) || entry.source === 'Live') deduped.set(key, entry);
  }
  const rows = [...deduped.values()]
    .filter(entry => !query || `${entry.world} ${entry.experienceId} ${entry.kind}`.toLowerCase().includes(query))
    .sort((a, b) => a.experienceId.localeCompare(b.experienceId) || a.world.localeCompare(b.world));
  $('console-status').textContent = `${rows.length} world${rows.length === 1 ? '' : 's'}`;
  const tbody = $('console-rows'); tbody.replaceChildren();
  if (!rows.length) { const row = make('tr'); const cell = make('td', 'No worlds discovered. Open an Experience and do something in it, then refresh.'); cell.colSpan = 7; row.append(cell); tbody.append(row); }
  for (const entry of rows) {
    const row = make('tr');
    const name = make('td'); name.append(make('code', entry.world));
    const experience = make('td', manifests.get(entry.experienceId)?.title ?? entry.experienceId);
    const actions = make('td');
    actions.append(button('Read', () => selectWorld(entry)));
    actions.append(button('Value', () => inspect('runtime / world', `${entry.experienceId} · ${entry.world}`, safeDescribe(entry.run), 'Descriptor walk: accessors and toJSON are never invoked. The console has not written to this world.')));
    row.append(name, experience, make('td', entry.kind), make('td', String(entry.writes)), make('td', String(entry.revision ?? '—')), make('td', entry.source), actions);
    tbody.append(row);
  }
  if (consoleSelected) {
    const stillThere = rows.find(entry => entry.experienceId === consoleSelected.experienceId && entry.world === consoleSelected.world);
    if (stillThere) selectWorld(stillThere); else { consoleSelected = null; $('console-detail').hidden = true; }
  }
}
$('refresh-console').onclick = refreshConsole;
$('console-filter').oninput = refreshConsole;
$('artifact-id').textContent = state.runId?.split('T')[1]?.replace(/Z-.*/, 'Z') ?? 'not recorded';
$('artifact-id').title = state.runId ?? '';
$('source-id').textContent = short(state.sourceCommit);
$('experience-count').textContent = manifests.size;
$('work-summary').textContent = `${state.work.length} work items · ${state.work.filter(item => item.status === 'review').length} in review`;
$('manifest-summary').textContent = `${manifests.size} Experience manifests`;
const passed = state.results.filter(result => result.ok).length, failed = state.results.filter(result => !result.ok).length;
$('build-summary').textContent = state.results.length ? `${passed} packaged · ${failed} failed` : 'Build evidence not supplied';
$('build-summary').className = failed ? 'bad' : '';
$('artifact-status').textContent = state.results.length ? `${passed} packaged` : `${manifests.size} declared`;

for (const [id, manifest] of manifests) {
  const el = button('', () => openExperience(id)); el.className = 'experience-link'; el.dataset.open = id;
  el.append(make('span', manifest.title), make('small', packaged.has(id) ? 'Packaged · not opened' : 'Build failed'));
  el.disabled = !packaged.has(id); $('experience-nav').append(el);
}
for (const item of state.work) {
  const row = make('tr'); row.dataset.work = item.id;
  const name = make('td'); name.append(make('code', item.id), make('small', item.location?.component));
  const actions = make('td'); actions.append(button('Work item', () => inspectWork(item)));
  const id = item.location?.component?.split('/').at(-1);
  if (manifests.has(id)) actions.append(button('Manifest', () => inspectManifest(id)));
  row.append(name, make('td', item.status), make('td', item.outcome), actions); $('work-rows').append(row);
}
if (!state.work.length) { const row = make('tr'), cell = make('td', 'No neat work snapshot supplied with this artifact.'); cell.colSpan = 4; row.append(cell); $('work-rows').append(row); }
for (const [id, manifest] of manifests) {
  const result = results.get(id); const row = make('tr'); row.dataset.build = id;
  const name = make('td', manifest.title); name.append(make('small', manifest.build));
  const outcome = make('td', result ? (result.ok ? 'Packaged' : 'Failed') : 'No evidence', result ? (result.ok ? 'good' : 'bad') : '');
  const actions = make('td'); actions.append(button('Build', () => inspectBuild(id)), button('Manifest', () => inspectManifest(id)));
  row.append(name, outcome, make('td', result?.build ? `${result.build.durationMs} ms` : '—'), make('td', result?.outputHashes ? Object.keys(result.outputHashes).length : '—'), actions); $('build-rows').append(row);
}
document.querySelectorAll('[data-view]').forEach(el => el.onclick = () => { if (el.dataset.view === 'experiences') selectTab('exp'); showView(el.dataset.view); });
document.querySelectorAll('#tabs button').forEach(el => el.onclick = () => selectTab(el.dataset.tab));
document.querySelectorAll('button.card[data-id]').forEach(el => el.onclick = () => openExperience(el.dataset.id));
$('back').onclick = () => { selectTab('exp'); showView('experiences'); };
$('inspect-owner').onclick = () => inspectOwner();
$('inspect-manifest').onclick = () => inspectManifest(activeId);
$('inspect-build').onclick = () => inspectBuild(activeId);
$('close-inspector').onclick = () => $('inspector').close();
$('refresh-mounts').onclick = refreshMounts;
const initialRun = state.runId ?? state.manifests.find(m => m.attempt?.runId)?.attempt.runId;
async function checkBuild() {
  try {
    const response = await fetch('./pxcube-run.json', { cache: 'no-store' });
    if (!response.ok) return;
    const run = await response.json();
    $('refresh-build').hidden = !initialRun || run.runId === initialRun;
    // The loaded artifact remains the authority until an explicit reload.
  } catch { /* Static artifacts can be inspected offline. */ }
}
$('refresh-build').onclick = () => location.reload();
window.pxCubeControl = Object.freeze({ inspect: () => ({ artifact: state.runId, view, activeId, frames: [...retainedFrames.keys()] }) });
checkBuild(); setInterval(checkBuild, 5000);
setInterval(() => { refreshMounts(); refreshConsole(); }, 2000);
