// E2E: BuildBag scaffold experience, driven in Node through the DOM shim.
// The app loads its tidy-resolved config, opens a MockPxC shelf world, and
// the draft-name flow writes through the mock. Assertions go through the
// app's own pxCubeScaffold seam, the same object the browser inspects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomShim } from './dom-shim.mjs';
import { siteFile, sitePath } from './e2e-site.mjs';

const { document } = installDomShim({ baseDir: sitePath('experiences', 'build-bag') });
await import(siteFile('experiences', 'build-bag', 'app.mjs'));

const scaffold = globalThis.window.pxCubeScaffold;
assert.ok(scaffold, 'app exposes its scaffold seam on window.pxCubeScaffold');
const status = document.getElementById('status').textContent;
assert.doesNotMatch(status, /Stopped/, `app booted cleanly (status: ${status})`);

test('config loads and the scaffold renders its title and steps', () => {
  assert.equal(document.getElementById('title').textContent, 'BuildBag');
  assert.equal(document.title, 'BuildBag');
  const steps = document.getElementById('steps').children.map(li => li.textContent);
  assert.deepEqual(steps, ['Choose discs', 'Arrange your bag', 'Create bag']);
  assert.equal(document.getElementById('draft-form').hidden, false);
  assert.equal(document.getElementById('draft-label').textContent, 'Bag name');
});

test('the shelf input resolves through the mock world', () => {
  const current = scaffold.current();
  assert.match(current.name, /^mock\.build-bag/);
  const discs = scaffold.resolve(`${current.name}.px.discs`);
  assert.ok(Array.isArray(discs) && discs.length > 0, 'scaffold input px.discs has discs');
  const draft = scaffold.resolve(`${current.name}.sc.draft`);
  assert.equal(draft.name, 'Untitled bag');
});

test('saving the draft name writes through the mock, per sandbox', () => {
  const before = scaffold.current().name;
  document.getElementById('draft-name').value = 'Fieldwork';
  document.getElementById('draft-form').onsubmit({ preventDefault() {} });
  assert.match(document.getElementById('status').textContent, /Draft saved/);
  assert.equal(scaffold.resolve(`${before}.sc.draft`).name, 'Fieldwork');

  // A new test sandbox starts from the seed; the saved sandbox keeps its name.
  document.getElementById('new-test').onclick();
  const current = scaffold.current();
  assert.notEqual(current.name, before);
  assert.equal(scaffold.resolve(`${current.name}.sc.draft`).name, 'Untitled bag');

  // Switching back to the saved sandbox through the app's own control
  // restores its draft name; cross-sandbox addresses stay rejected.
  document.getElementById('mounts').value = before;
  document.getElementById('mounts').onchange();
  assert.equal(scaffold.current().name, before);
  assert.equal(scaffold.resolve(`${before}.sc.draft`).name, 'Fieldwork');
  assert.throws(() => scaffold.resolve(`${current.name}.sc.draft`), /outside/);
});
