import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  neueKlasse, neuesBuch, pruefeBuch, pruefeKlasse, klasseKopieren, aktiveSchueler, archivierteSchueler, fachZeile, UNTERSCHRIFTEN_STANDARD,
  neuerTermin, neueDaltonAufgabe, buchHatFotos, dateiname, FORMAT_VERSION,
  neueKlassenarbeit, aufgabenGruppen, aufgabenTeile, spaltenName, gruppeHoechst, gruppeErreicht,
} from '../js/modell.js';
import { ausDateitext, inDateitext } from '../js/krypto.js';
import { gesamtPerson, ergebnisKA, notenspiegel } from '../js/rechnen.js';

/** Eine Datei, wie Stufe 1 sie geschrieben hat: version 1, die Datei ist selbst die Klasse. */
function stufe1Datei() {
  return {
    format: 'noten',
    version: 1,
    dokumentId: 'abc123',
    gespeichertAm: '2025-10-01T10:00:00.000Z',
    kopf: { klasse: 'ALT-1', lernfeldNr: '2', lernfeldBez: 'Altes Lernfeld', schuljahr: '2024/25' },
    gewichtSchriftlich: 60,
    schueler: [{ id: 's1', name: 'Muster', vorname: 'Erika', geschlecht: 'w', geburtstag: '', volljaehrig: false }],
    klassenarbeiten: [{ id: 'k1', datum: '2024-11-05', schwerpunkte: 'X', gewicht: 1, aufgaben: [15, 15, 15], ergebnisse: { s1: { punkte: [11, 11, 11], attest: false, sonstiges: '' } } }],
    sonstige: [{ id: 't1', datum: '2024-10-01', stichwort: '', gewicht: 1, eintraege: { s1: { note: 2, notiz: '' } } }],
  };
}

test('Stufe-1-Datei wird in ein Notenbuch mit einer Klasse umgewandelt', async () => {
  const buch = await ausDateitext(JSON.stringify(stufe1Datei()), '');
  assert.equal(buch.version, FORMAT_VERSION);
  assert.equal(buch.dokumentId, 'abc123');
  assert.equal(buch.klassen.length, 1);
  const k = buch.klassen[0];
  assert.equal(k.kopf.klasse, 'ALT-1');
  assert.equal(k.gewichtSchriftlich, 60);
  assert.equal(k.schueler[0].name, 'Muster');
  assert.equal(k.schueler[0].untisId, '');
  assert.equal(k.dalton.modus, 'aus');
  assert.deepEqual(k.fehlzeiten, []);
  assert.equal(k.klassenarbeiten[0].aufgaben.length, 3);
  assert.deepEqual(k.klassenarbeiten[0].teilnahme, {});
  // Die Noten sind unverändert: 33/45 = 73,3 %, sL 2,0 = 85,5 %, 60/40
  const g = gesamtPerson(k, 's1');
  assert.equal(g.kaProzente[0], 73.3);
  assert.ok(Math.abs(g.gesamtProzent - (73.3 * 0.6 + 85.5 * 0.4)) < 1e-9);
  // Dateiformat-Version und Umwandlung bleiben beim erneuten Speichern erhalten
  const text = await inDateitext(buch, '');
  assert.equal(JSON.parse(text).version, 2);
  assert.equal(JSON.parse(text).klassen.length, 1);
});

test('Umwandlung ist wiederholbar (Notenbuch bleibt Notenbuch)', () => {
  const einmal = pruefeBuch(stufe1Datei());
  const zweimal = pruefeBuch(JSON.parse(JSON.stringify(einmal)));
  assert.deepEqual(zweimal, einmal);
});

test('Neuere Dateiversion und fremdes Format werden abgelehnt', () => {
  assert.throws(() => pruefeBuch({ format: 'noten', version: 99 }), /neueren Version/);
  assert.throws(() => pruefeBuch({ format: 'x' }), /keine Notendatei/);
});

