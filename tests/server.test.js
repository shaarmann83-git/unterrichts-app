import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { notenServer } from '../server/server.mjs';
import { serverClient } from '../js/server-ort.js';
import { onedriveOrt } from '../js/onedrive.js';
import { SyncKonflikt, syncStarten, syncLaden, syncHochladen, syncFremdGeaendert } from '../js/sync.js';
import { inDateitext, ausDateitext } from '../js/krypto.js';
import { neueKlasse, neuesBuch } from '../js/modell.js';

const SCHLUESSEL = 'test-schluessel-0123456789';

async function starten() {
  const daten = await mkdtemp(join(tmpdir(), 'notenserver-'));
  const server = notenServer({ schluessel: SCHLUESSEL, daten });
  await new Promise((fertig) => server.listen(0, '127.0.0.1', fertig));
  const basis = `http://127.0.0.1:${server.address().port}/`;
  return { daten, basis, client: (schluessel = SCHLUESSEL) => serverClient({ schluessel, basis: `${basis}api/` }), stopp: async () => { await new Promise((f) => server.close(f)); await rm(daten, { recursive: true, force: true }); } };
}

test('Server: ohne Schlüssel oder mit zu kurzem Schlüssel startet er nicht', () => {
  assert.throws(() => notenServer({ schluessel: '', daten: '/tmp/x' }), /Zugangsschlüssel/);
  assert.throws(() => notenServer({ schluessel: 'kurz', daten: '/tmp/x' }), /Zugangsschlüssel/);
});

test('Server: falscher Zugangsschlüssel wird abgewiesen', async () => {
  const s = await starten();
  try {
    await assert.rejects(s.client('falscher-schluessel-xxxxxxxx').anmelden(), /Zugangsschlüssel/);
    await assert.rejects(s.client('falscher-schluessel-xxxxxxxx').liste(''), /Zugangsschlüssel/);
    await s.client().anmelden();
  } finally { await s.stopp(); }
});

test('Server: speichern, laden, Konflikt, fremde Änderung erkennen (wie bei OneDrive)', async () => {
  const s = await starten();
  try {
    const a = syncStarten(onedriveOrt(s.client(), 'Notenbuch_2026-27.noten'));
    assert.equal(await syncLaden(a), null);
    await syncHochladen(a, 'v1');
    await syncHochladen(a, 'v2');
    const b = syncStarten(onedriveOrt(s.client(), 'Notenbuch_2026-27.noten')); // zweites Gerät
    assert.equal((await syncLaden(b)).text, 'v2');
    await syncHochladen(b, 'v3 vom zweiten Gerät');
    assert.equal(await syncFremdGeaendert(a), true);
    await assert.rejects(syncHochladen(a, 'v3 vom ersten Gerät'), SyncKonflikt);
    assert.equal((await syncLaden(a)).text, 'v3 vom zweiten Gerät', 'nichts überschrieben');
    // Datei existiert schon, hier aber unbekannt: ebenfalls Konflikt
    await assert.rejects(syncHochladen(syncStarten(onedriveOrt(s.client(), 'Notenbuch_2026-27.noten')), 'neu'), SyncKonflikt);
    // Zwei Uploads gleichzeitig vom selben Gerät
    await syncLaden(a);
    await Promise.all([syncHochladen(a, 'v4'), syncHochladen(a, 'v5')]);
    assert.equal((await syncLaden(b)).text, 'v5');
  } finally { await s.stopp(); }
});

test('Server: Liste, Unterordner für Sicherungen, Löschen', async () => {
  const s = await starten();
  try {
    const c = s.client();
    const bytes = (t) => new TextEncoder().encode(t);
    await c.hochladen('A.noten', bytes('a'));
    await c.hochladen('Sicherungen/A_2026-11-17.noten', bytes('sicherung'));
    assert.deepEqual((await c.liste('')).map((d) => d.name), ['A.noten']);
    assert.deepEqual((await c.liste('Sicherungen')).map((d) => d.name), ['A_2026-11-17.noten']);
    assert.deepEqual(await c.liste('Gibt-es-nicht'), []);
    assert.equal(await (await c.lesen('Sicherungen/A_2026-11-17.noten')).text(), 'sicherung');
    await c.loeschen('Sicherungen/A_2026-11-17.noten');
    assert.equal(await c.lesen('Sicherungen/A_2026-11-17.noten'), null);
    assert.equal(await c.meta('Fehlt.noten'), null);
  } finally { await s.stopp(); }
});

test('Server: keine Pfade außerhalb des Datenordners, nur .noten-Dateien', async () => {
  const s = await starten();
  try {
    const kopf = { Authorization: `Bearer ${SCHLUESSEL}` };
    for (const weg of ['datei/..%2F..%2Fetc%2Fpasswd', 'datei/..%2Fx.noten', 'datei/a%2Fb%2Fc.noten', 'datei/x.txt', 'datei/.versteckt.noten', 'datei/%5C..%5Cx.noten']) {
      const a = await fetch(`${s.basis}api/${weg}`, { method: 'PUT', headers: kopf, body: 'x' });
      assert.equal(a.status, 400, weg);
    }
    assert.deepEqual(await readdir(s.daten), []);
    assert.equal((await fetch(`${s.basis}api/dateien?ordner=..`, { headers: kopf })).status, 400);
  } finally { await s.stopp(); }
});

test('Server: liefert die App aus, aber weder Daten noch Quelltext des Servers', async () => {
  const s = await starten();
  try {
    const start = await fetch(s.basis);
    assert.equal(start.status, 200);
    assert.match(await start.text(), /Notenverwaltung/);
    assert.equal((await fetch(`${s.basis}js/app.js`)).status, 200);
    for (const weg of ['server/server.mjs', 'daten/A.noten', 'tests/sync.test.js', 'docs/SPEC.md', '.git/config', 'package.json', 'js/..%2Fpackage.json', '%2e%2e/%2e%2e/etc/passwd']) {
      assert.equal((await fetch(s.basis + weg)).status, 404, weg);
    }
  } finally { await s.stopp(); }
});

test('Server: bekommt nur verschlüsselte Inhalte zu sehen', async () => {
  const s = await starten();
  try {
    const k = neueKlasse({ klasse: 'TEST-A' });
    k.schueler[0].name = 'Geheimname';
    const buch = neuesBuch(k);
    const sync = syncStarten(onedriveOrt(s.client(), 'Geheim.noten'));
    await syncHochladen(sync, await inDateitext(buch, 'pw-123'));
    const { readFile } = await import('node:fs/promises');
    const roh = await readFile(join(s.daten, 'Geheim.noten'), 'utf8');
    assert.ok(!roh.includes('Geheimname') && !roh.includes('TEST-A'));
    const zurueck = await ausDateitext((await syncLaden(sync)).text, 'pw-123');
    assert.equal(zurueck.klassen[0].schueler[0].name, 'Geheimname');
  } finally { await s.stopp(); }
});
