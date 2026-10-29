import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gesamtPerson, ihkProzent, prozentSL, imStichtag } from '../js/rechnen.js';
import { daltonNote, daltonProzent } from '../js/dalton.js';
import { neueKlasse, neuerTermin, neueKlassenarbeit, neueDaltonAufgabe, DALTON_STANDARD_ZUORDNUNG } from '../js/modell.js';

const nah = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/** Prüffall aus Abschnitt 4 (33/45 und 46/50, sL 2,0 und 3,3, 50/50) als Klasse mit einer Person. */
function pruefKlasse({ ka2Datum = '', sl1 = '', sl2 = '' } = {}) {
  const k = neueKlasse({ klasse: 'TEST-A' });
  k.schueler = k.schueler.slice(0, 1);
  const p = k.schueler[0];
  p.name = 'Muster';
  p.vorname = 'Erika';
  const ka1 = neueKlassenarbeit(3);
  ka1.aufgaben = [15, 15, 15];
  ka1.datum = '2025-10-15';
  ka1.ergebnisse[p.id] = { punkte: [11, 11, 11], attest: false, sonstiges: '' };
  const ka2 = neueKlassenarbeit(2);
  ka2.aufgaben = [25, 25];
  ka2.datum = ka2Datum;
  ka2.ergebnisse[p.id] = { punkte: [23, 23], attest: false, sonstiges: '' };
  k.klassenarbeiten = [ka1, ka2];
  const t1 = neuerTermin(sl1);
  t1.eintraege[p.id] = { note: 2.0, notiz: '' };
  const t2 = neuerTermin(sl2);
  t2.eintraege[p.id] = { note: 3.3, notiz: '' };
  k.sonstige = [t1, t2];
  return { k, p };
}

function daltonAnlegen(k, p, { modus = 'einrechnen', anteil = 10 } = {}) {
  k.dalton.modus = modus;
  k.dalton.anteil = anteil;
  const a1 = neueDaltonAufgabe('Aufgabe 1', '2025-09-01', '2025-09-08');
  a1.eintraege[p.id] = { status: 'abgegeben', qualitaet: 'gut' };
  const a2 = neueDaltonAufgabe('Aufgabe 2', '2025-09-15', '2025-09-22');
  a2.eintraege[p.id] = { status: 'abgegeben', qualitaet: 'schlecht' };
  k.dalton.aufgaben = [a1, a2];
}

test('Dalton-Standardzuordnung: gut 2,0, mittel 3,0, schlecht 4,0, nicht 6,0, Täuschung 6,0, entschuldigt kein Wert', () => {
  const z = DALTON_STANDARD_ZUORDNUNG;
  assert.equal(daltonNote({ status: 'abgegeben', qualitaet: 'gut' }, z), 2);
  assert.equal(daltonNote({ status: 'abgegeben', qualitaet: 'mittel' }, z), 3);
  assert.equal(daltonNote({ status: 'abgegeben', qualitaet: 'schlecht' }, z), 4);
  assert.equal(daltonNote({ status: 'nicht' }, z), 6);
  assert.equal(daltonNote({ status: 'taeuschung' }, z), 6);
  assert.equal(daltonNote({ status: 'entschuldigt' }, z), null);
});

test('Dalton: fehlender Status oder fehlende Qualität zählt nicht; selbstständig ist nur Dokumentation', () => {
  const z = DALTON_STANDARD_ZUORDNUNG;
  assert.equal(daltonNote({}, z), null);
  assert.equal(daltonNote(undefined, z), null);
  assert.equal(daltonNote({ status: 'abgegeben' }, z), null);
  assert.equal(daltonNote({ status: 'abgegeben', qualitaet: 'gut', selbststaendig: 'nein' }, z), 2);
});

test('Dalton: überschriebene Note hat Vorrang vor der Zuordnung', () => {
  const z = DALTON_STANDARD_ZUORDNUNG;
  assert.equal(daltonNote({ status: 'abgegeben', qualitaet: 'gut', note: 1.7 }, z), 1.7);
  assert.equal(daltonNote({ status: 'nicht', note: 5 }, z), 5);
  assert.equal(daltonProzent({ status: 'abgegeben', qualitaet: 'gut', note: 3.3 }, z), 68.5);
});

test('Dalton: eigene Zuordnung je Klasse', () => {
  const z = { ...DALTON_STANDARD_ZUORDNUNG, gut: 1.5, nicht: 5 };
  assert.equal(daltonNote({ status: 'abgegeben', qualitaet: 'gut' }, z), 1.5);
  assert.equal(daltonNote({ status: 'nicht' }, z), 5);
});

test('IHK: Dalton gut = 85,5 %, schlecht (4,0) = 57,5 %', () => {
  assert.equal(ihkProzent(2.0), 85.5);
  assert.equal(ihkProzent(4.0), 57.5);
  assert.equal(prozentSL(4.0), 57.5);
});

