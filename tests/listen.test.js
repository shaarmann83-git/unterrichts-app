import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listeAnlegen, strichHinzu, strichZurueck, strichSumme, abhakSetzen, abhakErledigt, abhakFehlend, abhakDatum,
  zahlungHinzu, zahlungLoeschen, betragSoll, betragGezahlt, betragRest, betragSummen, sichtbareListen,
} from '../js/listen.js';
import { neueKlasse, klasseKopieren, aktiveSchueler } from '../js/modell.js';
import { gesamtPerson } from '../js/rechnen.js';

function klasse() {
  const k = neueKlasse({ klasse: 'TEST-A' });
  k.schueler = k.schueler.slice(0, 3);
  ['Muster', 'Beispiel', 'Probe'].forEach((n, i) => { k.schueler[i].name = n; });
  return k;
}

test('Strichliste: zählen und zurücknehmen', () => {
  const k = klasse();
  const l = listeAnlegen(k, 'Hausaufgaben vergessen', 'strich');
  const [a, b] = k.schueler;
  assert.equal(strichSumme(l, a.id), 0);
  strichHinzu(l, a.id, '2025-10-01');
  strichHinzu(l, a.id, '2025-10-02');
  strichHinzu(l, a.id, '2025-10-03');
  strichHinzu(l, b.id, '2025-10-03');
  assert.equal(strichSumme(l, a.id), 3);
  assert.equal(strichSumme(l, b.id), 1);
  assert.equal(strichZurueck(l, a.id), true);
  assert.equal(strichSumme(l, a.id), 2);
  assert.equal(strichZurueck(l, b.id), true);
  assert.equal(strichZurueck(l, b.id), false, 'unter null geht es nicht');
  assert.equal(strichSumme(l, b.id), 0);
  assert.equal(strichSumme(l, k.schueler[2].id), 0);
  // zurückgenommen wird der letzte Strich
  assert.deepEqual(l.eintraege[a.id].map((e) => e.datum), ['2025-10-01', '2025-10-02']);
});

test('Abhakliste: erledigt mit Datum, wer fehlt noch', () => {
  const k = klasse();
  const l = listeAnlegen(k, 'Praktikumsbericht abgegeben', 'abhak');
  const personen = aktiveSchueler(k);
  assert.equal(abhakFehlend(l, personen).length, 3);
  abhakSetzen(l, personen[0].id, true, '2025-11-05');
  abhakSetzen(l, personen[2].id, true, '2025-11-06');
  assert.equal(abhakErledigt(l, personen[0].id), true);
  assert.equal(abhakDatum(l, personen[2].id), '2025-11-06');
  assert.deepEqual(abhakFehlend(l, personen).map((p) => p.name), ['Beispiel']);
  abhakSetzen(l, personen[0].id, false);
  assert.deepEqual(abhakFehlend(l, personen).map((p) => p.name), ['Muster', 'Beispiel']);
  abhakSetzen(l, personen[2].id, true, '2025-11-07'); // nochmaliges Setzen erzeugt keine Doppelung
  assert.equal(l.eintraege[personen[2].id].length, 1);
});

test('Betragsliste: Soll, gezahlt, Rest je Person und Summe', () => {
  const k = klasse();
  const l = listeAnlegen(k, 'Klassenfahrt bezahlt', 'betrag');
  l.soll = 120;
  const [a, b, c] = k.schueler;
  l.sollJe = { [c.id]: 60.5 }; // abweichender Sollbetrag
  zahlungHinzu(l, a.id, 50, '2025-09-01');
  zahlungHinzu(l, a.id, 70, '2025-10-01');
  zahlungHinzu(l, b.id, 0.1, '2025-09-01');
  zahlungHinzu(l, b.id, 0.2, '2025-09-02');
  assert.equal(betragSoll(l, a.id), 120);
  assert.equal(betragSoll(l, c.id), 60.5);
  assert.equal(betragGezahlt(l, a.id), 120);
  assert.equal(betragRest(l, a.id), 0);
  assert.equal(betragGezahlt(l, b.id), 0.3, '0,1 + 0,2 ist genau 0,30');
  assert.equal(betragRest(l, b.id), 119.7);
  assert.equal(betragRest(l, c.id), 60.5);
  const s = betragSummen(l, aktiveSchueler(k));
  assert.deepEqual(s, { soll: 300.5, gezahlt: 120.3, rest: 180.2 });
  // Überzahlung ergibt negativen Rest
  zahlungHinzu(l, a.id, 10, '2025-10-02');
  assert.equal(betragRest(l, a.id), -10);
  // Zahlung löschen
  const erste = l.eintraege[a.id][0].id;
  zahlungLoeschen(l, a.id, erste);
  assert.equal(betragGezahlt(l, a.id), 80);
});

test('Listen fließen nicht in Noten ein', () => {
  const k = klasse();
  const vorher = JSON.stringify(gesamtPerson(k, k.schueler[0].id));
  const l = listeAnlegen(k, 'Material vergessen', 'strich');
  for (let i = 0; i < 5; i++) strichHinzu(l, k.schueler[0].id, '2025-10-01');
  assert.equal(JSON.stringify(gesamtPerson(k, k.schueler[0].id)), vorher);
});

test('Ausblenden, Kopieren einer Klasse mit Listen (ohne Einträge)', () => {
  const k = klasse();
  const a = listeAnlegen(k, 'A', 'strich');
  const b = listeAnlegen(k, 'B', 'betrag');
  b.soll = 20;
  strichHinzu(a, k.schueler[0].id, '2025-10-01');
  b.ausgeblendet = true;
  assert.deepEqual(sichtbareListen(k).map((l) => l.name), ['A']);
  const kopie = klasseKopieren(k);
  assert.deepEqual(kopie.listen.map((l) => l.name), ['A', 'B']);
  assert.ok(kopie.listen.every((l) => Object.keys(l.eintraege).length === 0));
  assert.equal(kopie.listen[1].soll, 20);
  assert.notEqual(kopie.listen[0].id, a.id);
  assert.equal(strichSumme(a, k.schueler[0].id), 1);
  assert.deepEqual(klasseKopieren(k, { listenMitnehmen: false }).listen, []);
});
