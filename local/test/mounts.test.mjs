import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockMounts } from '../mock-mounts.mjs';
import { worlds, resolveAddress, resolveWorldValue } from '../../mock-pxc/mock-pxc.mjs';
const memory = () => { const values = new Map(); return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}; };
const owner = storage => createMockMounts({storage,key:'test',seedIdentity:'fixture-source-digest'});
test('owned resolver preserves fixture dotted-key and nested resolution', () => {
  for(const address of ['px.discs','px.discs.buzzz','fn.flight.total','fn.flight.average','oc.sync.now','sc.draft.name']) {
    assert.deepEqual(resolveWorldValue(structuredClone(worlds.shelf),address),resolveAddress('shelf',address));
  }
  assert.throws(()=>resolveWorldValue(worlds.shelf,'shelf.px.discs'));
});
test('iteration allocation, guarded resolution, seed isolation and reload retention', () => {
  const storage=memory(), host=owner(storage), a=host.createTestRun('shelf'), b=host.createTestRun('shelf');
  assert.equal(a.name,'mock.shelf.1'); assert.equal(b.name,'mock.shelf.2');
  a.writeScratch('sc.draft',{name:'Practice bag',slots:[]});
  assert.equal(a.resolve(a.name+'.sc.draft.name'),'Practice bag');
  assert.equal(b.resolve(b.name+'.sc.draft.name'),'Untitled bag');
  assert.equal(worlds.shelf.sc.draft.name,'Untitled bag');
  const leaked = a.resolve(a.name+'.px.discs'); leaked[0].mold='changed';
  assert.equal(a.resolve(a.name+'.px.discs')[0].mold,'Buzzz');
  assert.throws(()=>a.resolve(b.name+'.sc.draft.name'),/outside/);
  assert.throws(()=>a.writeScratch(a.name+'.sc.draft',{}),/without a mount/);
  assert.equal(a.inspect().changes[0].address,'sc.draft');
  const resumed=owner(storage); assert.deepEqual(resumed.inspect(),host.inspect());
  assert.equal(resumed.createTestRun('shelf').name,'mock.shelf.3');
  assert.equal(resumed.handle(a.name).resolve(a.name+'.sc.draft.name'),'Practice bag');
});
test('quota failure and competing owner cannot silently discard prior iterations', () => {
  const storage=memory(), a=owner(storage), stale=owner(storage); a.createTestRun('test');
  assert.throws(()=>stale.createTestRun('other'),/Another owner/);
  const before=a.inspect(); storage.setItem=()=>{throw Error('quota exhausted')};
  assert.throws(()=>a.createTestRun('test'),/quota/); assert.deepEqual(a.inspect(),before);
});
test('interactive identity resumes without reseeding; numbered tests remain independent', () => {
  const storage=memory(), host=owner(storage), interactive=host.openInteractive('shelf');
  assert.equal(interactive.name,'mock.shelf');
  assert.equal(interactive.inspect().kind,'interactive');
  assert.equal(Object.hasOwn(interactive.inspect(),'iteration'),false);
  interactive.writeScratch('sc.draft',{name:'My working bag',slots:['Buzzz']});
  const before=host.inspect();
  assert.deepEqual(host.openInteractive('shelf').inspect(),interactive.inspect());
  assert.deepEqual(host.inspect(),before); // Opening is not a write/reset.
  const a=host.createTestRun('shelf'), b=host.createTestRun('shelf');
  assert.equal(a.name,'mock.shelf.1');assert.equal(b.name,'mock.shelf.2');
  assert.equal(a.inspect().kind,'test');
  assert.equal(a.resolve(a.name+'.sc.draft.name'),'Untitled bag');
  a.writeScratch('sc.draft',{name:'Test mutation',slots:[]});
  assert.equal(interactive.resolve('mock.shelf.sc.draft.name'),'My working bag');
  assert.equal(b.resolve(b.name+'.sc.draft.name'),'Untitled bag');
  assert.throws(()=>interactive.resolve(a.name+'.sc.draft.name'),/outside/);
  assert.throws(()=>a.resolve('mock.shelf.sc.draft.name'),/outside/);
  const resumed=owner(storage);assert.deepEqual(resumed.inspect(),host.inspect());
  assert.equal(resumed.openInteractive('shelf').resolve('mock.shelf.sc.draft.name'),'My working bag');
  assert.equal(resumed.createTestRun('shelf').name,'mock.shelf.3');
  const unchanged=resumed.inspect();assert.throws(()=>resumed.openInteractive('shelf','studio'),/different kind or world/);assert.deepEqual(resumed.inspect(),unchanged);
});
test('legacy numbered worlds retain their exact data without assigning a historical purpose', () => {
  const storage=memory(), original=owner(storage), legacy=original.createTestRun('shelf');
  legacy.writeScratch('sc.draft',{name:'Manually edited in the earlier demo',slots:[]});
  const old=JSON.parse(storage.getItem('test'));delete old.runs[legacy.name].kind;storage.setItem('test',JSON.stringify(old));
  const resumed=owner(storage);assert.deepEqual(resumed.inspect(),old);assert.equal(resumed.list()[0].kind,'legacy');
  assert.equal(resumed.openInteractive('shelf').name,'mock.shelf');
  assert.equal(resumed.createTestRun('shelf').name,'mock.shelf.2');
  assert.deepEqual(resumed.handle(legacy.name).inspect(),old.runs[legacy.name]);
});
