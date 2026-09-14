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
  const storage=memory(), host=owner(storage), a=host.create('shelf'), b=host.create('shelf');
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
  assert.equal(resumed.create('shelf').name,'mock.shelf.3');
  assert.equal(resumed.handle(a.name).resolve(a.name+'.sc.draft.name'),'Practice bag');
});
test('quota failure and competing owner cannot silently discard prior iterations', () => {
  const storage=memory(), a=owner(storage), stale=owner(storage); a.create('test');
  assert.throws(()=>stale.create('other'),/Another owner/);
  const before=a.inspect(); storage.setItem=()=>{throw Error('quota exhausted')};
  assert.throws(()=>a.create('test'),/quota/); assert.deepEqual(a.inspect(),before);
});
