import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entfalten, textEntschluesseln, zeileLesen, icalLesen, zeitLesen, dauerMs, versatzMinuten, ortszeitZuMs } from '../js/ical.js';
import { vevent, kalender, falten, esc } from './hilfen-ics.js';

test('Gefaltete Zeilen werden zusammengefügt (CRLF und LF, Leerzeichen und Tab)', () => {
  assert.deepEqual(entfalten('SUMMARY:Sport WAK\r\n  1 Gruppe\r\nUID:x'), ['SUMMARY:Sport WAK 1 Gruppe', 'UID:x']);
  assert.deepEqual(entfalten('A:1\n\t2\nB:3'), ['A:12', 'B:3']);
  const lang = 'SUMMARY:' + 'Sport Klasse '.repeat(15);
  assert.ok(falten(lang).includes('\r\n '));
  assert.deepEqual(entfalten(falten(lang)), [lang]);
});

test('Escape-Zeichen: \\, \; \\\\ \\n', () => {
  assert.equal(textEntschluesseln('Sport\\, WAK 1\; Halle\\\\2\\nRaum 3'), 'Sport, WAK 1; Halle\\2\nRaum 3');
  assert.equal(textEntschluesseln(esc('a,b;c\\d\ne')), 'a,b;c\\d\ne');
});

test('Zeile mit Parametern und Anführungszeichen', () => {
  const z = zeileLesen('DTSTART;TZID=Europe/Berlin:20261025T100000');
  assert.deepEqual([z.name, z.params.TZID, z.wert], ['DTSTART', 'Europe/Berlin', '20261025T100000']);
  const q = zeileLesen('ATTENDEE;CN="Muster; Erika":mailto:a@b.de');
  assert.equal(q.params.CN, 'Muster; Erika');
  assert.equal(q.wert, 'mailto:a@b.de');
  assert.equal(zeileLesen('KEINDOPPELPUNKT'), null);
});

test('Zeitzone Europe/Berlin über die Sommerzeit-Umstellung am 25.10.2026', () => {
  assert.equal(versatzMinuten(Date.UTC(2026, 9, 24, 12), 'Europe/Berlin'), 120, 'Samstag: Sommerzeit');
  assert.equal(versatzMinuten(Date.UTC(2026, 9, 25, 12), 'Europe/Berlin'), 60, 'Sonntag nach 03:00: Normalzeit');
  assert.equal(versatzMinuten(Date.UTC(2026, 9, 25, 0, 30), 'Europe/Berlin'), 120, '02:30 Sommerzeit liegt vor der Umstellung');
  // UTC-Zeiten werden in Ortszeit umgerechnet
  const vor = zeitLesen('20261024T070000Z');
  const nach = zeitLesen('20261026T070000Z');
  assert.deepEqual([vor.datum, vor.uhrzeit], ['2026-10-24', '09:00']);
  assert.deepEqual([nach.datum, nach.uhrzeit], ['2026-10-26', '08:00']);
  // lokale Zeit mit TZID bleibt wie angegeben
  const lokal = zeitLesen('20261025T100000', { TZID: 'Europe/Berlin' });
  assert.deepEqual([lokal.datum, lokal.uhrzeit], ['2026-10-25', '10:00']);
  assert.equal(lokal.ms, Date.UTC(2026, 9, 25, 9, 0), '10:00 Normalzeit = 09:00 UTC');
  // Mitternacht-Grenze: 23:30 UTC im Sommer ist am nächsten Tag um 01:30
  const mn = zeitLesen('20260630T233000Z');
  assert.deepEqual([mn.datum, mn.uhrzeit], ['2026-07-01', '01:30']);
});

test('Doppelte Stunde über die Umstellung: 01:00 bis 04:00 Ortszeit sind 4 echte Stunden', () => {
  const [e] = icalLesen(kalender([vevent({ uid: 'u1', summary: 'Nachtschicht', start: '20261025T010000', ende: '20261025T040000' })]));
  assert.equal((e.endeMs - e.startMs) / 3600000, 4);
  assert.equal(e.uhrzeit, '01:00');
  assert.equal(e.ende, '04:00');
  const [f] = icalLesen(kalender([vevent({ uid: 'u2', summary: 'Tag davor', start: '20261024T010000', ende: '20261024T040000' })]));
  assert.equal((f.endeMs - f.startMs) / 3600000, 3);
});

