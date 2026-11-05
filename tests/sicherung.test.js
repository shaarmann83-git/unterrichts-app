import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xlsxLaden } from './hilfen-untis.js';
import { inDateitext, ausDateitext, objektVerschluesseln, objektEntschluesseln, schluesselVergessen, PBKDF2_ITERATIONEN } from '../js/krypto.js';
import { neueKlasse, neuesBuch, neuerTermin, neueDaltonAufgabe, buchHatFotos, klasseKopieren } from '../js/modell.js';
import { listeAnlegen, strichHinzu, zahlungHinzu, abhakSetzen } from '../js/listen.js';
import { alleAlsExcel, gesamtXlsx, gesamtCsv, gesamtTabelle } from '../js/excel.js';
import { gesamtPerson } from '../js/rechnen.js';

xlsxLaden();

/** Ein Notenbuch mit allem Möglichen drin (erfundene Daten). */
function vollesBuch({ mitFoto = false } = {}) {
  const a = neueKlasse({ klasse: 'TEST-A', lernfeldNr: '1', lernfeldBez: 'Testfeld', schuljahr: '2025/26' });
  a.schueler = a.schueler.slice(0, 3);
  [['Muster', 'Erika'], ['Beispiel', 'Max'], ['Probe', 'Sam']].forEach(([n, v], i) => { a.schueler[i].name = n; a.schueler[i].vorname = v; });
  const [p, q] = a.schueler;
  a.bereiche.duales = true;
  p.betrieb = { name: 'Firma Eins', ansprechperson: 'Frau Muster', telefon: '0123', email: 'a@b.de', notiz: 'n' };
  a.klassenarbeiten[0].aufgaben = [10, 10];
  a.klassenarbeiten[0].bezeichnungen = ['1', '2'];
  a.klassenarbeiten[0].datum = '2025-10-15';
  a.klassenarbeiten[0].ergebnisse[p.id] = { punkte: [8, 7], attest: false, sonstiges: 'Gut' };
  a.klassenarbeiten[0].teilnahme[q.id] = { status: 'attest-offen', nachschreibtermin: '2025-11-05' };
  const t = neuerTermin('2025-10-01', 'Gruppenarbeit');
  t.eintraege[p.id] = { note: 2, notiz: 'aktiv' };
  a.sonstige = [t];
  a.dalton.modus = 'einrechnen';
  const d = neueDaltonAufgabe('Dalton 1', '2025-09-01', '2025-09-08');
  d.eintraege[p.id] = { status: 'abgegeben', qualitaet: 'gut', selbststaendig: 'ja', notiz: 'ok' };
  a.dalton.aufgaben = [d];
  a.fehlzeiten = [{ id: 'f1', schuelerId: q.id, datum: '2025-10-15', datumBis: '2025-10-16', zeitVon: '07:30', zeitBis: '15:00', std: 0, min: 0, status: 'attest', grund: 'krank', quelle: 'untis-b', notiz: '', zaehltNicht: false }];
  const l1 = listeAnlegen(a, 'Material vergessen', 'strich');
  strichHinzu(l1, p.id, '2025-10-01');
  const l2 = listeAnlegen(a, 'Klassenfahrt', 'betrag');
  l2.soll = 100;
  zahlungHinzu(l2, p.id, 40, '2025-10-02');
  const l3 = listeAnlegen(a, 'Bericht', 'abhak');
  abhakSetzen(l3, q.id, true, '2025-10-03');
  a.stichtag = '2025-12-01';
  q.archiviert = { datum: '2025-11-01', grund: 'Wechsel' };
  if (mitFoto) {
    a.bereiche.fotos = true;
    p.foto = { daten: 'data:image/jpeg;base64,/9j/4AAQ' };
    p.fotoEinwilligung = { datum: '2025-09-01' };
  }
  const b = neueKlasse({ klasse: 'TEST-B', schuljahr: '2025/26' });
  b.schueler = b.schueler.slice(0, 1);
  b.schueler[0].name = 'Zweit';
  const buch = neuesBuch(a);
  buch.klassen.push(b);
  buch.einstellungen.untisDateien.push({ pruefsumme: 'abc', name: 'AbsenceList_20251020_0930.xls', zeit: '2025-10-20T10:00:00.000Z' });
  buch.gespeichertAm = '2025-10-20T10:00:00.000Z';
  return buch;
}

