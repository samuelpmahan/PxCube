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
    const discs = document.createElement('p'); discs.textContent = resolveSeed(handle).map(disc => `${disc.mold} · ${disc.maker}`).join(' / ');
    const label = document.createElement('label'); label.textContent = 'Bag name';
    const input = document.createElement('input'); input.value = handle.resolve(`${run.name}.sc.draft.name`); input.setAttribute('aria-label', `Bag name for ${run.name}`); label.append(input);
    const save = document.createElement('button'); save.textContent = 'Save in this world'; save.onclick = () => report(() => {
      const draft = handle.resolve(`${run.name}.sc.draft`); handle.writeScratch('sc.draft', {...draft, name: input.value}); draw(); $('status').textContent = `Saved in ${run.name}. Other worlds kept their values.`;
    });
    const details = document.createElement('details'); details.open = true;
    const summary = document.createElement('summary'); summary.textContent = `${snapshot.changes.length} recorded writes · inspect actual draft`;
    const pre = document.createElement('pre'); pre.textContent = JSON.stringify({address:'sc.draft', value:handle.resolve(`${run.name}.sc.draft`), changes:snapshot.changes},null,2);
    details.append(summary,pre); panel.append(title,discs,label,save,details); return panel;
  }));
  $('inspection').textContent = JSON.stringify(owner.inspect(),null,2);
}
$('new-run').onclick = () => report(() => { const handle = owner.create($('run-id').value); draw(); $('status').textContent = `Created ${handle.name}; previous iterations retained.`; });
$('smoke').onclick = async () => {
  $('smoke').disabled = true;
  try {
    const before = owner.inspect();
    const a = owner.create('check'), b = owner.create('check'); draw();
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
if (!owner.list().length) owner.create('shelf');
draw();

} catch (error) {
  $('status').textContent = `Stopped: ${error.message}. Existing retained data was not discarded.`;
  for (const button of document.querySelectorAll('button')) button.disabled = true;
}
