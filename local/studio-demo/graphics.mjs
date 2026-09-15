import { defaultPresets, composeCard, composeOverlay, materializeOverlay } from './renderer/src/presentation.js';
import { cardsEffective, cardsApply, defaultCards } from './renderer/src/cards.js';
import { composeFrame } from './renderer/src/frames.js';
import { sha256 } from './renderer/src/media.js';
import { createBag, reorderBag } from './studio/upload-disc-to-shelf/bags.js';

export const designs = defaultPresets();
export const defaultDesign = Object.freeze({preset:'spotlight',orientation:'landscape',frame:'filled',accent:'#a6edda',background:'#162c39',foreground:'#f6f3e9',title:''});
export function graphicFields({disc, resolved}) {
  const fields = [
    {path:'disc.photo',type:'image',label:'Depiction',value:disc.depiction.src},
    {path:'disc.mold.manufacturer.name',label:'Manufacturer',value:resolved.manufacturer},
    {path:'disc.mold.name',label:'Mold',value:resolved.name},
    {path:'disc.nickname',label:'Nickname',value:disc.nickname},
  ];
  for(const key of ['speed','glide','turn','fade']) fields.push({path:`disc.mold.flight.${key}`,label:key,value:resolved[key],type:'number'});
  return fields;
}
export function graphicArt({disc,art}) {
  // The legacy card renderer calls its data-URL image carrier 'photo'. Studio's
  // retained art is already a self-contained URL, including nested palette SVGs.
  // Keep the actual depiction kind; do not repaint it or feed it to artInner().
  return {kind:'photo',src:art,sourceKind:disc.depiction.kind};
}
export function graphicDesign({design}) {
  if(!['spotlight','showcase','broadcast'].includes(design.preset)) throw Error('Choose a known design.');
  if(!['landscape','portrait'].includes(design.orientation)||!['filled','none'].includes(design.frame)) throw Error('Choose a known frame.');
  for(const color of ['accent','background','foreground']) if(!/^#[0-9a-f]{6}$/i.test(design[color])) throw Error('Design colors must be #rrggbb.');
  return {preset:designs[design.preset],tokens:{...defaultCards().global,accent:design.accent,background:design.background,foreground:design.foreground,sponsor:''}};
}
export const calculations = {
  'fn.studio.reorderSelection':({context,view,from,to})=>reorderBag({bag:createBag({id:'draft',name:context.name||'Draft',selection:context.selection,rows:view.rows}),discId:view.rows.find(row=>row.address===context.selection[from]).disc.id,toIndex:to}).versions.map(v=>v.address),
  'fn.studio.graphicFields':graphicFields,
  'fn.studio.graphicArt':graphicArt,
  'fn.studio.graphicDesign':graphicDesign,
  'fn.studio.cardTokens':({design,disc})=>cardsEffective({global:design.tokens,preset:design.preset,projectionName:'single',discId:disc.id}),
  'fn.studio.cardPreset':({design,effective})=>cardsApply({preset:design.preset,effective}),
  'fn.studio.card':composeCard,
  'fn.studio.frame':({design,tokens})=>composeFrame({spec:{orientation:design.orientation,presetId:design.frame,title:design.title},tokens:tokens.tokens}),
  'fn.studio.scene':({card,frame,design})=>composeOverlay({cards:{single:card},frame,layout:{orientation:design.orientation,arrangement:'row',anchor:'center',scale:1.5,gap:0}}),
  'fn.studio.graphic':materializeOverlay,
  'fn.studio.svgDigest':({graphic})=>sha256(graphic.svg),
  'fn.studio.capture':({graphic,design,disc,resolved,hash,source})=>({schema:'studio-graphic@1',hash,source,title:`${resolved.manufacturer} · ${resolved.name}`,graphic,design,specimen:{disc,resolved}}),
  'fn.studio.exportRecord':({capture,measurement})=>{if(capture.hash!==measurement.svgHash)throw Error('Export measurement names a different capture.');return measurement;},
};
