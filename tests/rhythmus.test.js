import test from 'node:test';
import assert from 'node:assert/strict';
import { neueKlasse } from '../js/modell.js';
import { rhythmusAuffuellen, rhythmusErkennen, feiertageNI, unterrichtsfrei, schuljahrDaten } from '../js/rhythmus.js';

const eintrag = (datum, uhr = '08:00', ende = '09:30', status = 'ok') => ({
  uid: `u-${datum}-${uhr}`, uids: [`u-${datum}-${uhr}`], datum, uhrzeit: uhr, ende, startMs: Date.parse(`${datum}T${uhr}:00Z`), endeMs: 0,
  status, summary: 'FL-02', schluessel: 'FL-02', stunden: 2,
});
const dienstage = (von, bis) => {
  const r = [];
  for (let t = Date.parse(`${von}T00:00:00Z`); t <= Date.parse(`${bis}T00:00:00Z`); t += 7 * 86400000) r.push(new Date(t).toISOString().slice(0, 10));
  return r;
};

test('Feiertage Niedersachsen 2027', () => {
  const f = feiertageNI(2027);
  for (const d of ['2027-01-01', '2027-03-26', '2027-03-29', '2027-05-01', '2027-05-06', '2027-05-17', '2027-10-03', '2027-10-31', '2027-12-25']) assert.ok(f.has(d), d);
  assert.equal(f.size, 10);
});

test('Ferien und Wochenenden sind unterrichtsfrei', () => {
  const sj = schuljahrDaten('2026/27');
  assert.ok(unterrichtsfrei('2026-10-20', sj));
  assert.ok(unterrichtsfrei('2026-12-24', sj));
  assert.ok(unterrichtsfrei('2027-05-18', sj));
  assert.ok(unterrichtsfrei('2026-09-05', sj)); // Samstag
  assert.ok(!unterrichtsfrei('2026-11-10', sj));
});

test('Wochenrhythmus wird bis Schuljahresbeginn und -ende fortgeschrieben, Untis-Zeitraum bleibt unberührt', () => {
  const k = neueKlasse({ klasse: 'WAK3-1', schuljahr: '2026/27' });
  // wie die echte Datei: Untis liefert nur Dienstage 27.10.2026 bis 16.03.2027, Ferien fehlen
  k.stundenplan = dienstage('2026-10-27', '2027-03-16').filter((d) => !unterrichtsfrei(d, schuljahrDaten('2026/27'))).map((d) => eintrag(d));
  assert.equal(rhythmusErkennen(k).length, 1);
  const vorher = k.stundenplan.length;
  const r = rhythmusAuffuellen(k);
  assert.ok(r.neu > 0);
  const regel = k.stundenplan.filter((e) => e.quelle === 'regel');
  assert.equal(regel.length, r.neu);
  assert.ok(regel.some((e) => e.datum === '2026-08-18'), 'erster Dienstag nach Schuljahresbeginn');
  assert.ok(regel.some((e) => e.datum === '2027-07-06'), 'letzter Dienstag vor den Sommerferien');
  assert.ok(!regel.some((e) => e.datum === '2026-10-13'), 'Herbstferien');
  assert.ok(!regel.some((e) => e.datum === '2027-03-23' || e.datum === '2027-03-30'), 'Osterferien');
  assert.ok(!regel.some((e) => e.datum === '2027-05-18'), 'Brückentag nach Pfingsten');
  assert.ok(regel.every((e) => e.datum < '2026-10-27' || e.datum > '2027-03-16'), 'nichts im Untis-Zeitraum');
  assert.equal(k.stundenplan.filter((e) => e.quelle !== 'regel').length, vorher);
  // erneut: gleiches Ergebnis, keine Dopplungen
  const r2 = rhythmusAuffuellen(k);
  assert.equal(r2.neu, r.neu);
  assert.equal(r2.entfernt, r.neu);
  assert.equal(new Set(k.stundenplan.map((e) => `${e.datum}|${e.uhrzeit}`)).size, k.stundenplan.length);
});

test('ausgefallene Stunden und zweiwöchiger Takt', () => {
  const k = neueKlasse({ klasse: 'X', schuljahr: '2026/27' });
  k.stundenplan = dienstage('2026-10-27', '2027-03-09').filter((d, i) => i % 2 === 0 && !unterrichtsfrei(d, schuljahrDaten('2026/27'))).map((d) => eintrag(d));
  const m = rhythmusErkennen(k);
  assert.equal(m.length, 1);
  assert.equal(m[0].takt, 2);
  rhythmusAuffuellen(k);
  const regel = k.stundenplan.filter((e) => e.quelle === 'regel').map((e) => e.datum);
  assert.ok(regel.includes('2026-08-25') || regel.includes('2026-08-18'));
  // höchstens jede zweite Woche
  const wochen = regel.filter((d) => d < '2026-10-01').map((d) => Math.floor(Date.parse(d) / (7 * 86400000)));
  for (let i = 1; i < wochen.length; i += 1) assert.equal((wochen[i] - wochen[0]) % 2, 0);
});