test('Prüffall 8.3: Ø sL = 76,45; Gesamt 79,55 % -> Note 3', () => {
  const { k, p } = pruefKlasse();
  daltonAnlegen(k, p);
  const g = gesamtPerson(k, p.id);
  nah(g.oSLNormal, 77.0);
  assert.deepEqual(g.daltonProzente, [85.5, 57.5]);
  nah(g.oDalton, 71.5);
  nah(g.oSL, 76.45);
  nah(g.oKA, 82.65);
  nah(g.gesamtProzent, 79.55);
  assert.equal(g.gesamtNote, 3);
});

test('Dalton nur dokumentieren: keine Wirkung auf die Note', () => {
  const { k, p } = pruefKlasse();
  daltonAnlegen(k, p, { modus: 'doku' });
  const g = gesamtPerson(k, p.id);
  nah(g.oSL, 77.0);
  nah(g.gesamtProzent, 79.825);
  k.dalton.modus = 'aus';
  nah(gesamtPerson(k, p.id).gesamtProzent, 79.825);
});

test('Dalton: fehlt Ø Dalton, gilt Ø sL zu 100 %; fehlt Ø sL, gilt Ø Dalton zu 100 %', () => {
  const { k, p } = pruefKlasse();
  daltonAnlegen(k, p);
  k.dalton.aufgaben.forEach((a) => (a.eintraege[p.id] = { status: 'entschuldigt' }));
  let g = gesamtPerson(k, p.id);
  assert.equal(g.oDalton, null);
  nah(g.oSL, 77.0);
  daltonAnlegen(k, p);
  k.sonstige.forEach((t) => (t.eintraege[p.id].note = null));
  g = gesamtPerson(k, p.id);
  assert.equal(g.oSLNormal, null);
  nah(g.oSL, 71.5);
  nah(g.gesamtProzent, 82.65 * 0.5 + 71.5 * 0.5);
  k.dalton.aufgaben.forEach((a) => (a.eintraege[p.id] = {}));
  g = gesamtPerson(k, p.id);
  assert.equal(g.oSL, null);
  assert.equal(g.gesamtProzent, null);
});

test('Dalton: Gewichte der Aufgaben und eigener Anteil', () => {
  const { k, p } = pruefKlasse();
  daltonAnlegen(k, p, { anteil: 20 });
  k.dalton.aufgaben[1].gewicht = 3;
  const g = gesamtPerson(k, p.id);
  nah(g.oDalton, (85.5 * 1 + 57.5 * 3) / 4);
  nah(g.oSL, 77.0 * 0.8 + g.oDalton * 0.2);
});

test('Zwischenstand 8.15: KA 2 nach dem Stichtag -> Ø KA 73,3; Gesamt 75,15 % -> Note 3', () => {
  const { k, p } = pruefKlasse({ ka2Datum: '2025-12-10' });
  const g = gesamtPerson(k, p.id, { stichtag: '2025-11-01' });
  nah(g.oKA, 73.3);
  nah(g.oSL, 77.0);
  nah(g.gesamtProzent, 75.15);
  assert.equal(g.gesamtNote, 3);
  assert.equal(g.stichtag, '2025-11-01');
  // Ohne Stichtag: Ganzjahr wie bisher
  const ganz = gesamtPerson(k, p.id, { stichtag: '' });
  nah(ganz.gesamtProzent, 79.825);
  assert.equal(ganz.gesamtNote, 3);
  // Gespeicherter Stichtag an der Klasse gilt als Standard
  k.stichtag = '2025-11-01';
  nah(gesamtPerson(k, p.id).gesamtProzent, 75.15);
});

test('Zwischenstand: Stichtag selbst zählt mit, Einträge ohne Datum zählen mit', () => {
  assert.equal(imStichtag('2025-11-01', '2025-11-01'), true);
  assert.equal(imStichtag('2025-11-02', '2025-11-01'), false);
  assert.equal(imStichtag('', '2025-11-01'), true);
  assert.equal(imStichtag('2030-01-01', ''), true);
  const { k, p } = pruefKlasse({ ka2Datum: '' });
  nah(gesamtPerson(k, p.id, { stichtag: '2025-11-01' }).oKA, 82.65);
});

test('Zwischenstand: sL-Termine nach dem Stichtag zählen nicht, Dalton nach Abgabedatum', () => {
  const { k, p } = pruefKlasse({ sl1: '2025-09-01', sl2: '2025-12-01' });
  daltonAnlegen(k, p);
  const g = gesamtPerson(k, p.id, { stichtag: '2025-09-10' });
  nah(g.oSLNormal, 85.5);
  nah(g.oDalton, 85.5); // nur Aufgabe 1 (Abgabe 08.09.)
  const g2 = gesamtPerson(k, p.id, { stichtag: '2025-12-31' });
  nah(g2.oSLNormal, 77.0);
  nah(g2.oDalton, 71.5);
});
