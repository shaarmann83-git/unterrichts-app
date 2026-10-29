import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inDateitext, ausDateitext, istVerschluesselt, PBKDF2_ITERATIONEN } from '../js/krypto.js';
import { neueDaten } from '../js/modell.js';

function beispiel() {
  const d = neueDaten({ klasse: 'TEST-A', schuljahr: '2025/26' });
  d.schueler[0].name = 'Muster';
  d.schueler[0].vorname = 'Erika';
  return d;
}

test('Ohne Passwort: Klartext-JSON, Hin und Zurück', async () => {
  const d = beispiel();
  const text = await inDateitext(d, '');
  assert.equal(istVerschluesselt(text), false);
  assert.deepEqual(await ausDateitext(text, ''), d);
});

test('Mit Passwort: verschlüsselt, Name nicht im Klartext, Hin und Zurück', async () => {
  const d = beispiel();
  const text = await inDateitext(d, 'geheim-123');
  assert.equal(istVerschluesselt(text), true);
  assert.ok(!text.includes('Muster'));
  const huelle = JSON.parse(text);
  assert.equal(huelle.kdf.name, 'PBKDF2');
  assert.equal(huelle.kdf.hash, 'SHA-256');
  assert.ok(huelle.kdf.iterationen >= 310000);
  assert.equal(PBKDF2_ITERATIONEN >= 310000, true);
  assert.deepEqual(await ausDateitext(text, 'geheim-123'), d);
});

test('Zufälliges Salt und IV bei jedem Speichern', async () => {
  const d = beispiel();
  const a = JSON.parse(await inDateitext(d, 'x'));
  const b = JSON.parse(await inDateitext(d, 'x'));
  assert.notEqual(a.kdf.salt, b.kdf.salt);
  assert.notEqual(a.iv, b.iv);
});

test('Falsches oder fehlendes Passwort wird abgelehnt', async () => {
  const text = await inDateitext(beispiel(), 'richtig');
  await assert.rejects(ausDateitext(text, 'falsch'), /Falsches Passwort/);
  await assert.rejects(ausDateitext(text, ''), /passwortgeschützt/);
});

test('Veränderte Datei wird erkannt', async () => {
  const huelle = JSON.parse(await inDateitext(beispiel(), 'pw'));
  const bytes = Buffer.from(huelle.daten, 'base64');
  bytes[5] ^= 1;
  huelle.daten = bytes.toString('base64');
  await assert.rejects(ausDateitext(JSON.stringify(huelle), 'pw'), /Falsches Passwort|beschädigt/);
});

test('Zu wenige PBKDF2-Runden in der Datei werden abgelehnt', async () => {
  const huelle = JSON.parse(await inDateitext(beispiel(), 'pw'));
  huelle.kdf.iterationen = 1000;
  await assert.rejects(ausDateitext(JSON.stringify(huelle), 'pw'), /schwache/);
});

test('Fremde Datei wird verständlich abgelehnt', async () => {
  await assert.rejects(ausDateitext('{"a":1}', ''), /keine Notendatei/);
  await assert.rejects(ausDateitext('kein json', ''), /keine gültige/);
});
