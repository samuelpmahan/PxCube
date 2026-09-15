// E2E: BuildBag scaffold experience, driven in Node through the DOM shim.
// The app loads its tidy-resolved config and reaches its PxC boards through
// the shell's kernel API directly, the same window.parent.pxc the launcher
// exposes. This test plays the shell. Assertions go through the app's own
// pxCubeScaffold seam, the same object the browser inspects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomShim } from './dom-shim.mjs';
import { siteFile, sitePath } from './e2e-site.mjs';
import { createPxcHost } from '../../pxc-kernel.mjs';
import * as pxc from '../../../vendor/neat/dist/pxc.js';
import { worlds, NAMESPACES } from '../../../mock-pxc/mock-pxc.mjs';

const { document, localStorage } = installDomShim({ baseDir: sitePath('experiences', 'build-bag') });
// The test is the shell: it exposes the same window.pxc.ownerFor the
// launcher gives frames, backed by a real kernel host.
const host = createPxcHost({ storage: localStorage, seeds: { worlds, namespaces: NAMESPACES }, pxc });
globalThis.parent = {
  pxc: Object.freeze({
    ownerFor(key, experienceId, seedIdentity) {
      if (experienceId) host.experienceForKey.set(key, experienceId);
      return host.kernelFor(key, seedIdentity);
    },
  }),
};
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

test('the shelf input resolves through the kernel world', async () => {
  const current = await scaffold.current();
  assert.match(current.name, /^mock\.build-bag/);
  const discs = await scaffold.resolve(`${current.name}.px.discs`);
  assert.ok(Array.isArray(discs) && discs.length > 0, 'scaffold input px.discs has discs');
  const draft = await scaffold.resolve(`${current.name}.sc.draft`);
  assert.equal(draft.name, 'Untitled bag');
});

test('saving the draft name writes through the kernel, per sandbox', async () => {
  const before = (await scaffold.current()).name;
  document.getElementById('draft-name').value = 'Fieldwork';
  await document.getElementById('draft-form').onsubmit({ preventDefault() {} });
  assert.match(document.getElementById('status').textContent, /Draft saved/);
  assert.equal((await scaffold.resolve(`${before}.sc.draft`)).name, 'Fieldwork');

  // A new test sandbox starts from the seed; the saved sandbox keeps its name.
  await document.getElementById('new-test').onclick();
  const current = await scaffold.current();
  assert.notEqual(current.name, before);
  assert.equal((await scaffold.resolve(`${current.name}.sc.draft`)).name, 'Untitled bag');

  // Switching back to the saved sandbox through the app's own control
  // restores its draft name; cross-sandbox addresses stay rejected.
  document.getElementById('mounts').value = before;
  await document.getElementById('mounts').onchange();
  assert.equal((await scaffold.current()).name, before);
  assert.equal((await scaffold.resolve(`${before}.sc.draft`)).name, 'Fieldwork');
  assert.throws(() => scaffold.resolve(`${current.name}.sc.draft`), /outside/);
});
