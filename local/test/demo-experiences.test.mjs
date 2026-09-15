import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from '../run.mjs';
import { workspace, setManifest, cli } from './scaffold-helpers.mjs';

// Test the actual packaged modules, not a parallel copy of the source.
const repo=workspace();
after(()=>fs.rmSync(repo,{recursive:true,force:true}));
const registry=JSON.parse(fs.readFileSync(path.join(root,'.tidy/manifest.json')));
setManifest(repo,{'pxcube-build-bag':registry.types['pxcube-build-bag']});
fs.cpSync(path.join(root,'experiences/build-bag'),path.join(repo,'experiences/build-bag'),{recursive:true});
const packaged=cli(repo,'package',path.join(repo,'experiences/build-bag'));
assert.equal(packaged.status,0,packaged.stderr);
const entry=path.join(repo,'experiences/build-bag/dist/model.mjs');
const {openDemo}=await import(pathToFileURL(entry));
const {pack,unpack,archiveStorage}=await import(pathToFileURL(path.join(path.dirname(entry),'archive-storage.mjs')));
const memory=()=>{let raw=null;return{getItem:()=>raw,setItem:(_key,value)=>{raw=value;}};};

test('exact-copy bag order, duplicate refusal, reload and isolated worlds',async()=>{
  const storage=memory(),demo=await openDemo(storage),rows=demo.experience.shelf();
  assert.equal(rows.length,8);
  const chosen=[rows[2].address,rows[0].address,rows[1].address];
  await demo.patch({name:'Windy afternoon',selection:chosen});
  assert.deepEqual(await demo.reorder(2,0),[chosen[2],chosen[0],chosen[1]]);
  const address=await demo.createBag(),bag=demo.value(address);
  assert.deepEqual(bag.versions.map(v=>v.address),chosen);
  assert.deepEqual(bag.discIds,chosen.map(a=>demo.value(a).id));
  assert.equal(demo.pxc.get(address).composition.calculation,demo.pxc.get('fn.createBag'));
  await assert.rejects(demo.experience.createBag('Duplicated',[chosen[0],chosen[0]]),/more than once/);
  await assert.rejects(demo.experience.createBag('Stale',['ds.px.disc.missing']),/stale or absent/);
  assert.equal(demo.experience.bags().length,1);
  const restored=await openDemo(storage);
  assert.deepEqual(restored.experience.bags().map(r=>r.bag),[bag]);
  assert.deepEqual(restored.context.selection,chosen);
  assert.equal((await openDemo(memory())).experience.bags().length,0);
});

test('compressed storage preserves every archive byte, replays Parts, and refuses stale writers',async()=>{
  const bytes=new Map(),backing={getItem:key=>bytes.get(key)??null,setItem:(key,value)=>bytes.set(key,value)};
  const storage=await archiveStorage(backing,'one'),demo=await openDemo(storage);
  const raw=storage.getItem(''),packed=bytes.get('one');
  assert.equal(await unpack(packed),raw);
  assert.equal(await unpack(await pack('é and 🌈\n'+raw)),'é and 🌈\n'+raw);
  assert.ok(packed.length<raw.length/5);
  const restored=await openDemo(await archiveStorage(backing,'one'));
  assert.deepEqual(restored.experience.shelf(),demo.experience.shelf());
  const stale=await archiveStorage(backing,'one');
  await demo.patch({name:'The live writer'});
  const committed=bytes.get('one');stale.setItem('','other bytes');await assert.rejects(stale.flush(),/another tab/);
  assert.equal(bytes.get('one'),committed);
  console.log(JSON.stringify({archiveCharacters:raw.length,compressedCharacters:packed.length,roundTrip:'identical'}));
});

test('render uses actual source Parts; captures replay and cannot drift with live design',async()=>{
  const storage=memory(),demo=await openDemo(storage);
  const before=structuredClone(demo.experience.shelf()[0]);
  const first=await demo.render(before.address,demo.context.design);
  assert.equal(first.graphic.width,1920);assert.equal(first.graphic.height,1080);
  assert.match(first.graphic.svg,new RegExp(before.seed.name));
  assert.equal(demo.pxc.get(first.fieldsAddress).composition.inputs.disc,demo.pxc.get(before.address));
  const {capture}=await demo.capture(first,'mock.create-graphics');
  const next=await demo.render(before.address,{...demo.context.design,orientation:'portrait',accent:'#ff4f9b',title:'A new design'});
  assert.equal(next.graphic.width,1080);assert.notEqual(next.graphic.svg,capture.graphic.svg);
  assert.deepEqual(demo.experience.shelf()[0],before);
  const restored=await openDemo(storage);
  assert.deepEqual(restored.value(restored.context.graphics[0]),capture);
  assert.equal((await restored.render(before.address,capture.design)).graphic.svg,capture.graphic.svg);
  const target=await openDemo(memory());
  assert.equal(await target.importCapture(capture),true);
  assert.equal(await target.importCapture(capture),false);
  assert.equal(target.context.graphics.length,1);
  await assert.rejects(target.importCapture({...capture,graphic:{...capture.graphic,svg:capture.graphic.svg+'changed'}}),/hash/);
  assert.equal(target.context.graphics.length,1);
  assert.equal(await target.importCapture({...capture,source:{...capture.source,graphic:capture.source.graphic+'.another'}}),true);
  assert.equal(target.context.graphics.length,2,'equal image bytes do not collapse different source Parts');
});

test('search excludes nicknames and preserves mold / plastic / descending weight order',async()=>{
  const demo=await openDemo(memory());
  const view=await demo.experience.queryShelf({query:'Buzzz · ESP'});
  assert.equal(view.rows.length,2);
  assert.deepEqual(view.groups[0].rows.map(row=>row.disc.weight),[175,170]);
  const row=demo.experience.shelf()[0];
  const edited=await demo.experience.updateDepiction(row.address,{});
  assert.equal(demo.value(edited).id,row.disc.id);
  const constrained=await demo.experience.queryShelf({speedRange:[7,8]});
  assert.ok(constrained.rows.length>0);
  assert.ok(constrained.rows.every(row=>(row.disc.speed??row.seed.speed)>=7&&(row.disc.speed??row.seed.speed)<=8));
});