test('Andere Zeitzone (TZID=America/New_York) wird nach Berlin umgerechnet; unbekannte TZID gilt als Berlin', () => {
  const [a] = icalLesen(kalender([vevent({ uid: 'u', summary: 'X', start: '20261026T080000', ende: '20261026T090000', tz: 'America/New_York' })]));
  assert.equal(a.uhrzeit, '13:00');
  const t = zeitLesen('20261026T080000', { TZID: 'Mitteleuropaeische Zeit' });
  assert.equal(t.uhrzeit, '08:00');
});

test('Ereignis lesen: UID, Summary, Ort, Beschreibung, Status; VALARM und VTIMEZONE stören nicht', () => {
  const text = kalender([vevent({ uid: 'abc-1', summary: 'WAK 1, Sport', start: '20261026T080000', ende: '20261026T093000', location: 'Halle 2', description: 'Lehrkraft XY\nVertretung', alarm: true })]);
  const ev = icalLesen(text);
  assert.equal(ev.length, 1);
  assert.deepEqual([ev[0].uid, ev[0].summary, ev[0].location, ev[0].description], ['abc-1', 'WAK 1, Sport', 'Halle 2', 'Lehrkraft XY\nVertretung']);
  assert.deepEqual([ev[0].datum, ev[0].uhrzeit, ev[0].ende], ['2026-10-26', '08:00', '09:30']);
  assert.equal(ev[0].abgesagt, false);
});

test('Sehr lange, gefaltete Summary mit Sonderzeichen und LF-Zeilenenden', () => {
  const lang = 'Sport, Klasse FIA 25; Gruppe 2 (Halle \\ Platz) ' + 'x'.repeat(100);
  const text = kalender([vevent({ uid: 'u', summary: lang, start: '20261026T080000', ende: '20261026T084500' })], { zeilenende: '\n' });
  const [e] = icalLesen(text);
  assert.equal(e.summary, lang);
});

test('Ausfall: STATUS:CANCELLED (und Hinweis im Text) wird als abgesagt erkannt', () => {
  const ev = icalLesen(kalender([
    vevent({ uid: '1', summary: 'WAK 1 Sport', start: '20261026T080000', ende: '20261026T084500', status: 'CANCELLED' }),
    vevent({ uid: '2', summary: 'WAK 1 Sport', start: '20261027T080000', ende: '20261027T084500', status: 'CONFIRMED' }),
    vevent({ uid: '3', summary: 'WAK 1 Sport', start: '20261028T080000', ende: '20261028T084500', description: 'Stunde entfällt' }),
    vevent({ uid: '4', summary: 'WAK 1 Sport', start: '20261029T080000', ende: '20261029T084500' }),
  ]));
  assert.deepEqual(ev.map((e) => e.abgesagt), [true, false, true, false]);
});

test('Ganztägige Ereignisse (VALUE=DATE), fehlendes DTEND, DURATION, defekte Einträge', () => {
  const ev = icalLesen(kalender([
    vevent({ uid: 'f', summary: 'Herbstferien', start: '20261026', ende: '20261031' }),
    vevent({ uid: 'o', summary: 'Ohne Ende', start: '20261026T080000', ohneEnde: true }),
    vevent({ uid: 'd', summary: 'Mit Dauer', start: '20261026T080000', dauer: 'PT1H30M' }),
  ]) + 'BEGIN:VEVENT\r\nUID:kaputt\r\nSUMMARY:ohne Start\r\nEND:VEVENT\r\n');
  assert.equal(ev.length, 3, 'Eintrag ohne DTSTART wird übersprungen');
  assert.equal(ev[0].ganztaegig, true);
  assert.equal(ev[1].ende, '');
  assert.equal(ev[1].endeMs, ev[1].startMs);
  assert.equal(ev[2].ende, '09:30');
  assert.equal(dauerMs('PT45M'), 45 * 60000);
  assert.equal(dauerMs('P1DT2H'), 26 * 3600000);
  assert.equal(dauerMs('quatsch'), null);
});

test('Leere und fremde Eingaben ergeben keine Ereignisse', () => {
  assert.deepEqual(icalLesen(''), []);
  assert.deepEqual(icalLesen('kein kalender'), []);
  assert.equal(ortszeitZuMs(2026, 10, 25, 12, 0, 0, 'Europe/Berlin'), Date.UTC(2026, 9, 25, 11));
});
