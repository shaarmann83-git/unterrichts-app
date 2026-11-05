import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  abschneiden,
  prozentKA,
  noteAusProzent,
  punkteAusProzent,
  prozentAusPunkten,
  bewertungAusProzent,
  bewertungText,
  prozentSLKlasse,
  NOTENGRENZEN_STANDARD,
  PUNKTEGRENZEN_STANDARD,
  ihkProzent,
  prozentSL,
  gewichteterMittelwert,
  gesamtPerson,
  notenspiegel,
  ergebnisKA,
  istVolljaehrig,
  formatZahl,
  zahlLesen,
} from '../js/rechnen.js';
import { IHK_EINTRAEGE } from '../js/ihk-schema.js';
import { neueDaten, neueKlasse, neueKlassenarbeit, neuerTermin } from '../js/modell.js';

const nah = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('IHK-Schema im Code stimmt mit docs/ihk-schema.json überein', () => {
  const datei = JSON.parse(readFileSync(new URL('../docs/ihk-schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(IHK_EINTRAEGE, datei.eintraege);
});

test('Notengrenzen', () => {
  const faelle = [
    [100, 1], [91.5, 1], [91.4, 2], [80.5, 2], [80.4, 3], [66.5, 3], [66.4, 4],
    [49.5, 4], [49.4, 5], [29.5, 5], [29.4, 6], [0, 6],
  ];
  for (const [p, n] of faelle) assert.equal(noteAusProzent(p), n, `${p} %`);
});

test('Abschneiden statt Runden: 70 von 87 Punkten', () => {
  assert.equal(prozentKA(70, 87), 80.4);
  assert.equal(noteAusProzent(prozentKA(70, 87)), 3);
});

test('Gleitkommafehler werden abgefangen', () => {
  assert.equal(abschneiden(0.3 * 100, 1), 30);
  assert.equal(prozentKA(0.3, 1), 30);
  assert.equal(prozentKA(29.5, 100), 29.5);
  assert.equal(noteAusProzent(prozentKA(29.5, 100)), 5);
  assert.equal(prozentKA(0.1 + 0.2, 1), 30);
  assert.equal(prozentKA(33, 45), 73.3);
  assert.equal(prozentKA(46, 50), 92);
});

test('IHK-Umrechnung Note -> Prozent', () => {
  assert.equal(ihkProzent(1.0), 100);
  assert.equal(ihkProzent(2.0), 85.5);
  assert.equal(ihkProzent(3.3), 68.5);
  assert.equal(ihkProzent(6.0), 2.5);
  assert.equal(ihkProzent(2.04), 85.5); // wird auf 1 Nachkommastelle gerundet
  assert.equal(ihkProzent(null), null);
  assert.equal(prozentSL(2), 85.5);
});

test('Jede Zehntelnote von 1,0 bis 6,0 hat einen IHK-Prozentwert', () => {
  for (let k = 10; k <= 60; k++) assert.notEqual(ihkProzent(k / 10), null, `Note ${k / 10}`);
});

function pruefDaten({ gewichte = null } = {}) {
  const d = neueDaten({ klasse: 'TEST-A', lernfeldNr: '1', lernfeldBez: 'Testfeld', schuljahr: '2025/26' });
  d.schueler = d.schueler.slice(0, 3);
  d.schueler[0].name = 'Muster';
  d.schueler[0].vorname = 'Erika';
  d.schueler[1].name = 'Beispiel';
  d.schueler[1].vorname = 'Max';
  d.schueler[2].name = 'Probe';
  d.schueler[2].vorname = 'Sam';
  const [p] = d.schueler;
  const ka1 = neueKlassenarbeit(3);
  ka1.aufgaben = [15, 15, 15];
  ka1.ergebnisse[p.id] = { punkte: [11, 11, 11], attest: false, sonstiges: '' };
  const ka2 = neueKlassenarbeit(2);
  ka2.aufgaben = [25, 25];
  ka2.ergebnisse[p.id] = { punkte: [23, 23], attest: false, sonstiges: '' };
  d.klassenarbeiten = [ka1, ka2];
  const t1 = neuerTermin('2025-10-01', 'Gruppenarbeit');
  t1.eintraege[p.id] = { note: 2.0, notiz: '' };
  const t2 = neuerTermin('2025-10-08', 'Vortrag');
  t2.eintraege[p.id] = { note: 3.3, notiz: '' };
  d.sonstige = [t1, t2];
  if (gewichte) {
    ka1.gewicht = gewichte.ka[0];
    ka2.gewicht = gewichte.ka[1];
    t1.gewicht = gewichte.sl[0];
    t2.gewicht = gewichte.sl[1];
  }
  return { d, person: p };
}

test('Prüffall 1: Gewichtung 50/50, alle Gewichte 1', () => {
  const { d, person } = pruefDaten();
  const e1 = ergebnisKA(d.klassenarbeiten[0], person.id);
  assert.equal(e1.prozent, 73.3);
  assert.equal(e1.note, 3);
  const e2 = ergebnisKA(d.klassenarbeiten[1], person.id);
  assert.equal(e2.prozent, 92);
  assert.equal(e2.note, 1);
  const g = gesamtPerson(d, person.id);
  nah(g.oKA, 82.65);
  nah(g.oSL, 77.0);
  nah(g.gesamtProzent, 79.825);
  assert.equal(g.gesamtNote, 3);
});

test('Prüffall 2: Einzelgewichte KA 1/2 und sL 1/0,5', () => {
  const { d, person } = pruefDaten({ gewichte: { ka: [1, 2], sl: [1, 0.5] } });
  const g = gesamtPerson(d, person.id);
  nah(g.oKA, 85.76666666667, 1e-6);
  nah(g.oSL, 79.83333333333, 1e-6);
  nah(g.gesamtProzent, 82.8, 1e-9);
  assert.equal(g.gesamtNote, 2);
});

test('Prüffall 3: nur KA 1 vorhanden bei Gewichten 1 und 2 -> Ø KA = 73,3', () => {
  const { d } = pruefDaten({ gewichte: { ka: [1, 2], sl: [1, 0.5] } });
  const [, zweite] = d.schueler;
  d.klassenarbeiten[0].ergebnisse[zweite.id] = { punkte: [11, 11, 11], attest: false, sonstiges: '' };
  const g = gesamtPerson(d, zweite.id);
  nah(g.oKA, 73.3);
  // keine sL-Note -> keine Gesamtnote
  assert.equal(g.oSL, null);
  assert.equal(g.gesamtProzent, null);
  assert.equal(g.gesamtNote, null);
});

test('Gewichtssumme 0 ergibt leeren Durchschnitt statt Fehler', () => {
  const r = gewichteterMittelwert([70, 80], [0, 0]);
  assert.equal(r.mittel, null);
  assert.equal(r.anzahl, 2);
  const { d, person } = pruefDaten({ gewichte: { ka: [0, 0], sl: [1, 1] } });
  const g = gesamtPerson(d, person.id);
  assert.equal(g.oKA, null);
  assert.equal(g.gesamtProzent, null);
});

test('Gewicht 0 bei einem von zwei Werten zählt nur den anderen', () => {
  const r = gewichteterMittelwert([70, 90], [0, 1]);
  nah(r.mittel, 90);
});

test('Attest: keine Punkte, keine Note, nicht im Notenspiegel', () => {
  const { d, person } = pruefDaten();
  const ka = d.klassenarbeiten[0];
  ka.ergebnisse[person.id].attest = true;
  const e = ergebnisKA(ka, person.id);
  assert.deepEqual(e, { summe: null, prozent: null, note: null, attest: true });
  const sp = notenspiegel(ka, d.schueler);
  assert.equal(sp.gesamt, 0);
  assert.equal(sp.durchschnitt, null);
  assert.equal(gesamtPerson(d, person.id).kaProzente[0], null);
});

test('Notenspiegel: Anzahl und Durchschnitt', () => {
  const d = neueDaten();
  d.schueler = d.schueler.slice(0, 4);
  const ka = neueKlassenarbeit(1);
  ka.aufgaben = [100];
  const punkte = [95, 85, 85, 20]; // Noten 1, 2, 2, 6
  d.schueler.forEach((s, i) => {
    s.name = `S${i}`;
    ka.ergebnisse[s.id] = { punkte: [punkte[i]], attest: false, sonstiges: '' };
  });
  const sp = notenspiegel(ka, d.schueler);
  assert.deepEqual(sp.anzahl, [1, 2, 0, 0, 0, 1]);
  assert.equal(sp.gesamt, 4);
  nah(sp.durchschnitt, (1 + 2 + 2 + 6) / 4);
});

test('Leere Arbeit und leere Termine zählen nicht', () => {
  const { d } = pruefDaten();
  const dritter = d.schueler[2];
  const g = gesamtPerson(d, dritter.id);
  assert.equal(g.oKA, null);
  assert.equal(g.anzahlSL, 0);
  // Termin nur mit Notiz, ohne Note
  d.sonstige[0].eintraege[dritter.id] = { note: null, notiz: 'fehlte' };
  assert.equal(gesamtPerson(d, dritter.id).anzahlSL, 0);
});

test('Volljährig aus Geburtstag', () => {
  const heute = new Date(2026, 0, 10);
  assert.equal(istVolljaehrig('2008-01-10', heute), true);
  assert.equal(istVolljaehrig('2008-01-11', heute), false);
  assert.equal(istVolljaehrig('', heute), null);
  assert.equal(istVolljaehrig('unsinn', heute), null);
});

test('Zahlen lesen und anzeigen (deutsches Komma)', () => {
  assert.equal(zahlLesen('3,5'), 3.5);
  assert.equal(zahlLesen('3.5'), 3.5);
  assert.equal(zahlLesen(''), null);
  assert.ok(Number.isNaN(zahlLesen('abc')));
  assert.equal(formatZahl(79.825, 2), '79,83');
  assert.equal(formatZahl(77, 2), '77,00');
  assert.equal(formatZahl(null), '');
});

test('formatKurz ohne überflüssige Nullen', async () => {
  const { formatKurz } = await import('../js/rechnen.js');
  assert.equal(formatKurz(45), '45');
  assert.equal(formatKurz(12.5), '12,5');
  assert.equal(formatKurz(12.25), '12,25');
  assert.equal(formatKurz(null), '');
});

test('Notengrenzen und Punkteschlüssel: Standard und eigene Grenzen', () => {
  // Standard bleibt der Schlüssel der Excel-Vorlage.
  assert.equal(noteAusProzent(91.5), 1);
  assert.equal(noteAusProzent(91.4), 2);
  assert.equal(noteAusProzent(29.4), 6);

  // Eigener Schlüssel, z. B. gleichmäßig in Zehnerschritten.
  const eigen = [90, 80, 70, 60, 50];
  assert.equal(noteAusProzent(90, eigen), 1);
  assert.equal(noteAusProzent(89.9, eigen), 2);
  assert.equal(noteAusProzent(49.9, eigen), 6);

  // Bewertungsschema BG der BBS Lingen: Intervalle als Untergrenzen gelesen.
  assert.equal(punkteAusProzent(100), 15);
  assert.equal(punkteAusProzent(95), 15);
  assert.equal(punkteAusProzent(94), 14);
  assert.equal(punkteAusProzent(94.9), 14);
  assert.equal(punkteAusProzent(50), 6);
  assert.equal(punkteAusProzent(49.9), 5);
  assert.equal(punkteAusProzent(20), 1);
  assert.equal(punkteAusProzent(19.9), 0);
  assert.equal(punkteAusProzent(0), 0);
  assert.equal(punkteAusProzent(null), null);
});

test('Beispiel aus der Praxis: 15 von 20 Punkten sind 75 %, IHK-Note 3, BG 11 Punkte', () => {
  const p = prozentKA(15, 20);
  assert.equal(p, 75);
  assert.equal(noteAusProzent(p), 3);
  assert.equal(punkteAusProzent(p), 11);
});

test('Punktsystem: Umkehrung des Punkteschlüssels und Bewertung je Klasse', () => {
  // Intervallmitte, wie beim IHK-Schema über AVERAGEIF.
  assert.equal(prozentAusPunkten(11), 77);   // 75 bis 79
  assert.equal(prozentAusPunkten(15), 97.5); // 95 bis 100
  assert.equal(prozentAusPunkten(0), 9.5);   // 0 bis 19
  assert.equal(prozentAusPunkten(6), 52);    // 50 bis 54
  assert.equal(prozentAusPunkten(16), null);
  assert.equal(prozentAusPunkten(null), null);

  const bg = { notensystem: 'punkte', punktegrenzen: PUNKTEGRENZEN_STANDARD, notengrenzen: NOTENGRENZEN_STANDARD };
  const bs = { notensystem: 'noten', punktegrenzen: PUNKTEGRENZEN_STANDARD, notengrenzen: NOTENGRENZEN_STANDARD };
  assert.equal(bewertungAusProzent(75, bg), 11);
  assert.equal(bewertungAusProzent(75, bs), 3);
  assert.equal(bewertungText(11, bg), '11 Punkte');
  assert.equal(bewertungText(3, bs), '3 (befriedigend)');
  assert.equal(bewertungText(null, bg), '');

  // Sonstige Leistung: im Punktsystem zählt der Punktwert, sonst die Note über das IHK-Schema.
  assert.equal(prozentSLKlasse(11, bg), 77);
  assert.equal(prozentSLKlasse(3, bs), prozentSL(3));
});

test('BG-Klasse durchgerechnet: Prozent bleibt der Rechenweg, Ausgabe in Notenpunkten', () => {
  const k = neueKlasse({ klasse: 'BRC13GA01', fachLabel: 'Fach', lernfeldBez: 'Politik', schuljahr: '2026/27' });
  k.notensystem = 'punkte';
  k.gewichtSchriftlich = 50;
  const s = k.schueler[0] || { id: 's1' };
  if (!k.schueler.length) k.schueler.push(s);

  const ka = neueKlassenarbeit(1);
  ka.aufgaben = [20];
  ka.ergebnisse[s.id] = { punkte: [15], attest: false, sonstiges: '' };
  k.klassenarbeiten.push(ka);

  // 15 von 20 sind 75 %, nach dem Schema der BBS Lingen 11 Punkte.
  const e = ergebnisKA(ka, s.id, k);
  assert.equal(e.prozent, 75);
  assert.equal(e.note, 11);

  // Sonstige Leistung als Punktwert: 11 Punkte gelten als 77 %.
  k.sonstige.push({ id: 't1', datum: '2026-09-20', gewicht: 1, eintraege: { [s.id]: { note: 11 } } });
  const g = gesamtPerson(k, s.id);
  assert.equal(g.oKA, 75);
  assert.equal(g.oSL, 77);
  assert.equal(g.gesamtProzent, 76);
  assert.equal(g.gesamtNote, 11); // 76 % liegt im Intervall 75 bis 79

  // Dieselben Zahlen in einer Berufsschulklasse ergeben weiterhin eine Note.
  k.notensystem = 'noten';
  assert.equal(ergebnisKA(ka, s.id, k).note, 3);
});