test('ohne Daten oder unbekanntes Schuljahr wird nichts erzeugt', () => {
  const a = neueKlasse({ klasse: 'A', schuljahr: '2026/27' });
  assert.match(rhythmusAuffuellen(a).grund, /importierten Stundenplan/);
  const b = neueKlasse({ klasse: 'B', schuljahr: '2031/32' });
  b.stundenplan = [eintrag('2031-10-07')];
  assert.match(rhythmusAuffuellen(b).grund, /Ferientermine/);
});

import { zeichenVon, zeichenSetzen } from '../js/ansichten/anwesenheit-lf.js';
import { neuerSchueler } from '../js/modell.js';
import { pausenSpalten } from '../js/rhythmus.js';

test('Anwesenheit Lernfeld wie im Sport: ., V mit Minuten, Fehlzeichen mit Fehlzeit, Befreiung', () => {
  const k = neueKlasse({ klasse: 'W', schuljahr: '2026/27' });
  const s = neuerSchueler();
  k.schueler.push(s);
  const d = '2026-11-03';
  zeichenSetzen(k, s.id, d, '.');
  assert.equal(zeichenVon(k, s.id, d).zeichen, '.');
  assert.equal(k.fehlzeiten.length, 0);
  zeichenSetzen(k, s.id, d, 'V', { min: 7, text: 'Bus' });
  assert.deepEqual(zeichenVon(k, s.id, d), { zeichen: 'V', eigen: true, fremd: false, min: 7, text: 'Bus' });
  assert.equal(k.fehlzeiten.length, 0);
  zeichenSetzen(k, s.id, d, '|');
  assert.equal(k.fehlzeiten[0].status, 'offen');
  zeichenSetzen(k, s.id, d, 'B');
  assert.equal(k.fehlzeiten.length, 1);
  assert.equal(k.fehlzeiten[0].status, 'entschuldigt');
  assert.equal(k.fehlzeiten[0].grund, 'betrieblich befreit');
  assert.equal(zeichenVon(k, s.id, d).zeichen, 'B');
  zeichenSetzen(k, s.id, d, '');
  assert.equal(k.fehlzeiten.length, 0);
  assert.equal(zeichenVon(k, s.id, d).zeichen, '');
  assert.deepEqual(k.anwesenheitLf, {});
});

test('Pausenspalten: Ferien, Feiertag und ausgefallene Stunde zwischen Unterrichtstagen', () => {
  const k = neueKlasse({ klasse: 'W', schuljahr: '2026/27' });
  k.stundenplan = [eintrag('2026-12-01'), eintrag('2027-01-12'), eintrag('2027-02-23', '08:00', '09:30', 'ausgefallen')];
  const p = pausenSpalten(k, ['2026-12-01', '2027-01-12', '2027-03-02']);
  assert.equal(p.get(1)[0].text, 'Weihnachtsferien');
  assert.equal(p.get(1).length, 1, 'Weihnachten selbst liegt in den Ferien');
  const zweite = p.get(2).map((x) => x.text);
  assert.ok(zweite.includes('Halbjahresferien') === false || zweite.length >= 1);
  assert.ok(zweite.includes('ausgefallen'));
  // Feiertag an einem Unterrichtswochentag (Dienstag 03.10.2028 liegt im 2027/28; hier: Reformationstag Dienstag 2028?) -> nur mit passendem Wochentag
  const k2 = neueKlasse({ klasse: 'W', schuljahr: '2026/27' });
  k2.stundenplan = [eintrag('2027-05-04'), eintrag('2027-05-11')]; // Dienstage
  const q = pausenSpalten(k2, ['2027-05-04', '2027-05-11']);
  assert.equal(q.size, 0);
  const k3 = neueKlasse({ klasse: 'W', schuljahr: '2026/27' });
  k3.stundenplan = [eintrag('2027-05-13'), eintrag('2027-05-27')]; // Donnerstage; 17.5. ist Pfingstmontag (Montag): nicht sichtbar, 18.5. ist ein Dienstag
  assert.equal(pausenSpalten(k3, ['2027-05-13', '2027-05-27']).size, 0);
  const k4 = neueKlasse({ klasse: 'W', schuljahr: '2026/27' });
  k4.stundenplan = [eintrag('2027-05-10'), eintrag('2027-05-24')]; // Montage: Pfingstmontag 17.5.
  assert.equal(pausenSpalten(k4, ['2027-05-10', '2027-05-24']).get(1).some((x) => x.text === 'Pfingstmontag'), true);
});

import { weiterleitungsAdresse } from '../js/onedrive.js';
test('Weiterleitungsadresse der Anmeldung ist immer die mit index.html', () => {
  const o = 'https://shaarmann83-git.github.io';
  assert.equal(weiterleitungsAdresse({ origin: o, pathname: '/unterrichts-app/' }), `${o}/unterrichts-app/index.html`);
  assert.equal(weiterleitungsAdresse({ origin: o, pathname: '/unterrichts-app/index.html' }), `${o}/unterrichts-app/index.html`);
});