test('Sicherung: exportieren und wieder importieren ergibt identische Daten (ohne Passwort)', async () => {
  const buch = vollesBuch();
  const text = await inDateitext(buch, '');
  const zurueck = await ausDateitext(text, '');
  assert.deepEqual(zurueck, buch);
  // auch nach zweitem Durchlauf unverändert
  assert.deepEqual(await ausDateitext(await inDateitext(zurueck, ''), ''), buch);
});

test('Sicherung: identische Daten auch mit Passwort, Fotos eingeschlossen', async () => {
  const buch = vollesBuch({ mitFoto: true });
  assert.equal(buchHatFotos(buch), true);
  const text = await inDateitext(buch, 'sicher-123');
  assert.ok(!text.includes('Muster') && !text.includes('/9j/4AAQ'));
  assert.deepEqual(await ausDateitext(text, 'sicher-123'), buch);
});

test('Berechnungen sind nach der Sicherung gleich', async () => {
  const buch = vollesBuch();
  const zurueck = await ausDateitext(await inDateitext(buch, 'x'), 'x');
  for (const s of buch.klassen[0].schueler) {
    assert.deepEqual(gesamtPerson(zurueck.klassen[0], s.id), gesamtPerson(buch.klassen[0], s.id));
  }
});

test('Alles als Excel: je Klasse die Blätter, keine Fotos, Fehlzeiten und Dalton enthalten', () => {
  const buch = vollesBuch({ mitFoto: true });
  const X = globalThis.XLSX;
  const wb = X.read(alleAlsExcel(buch), { type: 'array' });
  const namen = wb.SheetNames;
  assert.ok(namen.some((n) => n.startsWith('TEST-A') && n.endsWith('Grunddaten')));
  for (const blatt of ['Klassenarbeiten', 'Sonstige Leistung', 'Dalton', 'Fehlzeiten', 'Eigene Listen', 'Gesamtübersicht']) {
    assert.ok(namen.some((n) => n.startsWith('TEST-A') && n.endsWith(blatt)), `Blatt ${blatt}`);
  }
  assert.ok(namen.some((n) => n.startsWith('TEST-B') && n.endsWith('Gesamtübersicht')));
  assert.ok(!namen.some((n) => n.startsWith('TEST-B') && n.endsWith('Dalton')), 'Dalton nur, wenn an');
  assert.equal(new Set(namen.map((n) => n.toLowerCase())).size, namen.length, 'Blattnamen sind eindeutig');
  assert.ok(namen.every((n) => n.length <= 31));
  const alles = JSON.stringify(namen.map((n) => X.utils.sheet_to_json(wb.Sheets[n], { header: 1 })));
  assert.ok(!alles.includes('data:image') && !alles.includes('/9j/4AAQ'), 'Fotos stehen nie im Excel');
  assert.ok(alles.includes('Firma Eins'), 'Betrieb ist enthalten');
  assert.ok(alles.includes('Zwischenstand zum 01.12.2025'), 'Stand ist erkennbar');
  const fz = X.utils.sheet_to_json(wb.Sheets[namen.find((n) => n.endsWith('Fehlzeiten') && n.startsWith('TEST-A'))], { header: 1 });
  assert.equal(fz.length, 2);
  assert.ok(fz[1].includes('entschuldigt mit Attest'));
});

