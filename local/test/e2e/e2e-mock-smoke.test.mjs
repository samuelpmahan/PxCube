// E2E: MockPxC smoke experience, driven in Node through the DOM shim.
// The app boots against MockPxC (createMockMounts, pure JS); the shim only
// stands in for rendering. Flows mirror the browser checks: open the
// interactive world, create isolated test runs, save in one world, and prove
// the others keep their seed values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomShim } from './dom-shim.mjs';
import { siteFile, sitePath } from './e2e-site.mjs';

const { document } = installDomShim({ baseDir: sitePath('experiences', 'mock-smoke') });
await import(siteFile('experiences', 'mock-smoke', 'app.mjs'));

const owner = globalThis.window.pxCubeMocks;
assert.ok(owner, 'app exposes its MockPxC owner on window.pxCubeMocks');
assert.equal(document.getElementById('status').textContent.includes('Stopped'), false);

const interactive = owner.list().find(run => run.kind === 'interactive');
assert.ok(interactive, 'the app opens an interactive world on boot');

test('interactive world opens on the seeded shelf', () => {
  const handle = owner.handle(interactive.name);
  const discs = handle.resolve(`${handle.name}.px.discs`);
  assert.ok(Array.isArray(discs) && discs.length > 0, 'seed shelf has discs');
  assert.equal(handle.resolve(`${handle.name}.sc.draft.name`), 'Untitled bag');
});

test('test runs isolate: save in one world, the other keeps its seed', () => {
  const before = owner.inspect();
  // Drive the app's own "new run" control twice, like a user would.
  document.getElementById('run-id').value = 'shelf';
  document.getElementById('new-run').click();
  document.getElementById('new-run').click();
  const runs = owner.list().filter(run => run.kind === 'test').slice(-2);
  const [a, b] = runs.map(run => owner.handle(run.name));
  assert.notEqual(a.name, b.name);

  // Drive the app's own save control for the first world, like the UI does.
  const panel = document.querySelectorAll('article').find(row => row.dataset.mount === a.name);
  assert.ok(panel, 'app rendered a panel for the new test run');
  panel.querySelector('input').value = 'Fieldwork';
  panel.querySelector('button').click();

  assert.equal(a.resolve(`${a.name}.sc.draft.name`), 'Fieldwork');
  assert.equal(b.resolve(`${b.name}.sc.draft.name`), 'Untitled bag');
  assert.match(document.getElementById('status').textContent, /Saved in /);

  // Every world that existed before still inspects exactly as it did.
  for (const [name, value] of Object.entries(before.runs)) {
    assert.deepEqual(owner.handle(name).inspect(), value, `earlier world ${name} survived`);
  }
});

test('a fresh interactive open retains the saved worlds', () => {
  const again = owner.openInteractive('shelf');
  assert.equal(again.name, interactive.name);
  assert.ok(owner.list().some(run => run.kind === 'test'), 'test runs retained');
});
