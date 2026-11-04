import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zuschnitt, dataUrlBytes } from '../js/foto.js';

// foto.js importiert ui.js (braucht document nur beim Aufruf), daher ist der Import im Test unkritisch.

test('Quadratischer Ausschnitt: Querformat mittig', () => {
  assert.deepEqual(zuschnitt(400, 200), { sx: 100, sy: 0, seite: 200 });
});

test('Quadratischer Ausschnitt: Hochformat mittig, Zoom und Verschiebung', () => {
  assert.deepEqual(zuschnitt(200, 400), { sx: 0, sy: 100, seite: 200 });
  const z = zuschnitt(400, 400, 2, 1, -1);
  assert.deepEqual(z, { sx: 200, sy: 0, seite: 200 });
});

test('Ausschnitt bleibt im Bild', () => {
  const z = zuschnitt(300, 200, 1, 5, 5);
  assert.ok(z.sx >= 0 && z.sx + z.seite <= 300 && z.sy >= 0 && z.sy + z.seite <= 200);
});

test('Größe aus data-URL', () => {
  assert.equal(dataUrlBytes('data:image/jpeg;base64,QUJD'), 3);
  assert.equal(dataUrlBytes('data:image/jpeg;base64,QUI='), 2);
});
