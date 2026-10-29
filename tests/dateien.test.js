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
  // Nur die optionale OneDrive-Synchronisation (js/onedrive.js) und die CSP in index.html dürfen Microsoft-Adressen nennen.
  const erlaubt = { 'js/onedrive.js': ['graph.microsoft.com', 'login.microsoftonline.com'], 'index.html': ['graph.microsoft.com', 'login.microsoftonline.com', '*.sharepoint.com', '*.1drv.com', '*.onedrive.com'] };
  for (const f of pruefen) {
    const text = readFileSync(join(wurzel, f), 'utf8');
    const treffer = [...text.matchAll(/https?:\/\/([^\s'"`/);]+)/g)].map((m) => m[1]).filter((h) => !h.startsWith('localhost'));
    for (const host of treffer) {
      assert.ok((erlaubt[f] || []).includes(host), `${f} enthält die externe Adresse ${host}`);
    }
  }
});

test('.gitignore blockiert Notendateien und Excel-Dateien', () => {
  const g = readFileSync(join(wurzel, '.gitignore'), 'utf8');
  for (const m of ['*.xlsx', '*.noten', '*.noten.json']) assert.ok(g.includes(m), m);
});