test('Klasse kopieren: Schülerliste und Einstellungen ja, Noten, Fehlzeiten, Dalton-Einträge nein', () => {
  const k = pruefeBuch(stufe1Datei()).klassen[0];
  k.dalton.modus = 'einrechnen';
  k.dalton.aufgaben.push(neueDaltonAufgabe('Aufgabe 1'));
  k.dalton.aufgaben[0].eintraege.s1 = { status: 'abgegeben', qualitaet: 'gut' };
  k.fehlzeiten.push({ id: 'f1', schuelerId: 's1', datum: '2025-01-01', status: 'offen' });
  k.listen.push({ id: 'l1', name: 'Material', art: 'strich', ausgeblendet: false, soll: 0, eintraege: { s1: [{ datum: '2025-01-01' }] } });
  k.schueler[0].foto = { daten: 'data:image/jpeg;base64,AAAA' };
  const kopie = klasseKopieren(k);
  assert.notEqual(kopie.id, k.id);
  assert.equal(kopie.kopf.lernfeldBez, 'Altes Lernfeld');
  assert.equal(kopie.gewichtSchriftlich, 60);
  assert.equal(kopie.schueler.length, 1);
  assert.equal(kopie.schueler[0].name, 'Muster');
  assert.notEqual(kopie.schueler[0].id, 's1');
  assert.equal(kopie.dalton.modus, 'einrechnen');
  assert.deepEqual(kopie.dalton.aufgaben, []);
  assert.deepEqual(kopie.fehlzeiten, []);
  assert.deepEqual(kopie.sonstige, []);
  assert.deepEqual(kopie.klassenarbeiten[0].ergebnisse, {});
  assert.equal(kopie.klassenarbeiten[0].aufgaben.length, 3);
  assert.equal(kopie.listen.length, 1);
  assert.deepEqual(kopie.listen[0].eintraege, {});
  assert.equal(kopie.schueler[0].foto, null);
  // Original bleibt unverändert
  assert.equal(k.dalton.aufgaben.length, 1);
  assert.equal(k.schueler[0].foto.daten.length > 0, true);
});

test('Dateiname und Fotos erkennen', () => {
  const k1 = neueKlasse({ klasse: 'FIA 25', schuljahr: '2025/26' });
  const buch = neuesBuch(k1);
  assert.equal(dateiname(buch), 'FIA-25_2025-26.noten');
  buch.klassen.push(neueKlasse({ klasse: 'FIA 26', schuljahr: '2025/26' }));
  assert.equal(dateiname(buch), 'Notenbuch_2025-26.noten');
  assert.equal(buchHatFotos(buch), false);
  buch.klassen[1].schueler[0].foto = { daten: 'x' };
  assert.equal(buchHatFotos(buch), true);
});

test('Archivieren und Wiederherstellen ändert keine Noten (SPEC 8.15)', () => {
  const k = pruefeBuch(stufe1Datei()).klassen[0];
  k.schueler.push({ ...k.schueler[0], id: 's2', name: 'Beispiel', vorname: 'Max' });
  k.klassenarbeiten[0].ergebnisse.s2 = { punkte: [5, 5, 5], attest: false, sonstiges: '' };
  const vorher = gesamtPerson(k, 's1');
  const spiegelVorher = notenspiegel(k.klassenarbeiten[0], aktiveSchueler(k));
  assert.equal(aktiveSchueler(k).length, 2);
  k.schueler[0].archiviert = { datum: '2025-02-01', grund: 'Klassenwechsel' };
  assert.equal(aktiveSchueler(k).length, 1);
  assert.equal(archivierteSchueler(k).length, 1);
  // Daten der archivierten Person bleiben erhalten und rechnen gleich
  assert.deepEqual(gesamtPerson(k, 's1'), vorher);
  assert.equal(ergebnisKA(k.klassenarbeiten[0], 's1').note, 3);
  // Notenspiegel ohne die archivierte Person
  assert.equal(notenspiegel(k.klassenarbeiten[0], aktiveSchueler(k)).gesamt, 1);
  k.schueler[0].archiviert = null;
  assert.deepEqual(notenspiegel(k.klassenarbeiten[0], aktiveSchueler(k)), spiegelVorher);
  assert.deepEqual(gesamtPerson(k, 's1'), vorher);
});

test('Leeres Notenbuch: Dateiname nach Schuljahr, Klassen später im Notenbuch', () => {
  const buch = neuesBuch(null, '2026/27');
  assert.equal(buch.klassen.length, 0);
  assert.equal(dateiname(buch), 'Notenbuch_2026-27.noten');
  buch.klassen.push(neueKlasse({ klasse: 'WAK1-1', schuljahr: '2026/27' }));
  assert.equal(dateiname(buch), 'WAK1-1_2026-27.noten');
  assert.equal(neuesBuch(null).schuljahr, '');
});