test('Gesamtübersicht-Export: Fehlzeiten-Summen ja, Abwesenheitsgrund nie; Archivierte nur auf Wunsch; Betrieb-Spalten', () => {
  const k = vollesBuch().klassen[0];
  const csv = gesamtCsv(k);
  assert.ok(!csv.includes('krank'), 'Gesundheitsangabe nicht im Export');
  assert.ok(csv.startsWith('Zwischenstand zum 01.12.2025'), 'Stand in der ersten Zeile');
  assert.ok(csv.includes('Fehlstd. gesamt') && csv.includes('Betrieb'));
  assert.ok(!csv.includes('Beispiel'), 'archivierte Person ist standardmäßig nicht dabei');
  const mit = gesamtTabelle(k, { archiv: true });
  assert.ok(mit.zeilen.some((z) => z[1] === 'Beispiel'));
  assert.ok(mit.kopf.includes('Archiviert'));
  assert.ok(mit.zeilen.find((z) => z[1] === 'Beispiel').at(-1).startsWith('ja'));
  const ohne = gesamtTabelle(k, { fehlzeiten: false });
  assert.ok(!ohne.kopf.includes('Fehlstd. gesamt'));
  const x = globalThis.XLSX.read(gesamtXlsx(k), { type: 'array' });
  const zeilen = globalThis.XLSX.utils.sheet_to_json(x.Sheets['Gesamtübersicht'], { header: 1 });
  assert.ok(JSON.stringify(zeilen).includes('Zwischenstand zum 01.12.2025'));
  assert.ok(!JSON.stringify(zeilen).includes('krank'));
});

test('Ganzjahresnote wird im Export als solche beschriftet', () => {
  const k = vollesBuch().klassen[0];
  k.stichtag = '';
  assert.ok(!gesamtCsv(k).startsWith('Zwischenstand'));
  const x = globalThis.XLSX.read(gesamtXlsx(k), { type: 'array' });
  assert.ok(JSON.stringify(globalThis.XLSX.utils.sheet_to_json(x.Sheets['Gesamtübersicht'], { header: 1 })).includes('Ganzjahresnote'));
});

test('Kopierte Klasse enthält keine Fotos, Fehlzeiten, Dalton-Einträge', () => {
  const k = vollesBuch({ mitFoto: true }).klassen[0];
  const kopie = klasseKopieren(k);
  assert.equal(kopie.schueler.some((s) => s.foto), false);
  assert.equal(kopie.fehlzeiten.length, 0);
  assert.equal(kopie.dalton.aufgaben.length, 0);
});

// ---------- Arbeitskopie verschlüsseln (SPEC 8.9) ----------

test('Arbeitskopie: verschlüsseln und entschlüsseln, ohne Klartext', async () => {
  schluesselVergessen();
  const buch = vollesBuch({ mitFoto: true });
  const h = await objektVerschluesseln(buch, 'arbeitskopie-pw');
  const text = JSON.stringify(h);
  assert.ok(!text.includes('Muster') && !text.includes('TEST-A') && !text.includes('/9j/4AAQ'));
  assert.ok(h.kdf.iterationen >= 310000 && h.kdf.iterationen === PBKDF2_ITERATIONEN);
  assert.equal(h.kdf.hash, 'SHA-256');
  assert.deepEqual(await objektEntschluesseln(h, 'arbeitskopie-pw'), buch);
});

test('Arbeitskopie: falsches Passwort, veränderte Daten und schwache Verschlüsselung werden abgelehnt', async () => {
  schluesselVergessen();
  const h = await objektVerschluesseln({ a: 1 }, 'richtig');
  await assert.rejects(objektEntschluesseln(h, 'falsch'), /Falsches Passwort/);
  schluesselVergessen();
  const bytes = Buffer.from(h.daten, 'base64');
  bytes[3] ^= 1;
  await assert.rejects(objektEntschluesseln({ ...h, daten: bytes.toString('base64') }, 'richtig'), /Falsches Passwort|beschädigt/);
  await assert.rejects(objektEntschluesseln({ ...h, kdf: { ...h.kdf, iterationen: 1000 } }, 'richtig'), /schwache/);
});

test('Arbeitskopie: neuer IV je Speichern, gleiches Salt innerhalb einer Sitzung (Schlüssel wird wiederverwendet)', async () => {
  schluesselVergessen();
  const a = await objektVerschluesseln({ x: 1 }, 'pw');
  const t0 = Date.now();
  const b = await objektVerschluesseln({ x: 1 }, 'pw');
  assert.ok(Date.now() - t0 < 100, 'zweites Verschlüsseln braucht keine neue Schlüsselableitung');
  assert.notEqual(a.iv, b.iv);
  assert.equal(a.kdf.salt, b.kdf.salt);
  assert.notEqual(a.daten, b.daten);
  // anderes Passwort: neues Salt
  const c = await objektVerschluesseln({ x: 1 }, 'anderes');
  assert.notEqual(c.kdf.salt, a.kdf.salt);
});
