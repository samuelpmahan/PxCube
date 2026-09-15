import { createMockMounts } from './local/mock-mounts.mjs';
import seedIdentity from './seed-identity.mjs';
const $ = id => document.getElementById(id);
try {
const scope = new URLSearchParams(location.search).get('scope') ?? 'default';
const owner = createMockMounts({storage: localStorage, key: `pxcube.mock-smoke.v1:${scope}`, seedIdentity});
window.pxCubeMocks = owner;
const seedAddress = 'shelf.px.discs'; // The declared logical mount used by this Experience.
function resolveSeed(handle) { return handle.resolve(`${handle.name}.${seedAddress.slice('shelf.'.length)}`); }
function report(action) { try { action(); } catch (error) { $('status').textContent = `Stopped: ${error.message}`; } }
function draw() {
  $('worlds').replaceChildren(...owner.list().map(run => {
    const handle = owner.handle(run.name), snapshot = handle.inspect();
    const panel = document.createElement('article'); panel.dataset.mount = run.name;
    const title = document.createElement('h2'); title.textContent = run.name;
    const kind = document.createElement('p'); kind.className = 'eyebrow'; kind.textContent = run.kind === 'interactive' ? 'Interactive sandbox' : run.kind === 'test' ? `Test run · ${run.iteration}` : 'Earlier sandbox · purpose unrecorded';
    const discs = document.createElement('p'); discs.textContent = resolveSeed(handle).map(disc => `${disc.mold} · ${disc.maker}`).join(' / ');
    const label = document.createElement('label'); label.textContent = 'Bag name';
    const input = document.createElement('input'); input.value = handle.resolve(`${run.name}.sc.draft.name`); input.setAttribute('aria-label', `Bag name for ${run.name}`); label.append(input);
    const save = document.createElement('button'); save.textContent = 'Save in this world'; save.onclick = () => report(() => {
      const draft = handle.resolve(`${run.name}.sc.draft`); handle.writeScratch('sc.draft', {...draft, name: input.value}); draw(); $('status').textContent = `Saved in ${run.name}. Other worlds kept their values.`;
    });
    const details = document.createElement('details'); details.open = true;
    const summary = document.createElement('summary'); summary.textContent = `${snapshot.changes.length} recorded writes · inspect actual draft`;
    const pre = document.createElement('pre'); pre.textContent = JSON.stringify({address:'sc.draft', value:handle.resolve(`${run.name}.sc.draft`), changes:snapshot.changes},null,2);
    details.append(summary,pre); panel.append(kind,title,discs,label,save,details); return panel;
  }));
  $('inspection').textContent = JSON.stringify(owner.inspect(),null,2);
}
$('open-interactive').onclick = () => report(() => { const handle = owner.openInteractive($('run-id').value); draw(); $('status').textContent = `Opened interactive sandbox ${handle.name}. Its current state is retained.`; });
$('new-run').onclick = () => report(() => { const handle = owner.createTestRun($('run-id').value); draw(); $('status').textContent = `Created test run ${handle.name} from its seed; earlier sandboxes retained.`; });
$('smoke').onclick = async () => {
  $('smoke').disabled = true;
  try {
    const before = owner.inspect();
    const id = $('run-id').value;
    const a = owner.createTestRun(id), b = owner.createTestRun(id); draw();
    $('status').textContent = `Created ${a.name} and ${b.name}. Next: edit the first world's visible control.`;
    await new Promise(resolve => setTimeout(resolve, 500));
    const panel = [...document.querySelectorAll('article')].find(row => row.dataset.mount === a.name);
    panel.querySelector('input').value = 'Fieldwork'; panel.querySelector('button').click();
    const checks = [a.resolve(`${a.name}.sc.draft.name`) === 'Fieldwork', b.resolve(`${b.name}.sc.draft.name`) === 'Untitled bag', Object.entries(before.runs).every(([name,value]) => JSON.stringify(owner.handle(name).inspect()) === JSON.stringify(value))];
    window.pxCubeSmoke = { mounts:[a.name,b.name], checks, ownerRevision:owner.inspect().revision };
    if (checks.some(value => !value)) throw Error('Isolation check failed. Inspect the retained worlds.');
    $('status').textContent = '3 checks passed: first changed, second stayed seeded, all previous worlds survived.';
  } catch(error) { $('status').textContent = `Stopped: ${error.message}`; }
  finally { $('smoke').disabled = false; }
};
owner.openInteractive('shelf');
draw();

// Tests view: the catalog is built from the repo's real test files, and the
// runnable ones execute here through the node: shims (see the import map).
// Tests run inside test-seam sessions: results land in MockPxC run records,
// worlds stay inspectable, and any recorded run replays in a distinct sandbox.
function renderSessionWorlds(session) {
  const box = $('tests-worlds');
  const snapshot = session.snapshot();
  const section = document.createElement('div'); section.className = 'session-worlds';
  const total = snapshot.worlds.reduce((n, w) => n + w.runs.length, 0);
  const header = document.createElement('h3');
  header.textContent = `Session worlds · ${total} runs retained in MockPxC`;
  section.append(header);
  for (const { owner: ownerIndex, runs } of snapshot.worlds) {
    for (const run of runs) {
      const row = document.createElement('div'); row.className = 'world-row';
      const kindLabel = run.kind === 'replay' ? `replay of ${run.replayOf}` : run.kind === 'interactive' ? 'interactive' : `test run${run.iteration === undefined ? '' : ` ${run.iteration}`}`;
      const label = document.createElement('span');
      label.textContent = `${run.name} · ${kindLabel} · ${run.changes.length} recorded writes`;
      const button = document.createElement('button'); button.textContent = 'Replay in a distinct sandbox';
      button.onclick = () => startReplay(session, ownerIndex, run.name);
      row.append(label, button); section.append(row);
    }
  }
  const hint = document.createElement('p'); hint.className = 'hint';
  hint.textContent = 'A replay performs the recorded writes again, step by step, in its own sandbox. The recorded run is never written to.';
  section.append(hint); box.append(section);
}
function startReplay(session, ownerIndex, runName) {
  const panel = $('replay'); panel.replaceChildren();
  let replay;
  try { replay = session.replay(ownerIndex, runName); }
  catch (error) { panel.textContent = `Stopped: ${error.message}`; return; }
  $('tests-worlds').replaceChildren();
  renderSessionWorlds(session);
  const title = document.createElement('h3');
  title.textContent = `Replay · ${replay.source} performed again in ${replay.name}`;
  const controls = document.createElement('div'); controls.className = 'toolbar';
  const stepButton = document.createElement('button'); stepButton.textContent = 'Step';
  const allButton = document.createElement('button'); allButton.textContent = 'Run all';
  const counter = document.createElement('p'); counter.className = 'hint';
  const change = document.createElement('p'); change.className = 'hint';
  const state = document.createElement('pre');
  const fidelity = document.createElement('p'); fidelity.className = 'hint';
  const paint = () => {
    counter.textContent = `Step ${replay.applied} of ${replay.total}`;
    const next = replay.changeAt(replay.applied);
    change.textContent = next ? `next: ${next.address} becomes ${JSON.stringify(next.after)}` : 'every recorded write has been performed';
    state.textContent = JSON.stringify(replay.state().value, null, 2);
    stepButton.disabled = replay.applied >= replay.total;
  };
  stepButton.onclick = () => { replay.applyNext(); paint(); };
  allButton.onclick = () => {
    replay.runAll(); paint();
    fidelity.textContent = replay.matches()
      ? 'Replay fidelity holds: the distinct sandbox reached the recorded final state.'
      : 'Replay fidelity FAILED: the sandbox diverged from the recorded run.';
  };
  controls.append(stepButton, allButton); panel.append(title, controls, counter, change, state, fidelity);
  paint();
}
try {
  const catalogResponse = await fetch('./tests/catalog.json');
  if (!catalogResponse.ok) throw Error(`test catalog unavailable (${catalogResponse.status})`);
  const catalog = await catalogResponse.json();
  const files = $('tests-files');
  for (const entry of catalog) {
    const wrap = document.createElement('div'); wrap.className = 'test-file';
    const badge = document.createElement('p'); badge.className = 'eyebrow';
    badge.textContent = entry.runnable ? 'Runs in this browser' : 'Node/CI only';
    const title = document.createElement('h3'); title.textContent = entry.file;
    const list = document.createElement('ul');
    for (const name of entry.tests) { const item = document.createElement('li'); item.textContent = name; list.append(item); }
    wrap.append(badge, title, list);
    if (!entry.runnable && entry.note) { const note = document.createElement('p'); note.className = 'hint'; note.textContent = entry.note; wrap.append(note); }
    files.append(wrap);
  }
  const runnable = catalog.filter(entry => entry.runnable);
  const runButton = $('run-tests');
  runButton.disabled = runnable.length === 0;
  let runCount = 0;
  runButton.onclick = async () => {
    runButton.disabled = true;
    $('tests-results').replaceChildren();
    $('tests-worlds').replaceChildren();
    $('replay').replaceChildren();
    $('tests-status').textContent = 'Running…';
    let passed = 0, failed = 0;
    try {
      for (const entry of runnable) {
        runCount += 1;
        const sessionKey = `browser-run-${runCount}`;
        const header = document.createElement('h3'); header.textContent = entry.file;
        const list = document.createElement('ul'); $('tests-results').append(header, list);
        const seam = await import('./tests/local/test/test-seam.mjs');
        seam.setActiveTestSession(sessionKey);
        const shim = await import('node:test');
        shim.default.reset();
        await import(`./tests/${entry.file}?run=${runCount}`);
        const session = seam.testSession(sessionKey);
        await shim.default.runAll(result => {
          session.recordResult({ testFile: entry.file, testName: result.name, ok: result.ok, error: result.ok ? null : result.error });
          const item = document.createElement('li');
          item.className = result.ok ? 'test-pass' : 'test-fail';
          item.textContent = result.ok ? `pass · ${result.name}` : `FAIL · ${result.name} — ${result.error}`;
          list.append(item);
          if (result.ok) passed += 1; else failed += 1;
        });
        renderSessionWorlds(session);
      }
      $('tests-status').textContent = failed === 0 ? `${passed} passed. Results and worlds are retained in MockPxC.` : `${passed} passed, ${failed} failed.`;
    } catch (error) { $('tests-status').textContent = `Stopped: ${error.message}`; }
    finally { runButton.disabled = false; }
  };
} catch (error) { $('tests-status').textContent = `Test catalog unavailable: ${error.message}`; }

} catch (error) {
  $('status').textContent = `Stopped: ${error.message}. Existing retained data was not discarded.`;
  for (const button of document.querySelectorAll('button')) button.disabled = true;
}