test('Bezeichnung und Unterschriftszeilen je Klasse frei wählbar', () => {
  const lf = neueKlasse({ klasse: 'WKM1-2', lernfeldNr: '2', lernfeldBez: 'Arbeitsraum', schuljahr: '2026/27' });
  assert.equal(fachZeile(lf.kopf), 'Lernfeld 2: Arbeitsraum');
  assert.deepEqual(lf.unterschriften, UNTERSCHRIFTEN_STANDARD);

  const pol = neueKlasse({ klasse: 'BRC13GA01', fachLabel: 'Fach', lernfeldBez: 'Politik', schuljahr: '2026/27' });
  assert.equal(fachZeile(pol.kopf), 'Fach: Politik');
  pol.unterschriften = ['Unterschrift der Lehrkraft', 'Unterschrift Erziehungsberechtigte(r) (unter 18)'];
  assert.equal(pol.unterschriften.length, 2);

  // Ohne Nummer und ohne Bezeichnung bleibt die Zeile leer bzw. zeigt den Ersatztext.
  const ohne = neueKlasse({ klasse: 'X' });
  assert.equal(fachZeile(ohne.kopf), '');
  assert.equal(fachZeile(ohne.kopf, { leer: '–' }), '–');

  // Alte Dateien ohne die neuen Felder werden ergänzt.
  const alt = { id: 'a', kopf: { klasse: 'Alt', lernfeldNr: '3', lernfeldBez: 'Test', schuljahr: '2025/26' } };
  const ergaenzt = pruefeKlasse(alt);
  assert.equal(ergaenzt.kopf.fachLabel, 'Lernfeld');
  assert.deepEqual(ergaenzt.unterschriften, UNTERSCHRIFTEN_STANDARD);
});

test('Teilaufgaben: Teile je Aufgabe, Beschriftungen und Zwischensummen', () => {
  const ka = neueKlassenarbeit(5);
  ka.teilaufgaben = true;
  ka.teile = [3, 1, 1];
  ka.aufgaben = [5, 4, 6, 4, 13];
  ka.ergebnisse.s1 = { punkte: [4, 4, 3, 2, 10], attest: false, sonstiges: '' };

  const g = aufgabenGruppen(ka);
  assert.deepEqual(g.map((x) => [x.nr, x.indizes, x.geteilt, x.namen]), [
    [1, [0, 1, 2], true, ['1a', '1b', '1c']],
    [2, [3], false, ['2']],
    [3, [4], false, ['3']],
  ]);
  assert.equal(gruppeHoechst(ka, g[0]), 15);
  assert.equal(gruppeErreicht(ka, 's1', g[0]), 11);
  assert.equal(gruppeHoechst(ka, g[1]), 4);
  assert.equal(spaltenName(ka, 1), '1b');
  assert.equal(spaltenName(ka, 3), '2');

  // Gesamtsumme bleibt die Summe aller Spalten.
  assert.equal(ka.aufgaben.reduce((a, b) => a + b, 0), 32);
  // Ohne Eintrag kommt null, nicht 0.
  assert.equal(gruppeErreicht(ka, 's2', g[0]), null);

  // Ohne Teilaufgaben ist jede Spalte eine Aufgabe.
  const einfach = neueKlassenarbeit(3);
  assert.deepEqual(aufgabenGruppen(einfach).map((x) => x.namen), [['1'], ['2'], ['3']]);

  // Teile passen sich der Spaltenzahl an, auch wenn sie nicht stimmen.
  assert.deepEqual(aufgabenTeile({ aufgaben: [1, 2, 3, 4], teile: [2] }), [2, 1, 1]);
  assert.deepEqual(aufgabenTeile({ aufgaben: [1, 2], teile: [3, 4] }), [2]);

  // Alte Dateien mit getippten Beschriftungen werden umgewandelt.
  const alt = { id: 'k', kopf: {}, klassenarbeiten: [{ aufgaben: [1, 2, 3, 4], bezeichnungen: ['1a', '1b', '2', '3'] }] };
  const k = pruefeKlasse(alt).klassenarbeiten[0];
  assert.deepEqual(k.teile, [2, 1, 1]);
  assert.equal(k.teilaufgaben, true);
  assert.equal(k.bezeichnungen, undefined);
});
