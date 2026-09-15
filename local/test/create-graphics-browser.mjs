import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { root } from '../run.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const latest = JSON.parse(fs.readFileSync(path.join(root, '.pxcube/latest.json')));
const site = path.join(root, latest.site);
const evidence = path.join(root, 'evidence/create-graphics');
fs.mkdirSync(evidence, { recursive: true });
const errors = [], checks = [];
const server = http.createServer((request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/PxCube/')) throw Error('prefix');
    const file = path.resolve(site, decodeURIComponent(pathname.slice('/PxCube/'.length)) || 'index.html');
    if (!file.startsWith(site + path.sep)) throw Error('outside artifact');
    const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}/PxCube/`;
  await page.goto(base);
  await page.locator('[data-tab="exp"]').click();
  await page.locator('button.card[data-id="create-graphics"]').click();
  const frame = page.frameLocator('#thing');
  await frame.locator('#status').filter({ hasText: 'Ready' }).waitFor();
  // The shared mount may legitimately resume the other CreateGraphics purpose.
  // Select the surface under test explicitly instead of depending on retained state.
  await frame.locator('#purpose-spotlight').click();
  await frame.locator('.create-workspace').waitFor();

  assert.equal(await frame.locator('.study-card').count(), 0, 'comparison stays closed until requested');
  assert.equal(await frame.locator('#preview svg').getAttribute('width'), '1920');
  assert.equal(await frame.locator('.create-workspace').count(), 1);
  assert.equal(await frame.locator('.step-kicker').count(), 3);
  const thumbBox = await frame.locator('.material-art .art').boundingBox();
  assert.ok(thumbBox && thumbBox.width <= 110 && thumbBox.height <= 110, `material thumbnail escaped its panel: ${JSON.stringify(thumbBox)}`);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await frame.locator('[data-create-step="choose"]').getAttribute('aria-selected'), 'true');
  assert.equal(await frame.locator('[data-create-panel].is-active').count(), 1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await frame.locator('#compare-cards').click();
  await frame.locator('#card-study[open]').waitFor();
  assert.equal(await frame.locator('#study-cards .study-card').count(), 9);
  assert.equal(await frame.locator('#study-cards .study-card img').count(), 9);
  assert.equal(await frame.locator('#card-study').evaluate(dialog => getComputedStyle(dialog).overflow), 'hidden');
  assert.equal(await frame.locator('#study-cards').evaluate(grid => getComputedStyle(grid).overflow), 'visible');
  const selected = frame.locator('#study-cards .study-card[aria-pressed="true"]');
  assert.equal(await selected.count(), 1);
  await page.screenshot({ path: path.join(evidence, 'comparison-nine.png') });
  checks.push('nine authentic rendered compositions are directly comparable in one viewport');

  await frame.locator('#study-cards .study-card').filter({ hasText: 'Crest' }).click();
  await frame.locator('#card-study').waitFor({ state: 'hidden' });
  await frame.locator('#preview svg').waitFor();
  await frame.locator('#graphic-title').waitFor();
  assert.equal(await frame.locator('.create-workspace').count(), 1);
  assert.equal(await frame.locator('#preview svg').getAttribute('width'), '1920');
  assert.match(await frame.locator('.choice-summary').textContent(), /Crest/);
  assert.equal(await frame.locator('#composition-size').inputValue(), 'full-width');
  await frame.locator('#placement').selectOption('bottom-center');
  await frame.locator('#composition-scale-nudge').selectOption('-5');
  await frame.locator('#composition-offset-x').selectOption('20');
  await frame.locator('#composition-offset-y').selectOption('-20');
  await frame.locator('#preview svg').waitFor();
  assert.match(await frame.locator('#preview svg').innerHTML(), /scale\(2\.565/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await frame.locator('.mobile-step-nav').count(), 1);
  assert.equal(await frame.locator('[data-create-step="verify"]').getAttribute('aria-selected'), 'true');
  assert.equal(await frame.locator('[data-create-panel].is-active').count(), 1);
  for (const step of ['choose', 'verify', 'finish', 'choose']) {
    await frame.locator(`[data-create-step="${step}"]`).click();
    assert.equal(await frame.locator(`[data-create-step="${step}"]`).getAttribute('aria-selected'), 'true');
    assert.equal(await frame.locator('[data-create-panel].is-active').count(), 1);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await frame.locator('#graphic-title').fill('On the course');
  await frame.locator('#graphic-title').dispatchEvent('change');
  await frame.locator('#preview svg').waitFor();
  assert.match(await frame.locator('#preview').textContent(), /On the course/);
  await frame.locator('#keep-graphic').click();
  await frame.locator('#status').filter({ hasText: 'Kept' }).waitFor();
  const inspected = await page.locator('#thing').evaluate(element => element.contentWindow.pxCubeExperience.inspect());
  assert.equal(inspected.captures.length, 1);
  assert.equal(inspected.captures[0].value.title, 'Discraft · Buzzz');
  await page.screenshot({ path: path.join(evidence, 'editor-kept.png') });
  checks.push('selected composition returns to a focused editor with live verification and explicit Keep');

  if (await page.locator('#control-drawer-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#control-drawer-toggle').click();
  await page.locator('#back').click();
  await page.locator('button.card[data-id="export-graphics"]').click();
  await frame.locator('#status').filter({ hasText: 'Ready' }).waitFor();
  assert.equal(await frame.locator('.export-workspace').count(), 1);
  await frame.locator('#import-kept').click();
  await frame.locator('#status').filter({ hasText: '1 new captured graphic' }).waitFor();
  assert.equal(await frame.locator('.export-list button').count(), 1);
  assert.equal(await frame.locator('#preview svg').getAttribute('width'), '1920');
  assert.match(await frame.locator('.export-facts').first().textContent(), /Capture SHA-256/);
  assert.match(await frame.locator('#filename-preview').textContent(), /1920x1080/);
  assert.match(await frame.locator('#format').inputValue(), /png/);
  assert.equal(await frame.locator('#download').isEnabled(), true);
  await page.screenshot({ path: path.join(evidence, 'export-focused.png') });
  checks.push('ExportGraphics keeps one capture, its facts, navigation, and explicit download choice in one viewport');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.equal(await frame.locator('#download').isVisible(), true);
  assert.equal(await frame.locator('.export-list').evaluate(node => getComputedStyle(node).overflow), 'visible');
  await page.screenshot({ path: path.join(evidence, 'export-mobile.png') });
  checks.push('mobile ExportGraphics keeps the selected preview and download boundary reachable without a nested scroll trap');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(evidence, 'browser-results.json'), JSON.stringify({ runId: latest.runId, checks, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ checks, errors }));
} catch (error) {
  fs.writeFileSync(path.join(evidence, 'browser-failure.json'), JSON.stringify({ checks, errors, error: error.stack }, null, 2) + '\n');
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
