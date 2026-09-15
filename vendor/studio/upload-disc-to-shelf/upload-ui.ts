import { initialDraft, seeds, flightFields, type Draft, type Depiction, type createExperience } from './model.ts';
import { plasticGuides } from './plastics.ts';
import { createDiscView } from './disc-view.ts';
import { recipeFromDraft, validatePaintRecipe, renderDepiction } from './paint-recipe.ts';
import { fuzzyMoldOptions } from './mold-search.ts';

// No store, persistence, sibling view or app boot is created by importing this module.
export async function mountUpload({ root, experience, onSaved = (_address: string) => {}, random = Math.random }: {
  root: ParentNode; experience: ReturnType<typeof createExperience>; onSaved?: (address: string) => void; random?: () => number;
}) {
const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
const input = (id: string) => $(id) as HTMLInputElement;
const discView = createDiscView(experience);
let depiction: Depiction = await experience.selectPainting(random);
let painting = depiction, photo: Depiction | null = null;
function resetPaintSeed() { input('paint-seed').value = String(recipeFromDraft(initialDraft(), painting).seed); }
function recipe(material: Draft) {
  if (!input('paint-seed').value.trim()) throw Error('Enter a painting seed.');
  const selected = experience.seedAt(material.mold);
  const label = input('customize-label').checked ? (input('paint-label').value.trim() || `${selected.manufacturer} · ${selected.name}`) : null;
  return validatePaintRecipe({ ...recipeFromDraft(material, painting), seed: Number(input('paint-seed').value), label });
}
let photoBusy = false;
const defaults = initialDraft();
type SeedOption = ReturnType<typeof experience.seedOptions>[number];
const seedLabel = ({ seed }: SeedOption) => `${seed.manufacturer} · ${seed.name}`;
let availableSeeds: SeedOption[] = [], visibleSeeds: SeedOption[] = [], activeSeed = -1;
function eligibleSeeds() { return experience.seedOptions(); }
function closeSeedChoices() {
  $('mold-options').hidden = true; input('mold-search').setAttribute('aria-expanded', 'false'); input('mold-search').removeAttribute('aria-activedescendant'); activeSeed = -1;
}
function renderSeedChoices(query = input('mold-search').value) {
  visibleSeeds = fuzzyMoldOptions(availableSeeds, query, seedLabel);
  $('mold-options').replaceChildren(...visibleSeeds.map((row, index) => {
    const option = document.createElement('div'); option.id = `mold-option-${index}`; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false'); option.textContent = seedLabel(row);
    option.addEventListener('pointerdown', event => { event.preventDefault(); chooseSeed(row); }); return option;
  }));
  $('mold-options').hidden = visibleSeeds.length === 0; input('mold-search').setAttribute('aria-expanded', String(visibleSeeds.length > 0)); activeSeed = -1;
}
function chooseSeed(row: SeedOption) {
  input('seed').value = row.address; input('mold-search').value = seedLabel(row); closeSeedChoices(); suggestPlastics(); preview();
  reviewIndex = experience.seedOptions().findIndex(option => option.address === row.address); showReview();
}
// Start with an honest empty composer. The mold input is the first decision;
// no catalog item or plastic should be implied before the user chooses one.
availableSeeds = eligibleSeeds();
input('mold-search').value = '';
input('seed').value = '';
const overrides = document.createElement('details');
overrides.innerHTML = '<summary>Flight numbers · this disc only</summary><p>Unchecked fields inherit from the mold. Check to specialize; checked + blank means unknown.</p>' + flightFields.map(field => `<label><span><input id="own-${field}" type="checkbox"> Own ${field}</span><input id="disc-${field}" aria-label="Disc ${field}" type="number" step="any" disabled></label>`).join('');
$('flight').after(overrides);
for (const field of flightFields) input(`own-${field}`).addEventListener('change', () => { input(`disc-${field}`).disabled = !input(`own-${field}`).checked; });
function draft(): Draft { return { mold: input('seed').value, nickname: input('nickname').value.trim(), plastic: input('plastic').value.trim(), weight: input('weight').value === '' ? null : Number(input('weight').value), Color1: input('Color1').value, Color2: input('Color2').value, paintMode: input('paint-mode').value as Draft['paintMode'], colorPainting: input('color-painting').checked,
  ...Object.fromEntries(flightFields.filter(field => input(`own-${field}`).checked).map(field => [field, input(`disc-${field}`).value === '' ? null : Number(input(`disc-${field}`).value)])) }; }
function preview() {
 try {
  const material = draft();
  if (!material.mold) {
   $('flight').textContent = '';
   $('depiction-name').textContent = '';
   $('preview').replaceChildren();
   input('plastic').disabled = true;
   input('save').disabled = true;
   return;
  }
  const resolved = experience.resolve(material);
  $('flight').textContent = `FLIGHT  ${flightFields.map(field => resolved[field] ?? '?').join(' / ')}`;
  for (const field of flightFields) input(`disc-${field}`).placeholder = String(experience.seedAt(material.mold)[field] ?? 'Unknown');
  $('depiction-name').textContent = depiction.name.replaceAll('-', ' ');
  input('color-painting').disabled = depiction.kind === 'photo';
  $('paint-help').textContent = depiction.kind === 'photo' ? 'Photos stay untouched; mode changes the backing only.' : '50/50 swaps palettes across the disc. Halo blends center into rim.';
  const customizeLabel = input('customize-label').checked;
  $('paint-label-controls').hidden = !customizeLabel; input('customize-label').setAttribute('aria-expanded', String(customizeLabel));
  (input('depiction-choice') as unknown as HTMLSelectElement).querySelector<HTMLOptionElement>('option[value="photo"]')!.disabled = !photo;
  input('depiction-choice').value = depiction.kind;
  const art = renderDepiction({ recipe: recipe(material), photo, choice: depiction.kind, seed: experience.seedAt(material.mold) });
  $('preview').replaceChildren(discView(material, depiction, art));
 } catch (error) { $('status').textContent = String(error); }
}
$('composer').addEventListener('input', event => { if (event.target !== $('depiction-choice')) preview(); });
function suggestPlastics() {
  if (!input('seed').value) {
   input('plastic').replaceChildren(new Option('Choose a mold first', ''));
   input('plastic').value = '';
   input('plastic').disabled = true;
   input('save').disabled = true;
   ($('plastic-source') as HTMLAnchorElement).hidden = true;
   return;
  }
  const seed = experience.seedAt(input('seed').value);
  const guide = plasticGuides[seed.manufacturer] ?? { values: [], source: '' };
  const preferred = input('plastic').value;
  const unavailable = guide.values.length === 0;
  input('plastic').replaceChildren(...['', ...guide.values].map(value => { const option = document.createElement('option'); option.value = value; option.textContent = value || (unavailable ? `Plastics not loaded for ${seed.manufacturer}` : 'Choose plastic'); return option; }));
  input('plastic').value = guide.values.includes(preferred) ? preferred : '';
  input('plastic').disabled = unavailable;
  updateSaveState();
  const link = $('plastic-source') as HTMLAnchorElement; link.href = guide.source; link.textContent = `${seed.manufacturer} plastic guide`; link.hidden = !guide.source;
}
function updateSaveState() {
 input('save').disabled = photoBusy || input('plastic').disabled || !input('seed').value || !input('plastic').value;
}
['change', 'input'].forEach(event => input('plastic').addEventListener(event, updateSaveState));
input('mold-search').addEventListener('focus', () => renderSeedChoices(''));
input('mold-search').addEventListener('input', () => {
  input('seed').value = '';
  const exact = availableSeeds.find(row => [row.seed.name, seedLabel(row)].some(value => value.toLocaleLowerCase() === input('mold-search').value.trim().toLocaleLowerCase()));
  if (exact) chooseSeed(exact); else { suggestPlastics(); renderSeedChoices(); preview(); }
});
input('mold-search').addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeSeedChoices(); return; }
  if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
  if (!visibleSeeds.length) return;
  if (event.key === 'Enter' && activeSeed < 0 && visibleSeeds.length === 1) activeSeed = 0;
  else if (event.key === 'ArrowDown') activeSeed = (activeSeed + 1) % visibleSeeds.length;
  else if (event.key === 'ArrowUp') activeSeed = (activeSeed - 1 + visibleSeeds.length) % visibleSeeds.length;
  if (event.key === 'Enter' && activeSeed >= 0) { event.preventDefault(); chooseSeed(visibleSeeds[activeSeed]); return; }
  if (activeSeed >= 0) {
    event.preventDefault(); root.querySelectorAll<HTMLElement>('#mold-options [role="option"]').forEach((option, index) => option.setAttribute('aria-selected', String(index === activeSeed)));
    input('mold-search').setAttribute('aria-activedescendant', `mold-option-${activeSeed}`);
  }
});
input('mold-search').addEventListener('blur', () => { setTimeout(() => { if (!input('seed').value) $('status').textContent = 'Choose a mold from the suggestions.'; closeSeedChoices(); }); });
$('shuffle').addEventListener('click', async () => { painting = await experience.selectPainting(random); depiction = painting; resetPaintSeed(); preview(); });
$('depiction-choice').addEventListener('change', () => { depiction = input('depiction-choice').value === 'photo' && photo ? photo : painting; preview(); });
$('photo').addEventListener('change', async () => {
  const file = input('photo').files?.[0]; if (!file) return;
  photoBusy = true; input('save').disabled = true; input('shuffle').disabled = true;
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 15_000_000) throw new Error('Choose a PNG, JPEG or WebP under 15 MB.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    photo = { kind: 'photo', name: file.name, src: canvas.toDataURL('image/webp', .86) }; depiction = photo;
    $('status').textContent = 'Photo prepared locally. The original file is unchanged.'; preview();
  } catch (error) { $('status').textContent = String(error); }
  finally { photoBusy = false; updateSaveState(); input('shuffle').disabled = false; }
});
$('composer').addEventListener('submit', async event => {
  event.preventDefault(); if (photoBusy || input('save').disabled) return;
  input('save').disabled = true;
  try {
    const material = draft();
    const address = await experience.save(material, depiction, { recipe: recipe(material), photo });
    onSaved(address); $('status').textContent = `Saved and read back: ${address}. Add another when you’re ready.`;
    input('nickname').value = ''; input('photo').value = '';
    for (const field of flightFields) { input(`own-${field}`).checked = false; input(`disc-${field}`).value = ''; input(`disc-${field}`).disabled = true; }
    painting = await experience.selectPainting(random); depiction = painting; photo = null;
    input('customize-label').checked = false; input('paint-label').value = ''; resetPaintSeed(); preview();
  } catch (error) { $('status').textContent = `Not saved: ${String(error)}`; }
  finally { updateSaveState(); }
});
input('Color1').value = defaults.Color1; input('Color2').value = defaults.Color2; resetPaintSeed(); suggestPlastics(); preview();
// The review carousel may begin at the first catalog row, but it must not
// select that row in the compose form.
let reviewIndex = 0;
const reviewFields = ['manufacturer', 'mold', 'speed', 'glide', 'turn', 'fade'];
function showReview() {
  const options = experience.seedOptions(), { seed } = options[reviewIndex];
  $('review-progress').textContent = `${reviewIndex + 1} / ${options.length}`;
  $('review-name').textContent = `${seed.manufacturer} · ${seed.name}`;
  const values = [seed.manufacturer, seed.name, ...flightFields.map(field => seed[field])];
  reviewFields.forEach((field, i) => { input(`review-${field}`).value = values[i] == null ? '' : String(values[i]); input(`review-${field}`).readOnly = true; });
  let provenance = root.querySelector<HTMLElement>('#review-provenance');
  if (!provenance) { provenance = document.createElement('p'); provenance.id = 'review-provenance'; $('review-name').after(provenance); }
  const link = document.createElement('a'); link.href = seed.source ?? '#'; link.target = '_blank'; link.rel = 'noopener'; link.textContent = seed.sourceKind ?? 'Source';
  provenance.replaceChildren(link, document.createTextNode(` · ${seed.reviewStatus}. ${seed.conflicting ? 'Sources disagree: ' + seed.observations?.map(o => o.flight.map(n => n ?? '?').join('/')).join(' versus ') : ''}`));
  $('review-apply').hidden = true; input('review-yes').disabled = false; input('review-no').disabled = false;
}
async function review(verdict: 'confirmed' | 'corrected') {
  input('review-yes').disabled = true; input('review-apply').disabled = true;
  const oldAddress = experience.seedOptions()[reviewIndex].address;
  try {
    const correction = { manufacturer: input('review-manufacturer').value.trim(), name: input('review-mold').value.trim(), ...Object.fromEntries(flightFields.map(field => [field, input(`review-${field}`).value === '' ? null : Number(input(`review-${field}`).value)])) };
    const address = await experience.reviewSeed(oldAddress, verdict, correction);
    availableSeeds = eligibleSeeds();
    if (input('seed').value === oldAddress) {
      const selected = availableSeeds.find(option => option.address === address);
      if (selected) { input('seed').value = selected.address; input('mold-search').value = seedLabel(selected); closeSeedChoices(); }
    }
    suggestPlastics(); preview();
    $('review-status').textContent = `${verdict === 'confirmed' ? 'Confirmed' : 'Corrected'} ${correction.name}. ${reviewIndex === seeds.length - 1 ? 'Pass complete; back to the first seed.' : 'Next mold.'}`;
    reviewIndex = (reviewIndex + 1) % experience.seedOptions().length; showReview();
  } catch (error) { $('review-status').textContent = String(error); }
  finally { input('review-yes').disabled = !$('review-apply').hidden; input('review-apply').disabled = false; }
}
$('review-yes').addEventListener('click', () => review('confirmed'));
$('review-no').addEventListener('click', () => { reviewFields.forEach(field => { input(`review-${field}`).readOnly = false; }); $('review-apply').hidden = false; input('review-yes').disabled = true; input('review-no').disabled = true; input('review-speed').focus(); });
$('seed-review').addEventListener('submit', event => { event.preventDefault(); review('corrected'); });
showReview();
['speed', 'glide', 'turn', 'fade'].forEach(field => { input(`review-${field}`).required = false; input(`review-${field}`).placeholder = 'Unknown'; });

return { refresh: preview };
}
