import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const wurzel = new URL('..', import.meta.url).pathname;

test('Offline-Dienst listet alle JS-Dateien und Bibliotheken der App', () => {
  const sw = readFileSync(join(wurzel, 'sw.js'), 'utf8');
  const dateien = [];
  for (const ordner of ['js', 'js/ansichten']) {
    for (const f of readdirSync(join(wurzel, ordner))) if (f.endsWith('.js')) dateien.push(`${ordner}/${f}`);
  }
  for (const f of dateien) assert.ok(sw.includes(`'${f}'`), `${f} fehlt in sw.js`);
  for (const f of ['index.html', 'style.css', 'manifest.webmanifest', 'lib/xlsx.full.min.js']) {
    assert.ok(sw.includes(`'${f}'`), `${f} fehlt in sw.js`);
    assert.ok(existsSync(join(wurzel, f)), `${f} existiert nicht`);
  }
});

test('Keine Verweise auf Fremdserver in der App', () => {
  const pruefen = ['index.html', 'style.css', 'sw.js', 'manifest.webmanifest'];
  for (const ordner of ['js', 'js/ansichten']) {
    for (const f of readdirSync(join(wurzel, ordner))) if (f.endsWith('.js')) pruefen.push(`${ordner}/${f}`);
  }
  for (const f of pruefen) {
    const text = readFileSync(join(wurzel, f), 'utf8');
    assert.ok(!/https?:\/\/(?!localhost)/.test(text), `${f} enthält eine externe Adresse`);
  }
});

test('.gitignore blockiert Notendateien und Excel-Dateien', () => {
  const g = readFileSync(join(wurzel, '.gitignore'), 'utf8');
  for (const m of ['*.xlsx', '*.noten', '*.noten.json']) assert.ok(g.includes(m), m);
});
