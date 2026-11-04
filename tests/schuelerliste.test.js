import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvLesen, trennzeichenRaten, ohneLeerzeilen } from '../js/tabelle.js';
import { schuelerSpaltenRaten, schuelerAusZeilen, schuelerVergleichen, schuelerUebernehmen, nameTrennen } from '../js/schuelerliste.js';
import { neueKlasse, aktiveSchueler } from '../js/modell.js';

const CSV = '﻿Name;Vorname;Geburtsdatum;Geschlecht;Betrieb\r\nMuster;Erika;12.03.2008;w;Firma Eins GmbH\r\nBeispiel;Max;01.05.2007;m;"Bäckerei ""Krume"""\r\n\r\nProbe;Sam;;d;\r\n';

test('CSV: Semikolon, BOM, Anführungszeichen, Leerzeilen', () => {
  assert.equal(trennzeichenRaten(CSV.slice(1)), ';');
  const z = ohneLeerzeilen(csvLesen(CSV));
  assert.equal(z.length, 4);
  assert.deepEqual(z[0], ['Name', 'Vorname', 'Geburtsdatum', 'Geschlecht', 'Betrieb']);
  assert.equal(z[2][4], 'Bäckerei "Krume"');
  assert.equal(trennzeichenRaten('a,b,c'), ',');
  assert.equal(trennzeichenRaten('a\tb'), '\t');
});

test('Spalten werden aus den Überschriften geraten', () => {
  const z = ohneLeerzeilen(csvLesen(CSV));
  assert.deepEqual(schuelerSpaltenRaten(z[0]), { name: 0, vorname: 1, geburtstag: 2, geschlecht: 3, betrieb: 4 });
  assert.deepEqual(schuelerSpaltenRaten(['Langname', 'Vorname', 'ID']), { name: 0, vorname: 1, untisId: 2 });
  assert.deepEqual(schuelerSpaltenRaten(['Schüler*innen', 'Externe Id']), { namevorname: 0, untisId: 1 });
});

test('Name, Vorname in einer Spalte', () => {
  assert.deepEqual(nameTrennen('Muster, Erika Maria'), { name: 'Muster', vorname: 'Erika Maria' });
  assert.deepEqual(nameTrennen('Muster Erika'), { name: 'Muster', vorname: 'Erika' });
  const e = schuelerAusZeilen([['Muster, Erika'], ['Probe, Sam']], { namevorname: 0 });
  assert.deepEqual(e.map((x) => [x.name, x.vorname]), [['Muster', 'Erika'], ['Probe', 'Sam']]);
});

test('Import ohne Doppelungen: vorhandene Personen werden nicht doppelt angelegt', () => {
  const k = neueKlasse();
  k.schueler[0].name = 'Muster';
  k.schueler[0].vorname = 'Erika';
  k.schueler[1].name = 'Alt';
  k.schueler[1].vorname = 'Archiv';
  k.schueler[1].archiviert = { datum: '2025-01-01', grund: '' };
  const z = ohneLeerzeilen(csvLesen(CSV));
  const entwuerfe = schuelerAusZeilen(z.slice(1), schuelerSpaltenRaten(z[0]));
  assert.equal(entwuerfe.length, 3);
  assert.equal(entwuerfe[0].geburtstag, '2008-03-12');
  assert.equal(entwuerfe[2].geschlecht, 'd');
  // Groß-/Kleinschreibung und doppelte Leerzeichen sind egal
  entwuerfe.push({ name: ' BEISPIEL ', vorname: 'max', geburtstag: '', geschlecht: '', betrieb: '', untisId: '' });
  entwuerfe.push({ name: 'Alt', vorname: 'Archiv', geburtstag: '', geschlecht: '', betrieb: '', untisId: '' });
  const v = schuelerVergleichen(k, entwuerfe);
  assert.deepEqual(v.map((x) => x.vorhanden), [true, false, false, true, true]);
  assert.equal(schuelerUebernehmen(k, v), 2);
  const namen = aktiveSchueler(k).map((s) => s.name).sort();
  assert.deepEqual(namen, ['Beispiel', 'Muster', 'Probe']);
  // zweiter Import derselben Liste legt nichts mehr an
  const v2 = schuelerVergleichen(k, entwuerfe);
  assert.equal(schuelerUebernehmen(k, v2), 0);
  assert.equal(aktiveSchueler(k).length, 3);
  assert.equal(k.schueler.find((s) => s.name === 'Beispiel').betrieb.name, 'Bäckerei "Krume"');
});

test('Doppelte Einträge innerhalb der Importliste werden nur einmal angelegt', () => {
  const k = neueKlasse();
  const e = schuelerAusZeilen([['A', 'B'], ['a', 'b']], { name: 0, vorname: 1 });
  assert.deepEqual(schuelerVergleichen(k, e).map((x) => x.vorhanden), [false, true]);
});
