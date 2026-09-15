import test from 'node:test';
import assert from 'node:assert/strict';
import { photoCropPlacement } from './upload-ui.ts';

const centered = { positionX: 0, positionY: 0, zoom: 1, scaleX: 1, scaleY: 1 };

test('portrait and landscape photos cover a square crop without distortion', () => {
  assert.deepEqual(photoCropPlacement(600, 1200, 600, centered), { x: 0, y: -300, width: 600, height: 1200 });
  assert.deepEqual(photoCropPlacement(1200, 600, 600, centered), { x: -300, y: 0, width: 1200, height: 600 });
  assert.deepEqual(photoCropPlacement(600, 600, 600, centered), { x: 0, y: 0, width: 600, height: 600 });
});

test('position moves only through available crop overflow', () => {
  assert.deepEqual(photoCropPlacement(1200, 600, 600, { ...centered, positionX: 1 }), { x: -600, y: 0, width: 1200, height: 600 });
  assert.deepEqual(photoCropPlacement(1200, 600, 600, { ...centered, positionX: -1 }), { x: 0, y: 0, width: 1200, height: 600 });
});

test('zoom and modest independent stretch remain bounded and keep the crop covered', () => {
  const placement = photoCropPlacement(800, 600, 600, { positionX: 4, positionY: -4, zoom: 9, scaleX: .2, scaleY: 8 });
  assert.ok(placement.width >= 600);
  assert.ok(placement.height >= 600);
  assert.ok(placement.x + placement.width >= 600);
  assert.ok(placement.y + placement.height >= 600);
});

test('invalid source dimensions refuse preparation', () => {
  assert.throws(() => photoCropPlacement(0, 600, 600, centered), /positive/);
});
