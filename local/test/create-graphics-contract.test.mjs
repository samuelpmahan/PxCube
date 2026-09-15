import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const compositions = fs.readFileSync('local/studio-demo/compositions.mjs', 'utf8');
const app = fs.readFileSync('local/studio-demo/app.mjs', 'utf8');
const css = fs.readFileSync('local/studio-demo/style.css', 'utf8');

test('CreateGraphics exposes nine authored compositions and real rendered output', () => {
  const ids = [...compositions.matchAll(/\{id:'([^']+)',name:/g)].map(match => match[1]);
  assert.equal(ids.length, 9);
  assert.equal(new Set(ids).size, 9);
  assert.match(app, /Compare 9 compositions/);
  assert.match(app, /actual rendered SVG/);
  assert.doesNotMatch(app, /Add image|image placeholder/i);
  assert.doesNotMatch(compositions, /Add image|image placeholder/i);
});

test('CreateGraphics keeps selection, reversible controls, and explicit Keep in the task viewport', () => {
  for (const id of ['graphic-title', 'accent', 'background', 'foreground', 'orientation', 'placement', 'frame']) {
    assert.match(app, new RegExp(`id="${id}"`));
  }
  assert.match(app, /id="keep-graphic"[^>]*>Keep for ExportGraphics/);
  assert.match(app, /Live edits stay reversible until you keep it/);
  assert.match(app, /class="workspace two create-workspace"/);
  assert.match(app, /class="step-kicker">01 · choose/);
  assert.match(app, /class="step-kicker">02 · verify/);
  assert.match(app, /class="step-kicker">03 · finish/);
  assert.match(css, /\.create-workspace\{[^}]*grid-template-columns/);
  assert.match(css, /#card-study\{[^}]*overflow:hidden/);
  assert.match(css, /#study-cards\{[^}]*grid-template-rows:repeat\(3/);
  assert.match(css, /\.study-card\[aria-pressed=true\]/);
});
