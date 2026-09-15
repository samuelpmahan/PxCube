import config from './config.mjs';
import { openDemo, captureIdentity } from './model.mjs';
import { drawCompetition } from './competition-ui.mjs';
import { currentLayout, allCardStudies, defaultStudy } from './graphics.mjs';
import { createMockMounts } from './local/mock-mounts.mjs';
import { localAddress } from './local/experience-mount.mjs';
import { archiveStorage } from './archive-storage.mjs';
import { esc } from './renderer/src/presentation.js';
import { pngFromSvg, sha256, downloadBlob } from './renderer/src/media.js';

const $=id=>document.getElementById(id),contexts=new Map();
const storageRoot=`pxcube.demo.v1:${config.id}`;
const mailbox='pxcube.demo.v1:handoff:creategraphics-to-exportgraphics';
const owner=createMockMounts({storage:localStorage,key:storageRoot+':mounts',seedIdentity:config.seedIdentity});
let previewBackground='scene';
let active,model,result,query='',chosenCapture=null,busy=false,queue=Promise.resolve();
const pretty=value=>JSON.stringify(value,(_key,item)=>typeof item==='function'?'[Calculation]':item,2);
const say=(text,error=false)=>{$('status').textContent=text;$('status').className=error?'error':'';};
function run(action){queue=queue.then(async()=>{busy=true;try{await action();}catch(error){say(String(error),true);}finally{busy=false;}});return queue;}
const rows=()=>model.shelfForDisplay();
const art=row=>`<img src="${esc(row.art)}" alt="${esc(row.seed.manufacturer+' '+row.seed.name)}">`;
const facts=row=>`${esc(row.disc.plastic||'Plastic unknown')} · ${row.disc.weight===null?'Weight unknown':esc(row.disc.weight)+' g'}`;
function selectionCards(items,selection){return items.map(row=>`<button class="disc ${selection.includes(row.address)?'selected':''}" data-disc="${esc(row.address)}" aria-pressed="${selection.includes(row.address)}"><span class="check">${selection.includes(row.address)?'✓':'+'}</span><span class="art">${art(row)}</span><span class="maker">${esc(row.seed.manufacturer)}</span><h3>${esc(row.seed.name)}</h3><span class="facts">${facts(row)}</span></button>`).join('');}
function intro(title,description){return `<div class="intro"><span class="eyebrow">${config.mode==='bag'?'YOUR NEXT ROUND':config.mode==='export'?'ON THE COURSE':'ON THE COURSE · DISCSPOTLIGHT'}</span><h1>${title}</h1><p class="muted">${description}</p></div>`;}
function inspect(){return {mount:active.name,kind:active.inspect().kind,...model.inspect()};}
async function open(name){
  const next=owner.handle(name);
  if(next.inspect().seedIdentity!==config.seedIdentity)throw Error('The retained seed differs; migration requires review. Original data preserved.');
  if(!contexts.has(name))contexts.set(name,await openDemo(await archiveStorage(localStorage,`${storageRoot}:${name}:archive`)));
  active=next;
  model=contexts.get(name);query='';chosenCapture=null;
  $('mount').textContent=name+'.*';$('session').replaceChildren(...owner.list().map(item=>new Option(item.kind==='interactive'?'Interactive · resume':`Test ${item.iteration}`,item.name)));$('session').value=name;
  await draw();say(active.inspect().kind==='test'?'Fresh numbered sandbox · changes stay in this run.':'Ready · saved changes stay in this sandbox.');
}
async function draw(){
  if(config.mode==='bag')await drawBag();
  else if(config.mode==='create')await drawCreate();
  else await drawExport();
}
async function drawBag(){
  const context=model.context,view=await model.queryShelf({query}),all=await rows();
  const visibleRows=view.groups.flatMap(group=>group.rows.map(row=>all.find(candidate=>candidate.address===row.address)));
  const selected=context.selection.map(address=>{const row=all.find(row=>row.address===address);if(!row)throw Error('Selected copy no longer exists.');return row;});
  $('app').innerHTML=intro('What are you carrying?','Choose the exact copies, arrange your lineup, then keep a named bag.')+`<div class="workspace"><aside class="panel"><h2>Find a disc</h2><form id="search-form"><label>Manufacturer, mold or plastic<input id="query" value="${esc(query)}" placeholder="Buzzz · ESP"></label><button class="full">Search</button></form><button id="clear-search" class="full">Show all</button><p class="notice">Eight seeded specimens, three existing painters. Your Upload and Shelf sandboxes stay separate.</p><span class="pill">${view.shown} of ${view.total} copies</span></aside><section class="panel"><h2>Your available copies</h2><div class="grid">${selectionCards(visibleRows,context.selection)||'<p class="empty">No matches. Try another mold or clear the search.</p>'}</div></section><aside class="panel"><h2>Your bag · ${selected.length}</h2><ol class="selection">${selected.map((row,i)=>`<li><span class="art">${art(row)}</span><div><strong>${esc(row.seed.name)}</strong><br><small>${facts(row)}</small><div class="controls"><button data-up="${i}" aria-label="Move ${esc(row.seed.name)} up" ${i===0?'disabled':''}>↑</button><button data-down="${i}" aria-label="Move ${esc(row.seed.name)} down" ${i===selected.length-1?'disabled':''}>↓</button><button data-remove="${i}" aria-label="Remove ${esc(row.seed.name)}">Remove</button></div></div></li>`).join('')||'<li>Choose a copy to start.</li>'}</ol><form id="bag-form"><label>Bag name<input id="draft-name" value="${esc(context.name)}" placeholder="Windy afternoon" required maxlength="80"></label><button class="primary full" id="create-bag" ${selected.length?'':'disabled'}>Create bag</button></form><button id="save-draft" class="full">Save draft</button><div class="saved"><h3>Saved bags</h3>${model.experience.bags().map(({address,bag})=>`<button data-bag="${esc(address)}"><strong>${esc(bag.name)}</strong><br><small>${bag.discIds.length} exact copies · open</small></button>`).join('')||'<small>No saved bags yet.</small>'}</div></aside></div>`;
  $('search-form').onsubmit=event=>{event.preventDefault();query=$('query').value;run(drawBag);};
  $('clear-search').onclick=()=>run(async()=>{query='';await drawBag();});
  const edit=async(selection)=>{await model.patch({selection,name:$('draft-name').value});await drawBag();};
  document.querySelectorAll('[data-disc]').forEach(button=>button.onclick=()=>run(async()=>{const a=button.dataset.disc,selection=model.context.selection;await edit(selection.includes(a)?selection.filter(x=>x!==a):[...selection,a]);}));
  document.querySelectorAll('[data-up],[data-down],[data-remove]').forEach(button=>button.onclick=()=>run(async()=>{
    const selection=[...model.context.selection],key=Object.hasOwn(button.dataset,'up')?'up':Object.hasOwn(button.dataset,'down')?'down':'remove',i=Number(button.dataset[key]);
    if(key==='remove'){selection.splice(i,1);await edit(selection);}else await edit(await model.reorder(i,i+(key==='up'?-1:1)));
  }));
  $('save-draft').onclick=()=>{const name=$('draft-name').value;run(async()=>{await model.patch({name});say('Draft saved · no Bag created.');});};
  $('bag-form').onsubmit=event=>{event.preventDefault();const button=$('create-bag');if(button.disabled)return;button.disabled=true;const name=$('draft-name').value;run(async()=>{try{await model.patch({name});const address=await model.createBag();await drawBag();say(`Saved “${name.trim()}” · ${model.value(address).discIds.length} exact copies. Reopen it below or reload.`);}finally{button.disabled=false;}});};
  document.querySelectorAll('[data-bag]').forEach(button=>button.onclick=()=>run(async()=>{const bag=model.value(button.dataset.bag);await model.patch({name:bag.name,selection:bag.versions.map(v=>v.address)});await drawBag();say(`Opened “${bag.name}”. Creating again keeps a new bag; the saved one stays unchanged.`);}));
}
function graphicPreview(graphic){
  const content=graphic?.svg??'<p class="empty">Your next exported graphic goes here.<br>Import a kept version or try the seeded example.</p>';
  return `<div id="preview" class="preview ${graphic&&previewBackground==='scene'?'preview-scene':''}">${content}</div>${graphic?`<label class="preview-setting">Preview background<select id="preview-background"><option value="scene" ${previewBackground==='scene'?'selected':''}>Newspaper tee shot</option><option value="grid" ${previewBackground==='grid'?'selected':''}>Transparency grid</option></select><span>Photo: <a href="https://commons.wikimedia.org/wiki/File:DSC_5610_(4526926931).jpg" target="_blank" rel="noopener noreferrer">bradleypjohnson</a> · <a href="https://creativecommons.org/licenses/by/2.0/" target="_blank" rel="noopener noreferrer">CC BY 2.0</a> · newsprint treatment · preview only</span></label>`:''}`;
}
function bindPreview(){
  const select=$('preview-background');
  if(select)select.onchange=()=>{previewBackground=select.value;$('preview').classList.toggle('preview-scene',previewBackground==='scene');};
}
async function drawCreate(){
  const competition=model.context.graphicsPurpose==='competition';
  $('app').innerHTML=`<nav class="purpose-tabs" aria-label="Graphic purpose"><button id="purpose-spotlight" aria-pressed="${!competition}">DiscSpotlight</button><button id="purpose-competition" aria-pressed="${competition}">DiscCompetition</button></nav><div id="competition-body"></div>`;
  for(const [id,purpose] of [['purpose-spotlight','spotlight'],['purpose-competition','competition']])$(id).onclick=()=>run(async()=>{await model.patch({graphicsPurpose:purpose});await drawCreate();});
  if(competition)return drawCompetition({model,run,say,preview:graphicPreview,bindPreview,redraw:drawCreate,publish:{mount:()=>active.name,offer:offerCapture,order:offerOrder}});
  await drawSpotlight();
}
async function offerCapture(capture){
  if(active.inspect().kind!=='interactive')return;
  const offers=JSON.parse(localStorage.getItem(mailbox)??'[]');
  if(!offers.some(c=>captureIdentity(c)===captureIdentity(capture)))localStorage.setItem(mailbox,JSON.stringify([...offers,capture]));
}
async function offerOrder(captures){
  if(active.inspect().kind!=='interactive')return;
  const offers=JSON.parse(localStorage.getItem(mailbox)??'[]'),ids=new Set(captures.map(captureIdentity));let index=0;
  localStorage.setItem(mailbox,JSON.stringify(offers.map(c=>ids.has(captureIdentity(c))?captures[index++]:c)));
}
async function drawSpotlight(){
  const context=model.context,design=context.design;
  result=await model.render(context.selectedDisc,design);
  const all=await rows(),selected=all.find(row=>row.address===context.selectedDisc);
  $('competition-body').innerHTML=intro('Give this disc a corner.','A small disc graphic over your video. Try it against a sample scene or the transparency grid.')+`<div class="workspace two"><aside class="panel"><h2>Choose your material</h2><button id="compare-cards" class="full">Explore 9 compositions</button><p class="caption">${esc(allCardStudies.find(item=>item.id===(design.study??defaultStudy)).name)}</p><label>Physical copy<select id="graphic-disc">${all.map(row=>`<option value="${esc(row.address)}" ${row.address===context.selectedDisc?'selected':''}>${esc(row.seed.manufacturer+' · '+row.seed.name+' · '+row.disc.plastic+' · '+row.disc.weight+' g')}</option>`).join('')}</select></label><div class="art">${art(selected)}</div><p class="notice">The disc’s facts and retained painting stay intact. These controls change this graphic’s design.</p><label>Canvas<select id="orientation"><option value="landscape" ${design.orientation==='landscape'?'selected':''}>Landscape · 1920 × 1080</option><option value="portrait" ${design.orientation==='portrait'?'selected':''}>Portrait · 1080 × 1920</option></select></label><label>Corner<select id="placement">${[['bottom-left','Bottom left'],['bottom-right','Bottom right'],['top-left','Top left'],['top-right','Top right']].map(([v,label])=>`<option value="${v}" ${v===design.placement?'selected':''}>${label}</option>`).join('')}</select></label><label>Canvas background<select id="frame"><option value="filled" ${design.frame==='filled'?'selected':''}>Solid background</option><option value="none" ${design.frame==='none'?'selected':''}>Transparent overlay</option></select></label></aside><section>${graphicPreview(result.graphic)}<p class="caption">${result.graphic.width} × ${result.graphic.height} · actual rendered SVG · ${design.frame==='none'?'transparent canvas · preview background will not export':'solid canvas background'} · ${esc((design.placement??'bottom-left').replace('-',' '))}</p></section><aside class="panel"><h2>Make it yours</h2><label>Title<input id="graphic-title" maxlength="80" value="${esc(design.title)}" placeholder="On the course"></label><label>Accent<input id="accent" type="color" value="${design.accent}"></label><label>Background color<input id="background" type="color" value="${design.background}"></label><label>Text<input id="foreground" type="color" value="${design.foreground}"></label><button id="keep-graphic" class="primary full">Keep for ExportGraphics</button><p class="caption">Keeps this exact graphic. Later design changes won’t change what you kept.</p><h3>${context.graphics.length} kept versions</h3><div class="saved">${context.graphics.map(address=>{const c=model.value(address);return `<button data-version="${esc(address)}">${esc(c.title)}<br><small>${c.graphic.width} × ${c.graphic.height} · ${c.hash.slice(0,8)}</small></button>`;}).join('')}</div></aside></div>`;
  bindPreview();
  $('compare-cards').onclick=()=>run(async()=>{
    say('Composing nine directions from this disc…');
    const candidates=await model.studyCards();
    $('study-cards').innerHTML=candidates.map(({study,graphic},i)=>`<button class="study-card" data-study="${esc(study.id)}" aria-label="Use ${esc(study.name)}" aria-pressed="${study.id===(model.context.design.study??defaultStudy)}"><span class="study-name">${i+1} · ${esc(study.name)}</span><img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(graphic.svg)}" alt="${esc(study.name)} card"><span class="study-note">${esc(study.note)}</span><span class="study-choice">${graphic.width} × ${graphic.height} · ${study.id===(model.context.design.study??defaultStudy)?'Current layout':'Try this layout'}</span></button>`).join('');
    $('card-study').showModal();
    $('study-cards').querySelectorAll('[data-study]').forEach(button=>button.onclick=()=>run(async()=>{
      await model.patch({design:{...model.context.design,study:button.dataset.study}});
      $('card-study').close();await drawCreate();say(`Trying ${allCardStudies.find(item=>item.id===button.dataset.study).name}. Keep it when you like it.`);
    }));
    say('Nine compositions ready. Choose a silhouette and try it over the video.');
  });
  $('graphic-disc').onchange=()=>{const selectedDisc=$('graphic-disc').value;run(async()=>{await model.patch({selectedDisc});await drawCreate();});};
  for(const id of ['orientation','frame','placement','accent','background','foreground','graphic-title'])$(id).onchange=()=>{const key=id==='graphic-title'?'title':id,next=$(id).value;run(async()=>{await model.patch({design:{...model.context.design,[key]:next}});await drawCreate();});};
  $('keep-graphic').onclick=()=>{const chosen=result;run(async()=>{
    const kept=await model.capture(chosen,active.name);
    if(active.inspect().kind==='interactive') {
      const offers=JSON.parse(localStorage.getItem(mailbox)??'[]');
      if(!offers.some(c=>captureIdentity(c)===captureIdentity(kept.capture)))localStorage.setItem(mailbox,JSON.stringify([...offers,kept.capture]));
      say('Kept. Open ExportGraphics in the Experience list and import your kept graphics.');
    } else say('Kept in this numbered test only; nothing was sent to your interactive export sandbox.');
    await drawCreate();
  });};
  document.querySelectorAll('[data-version]').forEach(button=>button.onclick=()=>run(async()=>{const capture=model.value(button.dataset.version);if(capture.competition){await model.patch({graphicsPurpose:'competition',competitionAddress:capture.source.material,design:capture.design});await drawCreate();return;}await model.patch({selectedDisc:capture.source.disc,design:{...capture.design,layout:currentLayout,placement:capture.design.placement??'bottom-left',frame:capture.design.layout?capture.design.frame:'none'}});await drawCreate();say('Reopened that kept design. Its original capture stays unchanged.');}));
}
async function drawExport(){
  const context=model.context,addresses=context.graphics;
  if(!addresses.includes(chosenCapture))chosenCapture=addresses.at(-1)??null;
  const capture=chosenCapture?model.value(chosenCapture):null;
  $('app').innerHTML=intro('Take the graphic with you.','Inspect the captured version, then download those pixels or their SVG source.')+`<div class="workspace two"><aside class="panel"><h2>Kept graphics</h2><button id="import-kept" class="primary full" ${active.inspect().kind==='test'?'disabled':''}>Import from CreateGraphics</button><button id="load-example" class="full">Make a new example</button><p class="caption">Kept graphics are snapshots. To see the current layout, import a new version or make a new example.</p><div class="saved">${addresses.map((address,i)=>{const c=model.value(address);return `<button data-capture="${esc(address)}" class="${address===chosenCapture?'selected':''}">${i+1}. ${esc(c.title)}<br><small>${c.graphic.width} × ${c.graphic.height} · ${c.hash.slice(0,8)}</small></button>`;}).join('')}</div></aside><section>${graphicPreview(capture?.graphic)}<p class="caption">${capture&&capture.design.layout!==currentLayout?'Earlier layout · retained snapshot. ':''}${capture?`${capture.graphic.width} × ${capture.graphic.height} · captured ${esc(capture.design.frame==='none'?'transparent overlay':'filled background')}`:'No graphic selected.'}</p></section><aside class="panel"><h2>Export image ${addresses.indexOf(chosenCapture)+1} of ${addresses.length}</h2><div class="controls"><button id="previous-capture" ${addresses.indexOf(chosenCapture)<=0?'disabled':''}>← Previous</button><button id="next-capture" ${addresses.indexOf(chosenCapture)>=addresses.length-1?'disabled':''}>Next image →</button></div>${capture?`<p><strong>${esc(capture.title)}</strong><br><small>SHA-256 · ${capture.hash.slice(0,16)}…</small></p>`:''}<label>Format<select id="format"><option value="png">PNG · image</option><option value="svg">SVG · editable vector</option></select></label><button id="download" class="primary full" ${capture?'':'disabled'}>Download graphic</button><p class="caption">Uses this capture. PNG is rasterized by this browser at the dimensions above.</p><h3>Export results</h3><div class="history">${context.exports.slice().reverse().map(address=>{const r=model.value(address);return `<article><strong>${esc(r.status)}</strong><br>${esc(r.format.toUpperCase())} · ${r.byteLength??0} bytes<br>${esc(r.filename??r.error)}<br><code>${esc(r.hash??'')}</code></article>`;}).join('')||'<small>No exports yet.</small>'}</div></aside></div>`;
  bindPreview();
  $('previous-capture').onclick=()=>run(async()=>{chosenCapture=addresses[addresses.indexOf(chosenCapture)-1];await drawExport();});
  $('next-capture').onclick=()=>run(async()=>{chosenCapture=addresses[addresses.indexOf(chosenCapture)+1];await drawExport();});
  $('import-kept').onclick=()=>run(async()=>{let count=0;for(const offer of JSON.parse(localStorage.getItem(mailbox)??'[]'))if(await model.importCapture(offer)){count++;chosenCapture=model.context.graphics.at(-1);}const offers=JSON.parse(localStorage.getItem(mailbox)??'[]'),rank=new Map(offers.map((c,i)=>[captureIdentity(c),i]));const ordered=model.context.graphics.filter(a=>rank.has(captureIdentity(model.value(a)))).sort((a,b)=>rank.get(captureIdentity(model.value(a)))-rank.get(captureIdentity(model.value(b))));let i=0;await model.patch({graphics:model.context.graphics.map(a=>rank.has(captureIdentity(model.value(a)))?ordered[i++]:a)});await drawExport();say(`${count} new captured graphic${count===1?'':'s'} imported. Existing versions preserved.`);});
  $('load-example').onclick=()=>run(async()=>{const graphic=await model.render(model.context.selectedDisc,model.context.design);const kept=await model.capture(graphic,active.name);chosenCapture=kept.address;await drawExport();say('Seeded Spotlight example · produced through the same card Calculations.');});
  document.querySelectorAll('[data-capture]').forEach(button=>button.onclick=()=>run(async()=>{chosenCapture=button.dataset.capture;await drawExport();}));
  $('download').onclick=()=>{const selected=capture,address=chosenCapture,format=$('format').value;run(async()=>{
    let record;
    try {
      const blob=format==='png'?await pngFromSvg(selected.graphic.svg,selected.graphic.width,selected.graphic.height):new Blob([selected.graphic.svg],{type:'image/svg+xml'});
      const hash=await sha256(blob),filename=`${String(addresses.indexOf(address)+1).padStart(3,'0')}-discstudio-${selected.title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${selected.graphic.width}x${selected.graphic.height}-${hash.slice(0,8)}.${format}`;
      record={status:'Bytes ready · download requested',capture:address,svgHash:selected.hash,format,width:selected.graphic.width,height:selected.graphic.height,byteLength:blob.size,hash,filename};
      downloadBlob(blob,filename);await model.recordExport(record);say(`${format.toUpperCase()} ready · ${blob.size.toLocaleString()} bytes. Download requested; your browser handles saving.`);
    } catch(error){await model.recordExport({status:'Failed',capture:address,svgHash:selected.hash,format,error:String(error)});throw error;}
    finally{await drawExport();}
  });};
}
$('title').textContent=config.title;document.title=config.title+' · sandbox';
$('new-test').onclick=()=>run(()=>open(owner.createTestRun(config.id,'studio').name));
$('session').onchange=()=>{const name=$('session').value;run(()=>open(name));};
$('inspect').onclick=()=>{$('values').textContent=pretty(inspect());$('address').value=active.name+'.'+model.contextAddress.slice(3);$('resolved').textContent='';$('inspection').showModal();};
$('lookup').onsubmit=event=>{event.preventDefault();try{$('resolved').textContent=pretty(model.pxc.get(localAddress(active.name,$('address').value)));}catch(error){$('resolved').textContent=String(error);}};
$('close').onclick=()=>$('inspection').close();
$('close-study').onclick=()=>$('card-study').close();
window.pxCubeExperience=Object.freeze({inspect,list:()=>owner.list(),current:()=>({name:active.name,kind:active.inspect().kind,surface:config.mode}),resolve:address=>model.pxc.get(localAddress(active.name,address))});
window.pxCubeDemo=Object.freeze({get model(){return model;},get busy(){return busy;},settled:()=>queue});
await run(()=>open(owner.openInteractive(config.id,'studio').name));
