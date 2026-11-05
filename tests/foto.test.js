import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zuschnitt, ganzBildZoom, dataUrlBytes } from '../js/foto.js';

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

test('Zuschnitt: ganzes Bild sichtbar statt abgeschnitten', () => {
  // Hochformat 300 × 400: bei Zoom 1 wird oben und unten abgeschnitten.
  const eng = zuschnitt(300, 400, 1, 0, 0);
  assert.equal(eng.seite, 300);
  assert.equal(eng.sy, 50);

  // „Ganzes Bild“ zeigt alles, der Ausschnitt ist größer als das Bild.
  const z = ganzBildZoom(300, 400);
  assert.equal(z, 0.75);
  const voll = zuschnitt(300, 400, z, 0, 0);
  assert.equal(voll.seite, 400);
  assert.equal(voll.sx, -50); // links und rechts bleibt Weiß
  assert.equal(voll.sy, 0);

  // Quadratische Bilder brauchen keinen Zoom.
  assert.equal(ganzBildZoom(500, 500), 1);
  const q = zuschnitt(500, 500, 1, 0, 0);
  assert.deepEqual([q.sx, q.sy, q.seite], [0, 0, 500]);

  // Verschieben bleibt in den Grenzen des Bildes.
  const rechts = zuschnitt(300, 400, 1, 1, 0);
  assert.equal(rechts.sx, 0);
  const unten = zuschnitt(300, 400, 1, 0, 1);
  assert.equal(unten.sy, 100);
});
