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
  for (const id of ['experience-panel', 'work-panel', 'builds-panel', 'mounts-panel', 'viewer']) $(id).hidden = true;
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
setInterval(refreshMounts, 2000);
