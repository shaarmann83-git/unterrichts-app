import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vevent, kalender } from './hilfen-ics.js';
import { icalLesen } from '../js/ical.js';
import {
  kombinationen, klasseVorschlag, doppelstundenZusammenfassen, importPlanen, importAnwenden, jetztVorschlag,
  eintraegeAb, eintraegeAm, terminHatEintraege, stundenplanEinstellung,
} from '../js/stundenplan.js';
import { neueKlasse, neuesBuch, neueReihe, pruefeBuch } from '../js/modell.js';
import { ortszeitZuMs } from '../js/ical.js';

const lesen = (events) => icalLesen(kalender(events));
const ev = (uid, summary, start, ende, extra = {}) => vevent({ uid, summary, start, ende, ...extra });

function buch() {
  const sport = neueKlasse({ klasse: 'WAK 1', fachtyp: 'sport', schuljahr: '2026/27' });
  const lf = neueKlasse({ klasse: 'FIA 25', lernfeldNr: '3', lernfeldBez: 'Geschäftsprozesse' });
  const b = neuesBuch(sport);
  b.klassen.push(lf);
  const r1 = neueReihe('Badminton');
  const r2 = neueReihe('Volleyball');
  sport.sport.reihen.push(r1, r2);
  return { b, sport, lf, r1, r2 };
}

// Erfundener Stundenplan: Mo 26.10., Di 27.10.2026 (nach der Umstellung)
const PLAN = () => lesen([
  ev('s1', 'WAK 1 Sport', '20261026T080000', '20261026T084500'),
  ev('s2', 'WAK 1 Sport', '20261026T084500', '20261026T093000'),
  ev('s3', 'WAK 1 Sport', '20261028T080000', '20261028T093000'),
  ev('l1', 'FIA 25 LF3', '20261026T100000', '20261026T114500', { location: 'Raum 12' }),
  ev('x1', 'Aufsicht Hof', '20261026T120000', '20261026T121500'),
  ev('f1', 'Herbstferien', '20261031', '20261107'),
]);

test('Kombinationen „Klasse + Fach“: Vorschlag aus dem Klassennamen, Ferien (ganztägig) zählen nicht', () => {
  const { b, sport, lf } = buch();
  const k = kombinationen(b, PLAN());
  assert.deepEqual(k.map((x) => [x.text, x.anzahl]), [['Aufsicht Hof', 1], ['FIA 25 LF3', 1], ['WAK 1 Sport', 3]]);
  const v = Object.fromEntries(k.map((x) => [x.text, x.vorschlag]));
  assert.equal(v['WAK 1 Sport'], sport.id);
  assert.equal(v['FIA 25 LF3'], lf.id);
  assert.equal(v['Aufsicht Hof'], '', 'ohne Treffer kein Vorschlag');
});

test('Klassenname nur als ganzes Wort („WAK 1“ passt nicht auf „WAK 12“)', () => {
  const { b, sport } = buch();
  const [e12] = lesen([ev('a', 'WAK 12 Sport', '20261026T080000', '20261026T084500')]);
  const [e1] = lesen([ev('a', 'wak 1  Sport, Halle', '20261026T080000', '20261026T084500')]);
  assert.equal(klasseVorschlag(b, e12), '');
  assert.equal(klasseVorschlag(b, e1), sport.id);
});

test('Doppelstunden werden zu einem Termin: Beginn der ersten bis Ende der letzten Stunde', () => {
  const l = doppelstundenZusammenfassen(lesen([
    ev('1', 'WAK 1 Sport', '20261026T080000', '20261026T084500'),
    ev('2', 'WAK 1 Sport', '20261026T084500', '20261026T093000'),
    ev('3', 'WAK 1 Sport', '20261026T093500', '20261026T102000'), // 5 Minuten Pause: dritte Stunde
    ev('4', 'WAK 1 Sport', '20261026T120000', '20261026T124500'), // drei Stunden später: eigener Termin
    ev('5', 'FIA 25', '20261026T084500', '20261026T093000'), // andere Klasse zur selben Zeit
    ev('6', 'WAK 1 Sport', '20261027T080000', '20261027T084500'), // anderer Tag
  ]));
  const sp = l.filter((x) => x.schluessel === 'wak 1 sport');
  assert.deepEqual(sp.map((x) => [x.datum, x.uhrzeit, x.ende, x.stunden, x.uids.join('+')]), [
    ['2026-10-26', '08:00', '10:20', 3, '1+2+3'],
    ['2026-10-26', '12:00', '12:45', 1, '4'],
    ['2026-10-27', '08:00', '08:45', 1, '6'],
  ]);
  assert.equal(l.filter((x) => x.schluessel === 'fia 25').length, 1);
});

test('Ausgefallene und normale Stunden werden nicht zusammengefasst', () => {
  const l = doppelstundenZusammenfassen(lesen([
    ev('1', 'WAK 1 Sport', '20261026T080000', '20261026T084500'),
    ev('2', 'WAK 1 Sport', '20261026T084500', '20261026T093000', { status: 'CANCELLED' }),
  ]));
  assert.equal(l.length, 2);
});

function importiere(b, ereignisse, zuordnung, jetzt) {
  const plan = importPlanen(b, ereignisse, zuordnung, jetzt);
  importAnwenden(b, plan, zuordnung);
  return plan;
}
const ZU = (sport, lf) => ({ 'wak 1 sport': sport.id, 'fia 25 lf3': lf.id, 'aufsicht hof': 'ignorieren' });
const VOR = ortszeitZuMs(2026, 10, 20, 12, 0, 0, 'Europe/Berlin'); // „jetzt“ vor dem Plan

test('Erster Import: Sport-Klasse bekommt Termine (Doppelstunde als einer), Lernfeld-Klasse nur Vorschläge, ignorierte Kombination nichts', () => {
  const { b, sport, lf } = buch();
  const plan = importiere(b, PLAN(), ZU(sport, lf), VOR);
  assert.deepEqual(plan.nichtZugeordnet, []);
  assert.deepEqual(sport.sport.termine.map((t) => [t.datum, t.uhrzeit, t.ende, t.quelle]), [['2026-10-26', '08:00', '09:30', 'ical'], ['2026-10-28', '08:00', '09:30', 'ical']]);
  assert.equal(sport.sport.termine[0].uid, 's1');
  assert.deepEqual(sport.sport.termine[0].uids, ['s1', 's2']);
  assert.equal(sport.stundenplan.length, 2);
  assert.equal(lf.sport.termine.length, 0);
  assert.equal(lf.stundenplan.length, 1);
  assert.equal(lf.stundenplan[0].uhrzeit, '10:00');
  assert.equal(stundenplanEinstellung(b).zuordnung['wak 1 sport'], sport.id);
  assert.ok(stundenplanEinstellung(b).letzterImport);
});

test('Nicht zugeordnete Kombinationen werden gemeldet und nichts angelegt', () => {
  const { b, sport } = buch();
  const plan = importPlanen(b, PLAN(), { 'wak 1 sport': sport.id }, VOR);
  assert.deepEqual(plan.nichtZugeordnet.sort(), ['aufsicht hof', 'fia 25 lf3']);
});

test('Neue Sport-Termine übernehmen die Reihe vom vorherigen Termin', () => {
  const { b, sport, lf, r1, r2 } = buch();
  // vorhandene Termine mit Reihen (von Hand)
  sport.sport.termine.push({ id: 'h1', datum: '2026-10-19', uhrzeit: '', reihe: r1.id, pruefungstag: false, vermerk: '', halbjahr: 1 });
  importiere(b, PLAN(), ZU(sport, lf), VOR);
  const ical = sport.sport.termine.filter((t) => t.quelle === 'ical');
  assert.deepEqual(ical.map((t) => t.reihe), [r1.id, r1.id], 'Reihe vom vorherigen Termin');
  // später: Reihenwechsel von Hand, neuer Termin danach erbt die neue Reihe
  ical[1].reihe = r2.id; // 28.10.: Wechsel zur Volleyball-Reihe
  const spaeter = lesen([ev('s4', 'WAK 1 Sport', '20261102T080000', '20261102T093000'), ev('s5', 'WAK 1 Sport', '20261030T080000', '20261030T093000')]);
  importiere(b, spaeter, ZU(sport, lf), VOR);
  const nach = Object.fromEntries(sport.sport.termine.map((t) => [t.uid, t.reihe]));
  assert.equal(nach.s5, r2.id, '30.10. folgt auf den 28.10. (jetzt Volleyball)');
  assert.equal(nach.s4, r2.id, '02.11. folgt auf den 30.10.');
  assert.equal(nach.s1, r1.id, 'frühere Termine bleiben unverändert');
});

test('Von Hand angelegter Termin am selben Tag: kein Duplikat, Hinweis „übersprungen“; von Hand angelegte Termine bleiben unverändert', () => {
  const { b, sport, lf } = buch();
  sport.sport.termine.push({ id: 'hand', datum: '2026-10-26', uhrzeit: '', reihe: '', pruefungstag: false, vermerk: 'Turnier', halbjahr: 1 });
  const plan = importiere(b, PLAN(), ZU(sport, lf), VOR);
  assert.equal(sport.sport.termine.filter((t) => t.datum === '2026-10-26').length, 1);
  assert.equal(plan.klassen.find((k) => k.klasse === sport).uebersprungen.length, 1);
  assert.equal(sport.sport.termine.find((t) => t.id === 'hand').vermerk, 'Turnier');
  assert.ok(!sport.sport.termine.find((t) => t.id === 'hand').uid);
});

test('Ausgefallene Stunde: als „ausgefallen“ gespeichert, aber kein Termin angelegt', () => {
  const { b, sport, lf } = buch();
  const plan = importiere(b, lesen([ev('a1', 'WAK 1 Sport', '20261026T080000', '20261026T084500', { status: 'CANCELLED' }), ev('a2', 'WAK 1 Sport', '20261027T080000', '20261027T084500')]), ZU(sport, lf), VOR);
  assert.deepEqual(sport.sport.termine.map((t) => t.uid), ['a2']);
  assert.deepEqual(sport.stundenplan.map((e) => [e.uid, e.status]), [['a1', 'ausgefallen'], ['a2', 'ok']]);
  assert.equal(plan.klassen.find((k) => k.klasse === sport).ausgefallen.length, 1);
});

test('Vertretung nur bei zugeordneter Klasse: Kombination ohne Zuordnung legt nichts an', () => {
  const { b, sport } = buch();
  const plan = importiere(b, lesen([ev('v1', 'WAK 1 Sport (Vertretung)', '20261026T080000', '20261026T084500')]), { 'wak 1 sport': sport.id }, VOR);
  assert.deepEqual(plan.nichtZugeordnet, ['wak 1 sport (vertretung)']);
  assert.equal(sport.sport.termine.length, 0);
});

test('Erneuter Import: gleiche Datei ändert nichts (UID)', () => {
  const { b, sport, lf } = buch();
  importiere(b, PLAN(), ZU(sport, lf), VOR);
  const vorher = JSON.stringify([sport.sport.termine, sport.stundenplan, lf.stundenplan]);
  const plan = importiere(b, PLAN(), ZU(sport, lf), VOR);
  for (const k of plan.klassen) assert.deepEqual([k.neu.length, k.geaendert.length, k.entfallen.length, k.abweichungen.length], [0, 0, 0, 0]);
  assert.equal(JSON.stringify([sport.sport.termine, sport.stundenplan, lf.stundenplan]).replace(/"importiert":"[^"]+"/g, ''), vorher.replace(/"importiert":"[^"]+"/g, ''));
});

test('Erneuter Import: geänderter Termin (leer, Zukunft) wird verschoben, entfallener (leer, Zukunft) entfernt', () => {
  const { b, sport, lf } = buch();
  importiere(b, PLAN(), ZU(sport, lf), VOR);
  const neu = lesen([
    ev('s1', 'WAK 1 Sport', '20261026T090000', '20261026T103000'), // verschoben (Doppelstunde: UID s1)
    ev('s2', 'WAK 1 Sport', '20261026T103000', '20261026T112000'),
    // s3 (28.10.) fällt weg; der Zeitraum der Datei reicht bis 30.10.
    ev('l1', 'FIA 25 LF3', '20261026T100000', '20261026T114500'),
    ev('l2', 'FIA 25 LF3', '20261030T100000', '20261030T114500'),
  ]);
  const plan = importiere(b, neu, ZU(sport, lf), VOR);
  const k = plan.klassen.find((x) => x.klasse === sport);
  assert.equal(k.geaendert.length, 1);
  assert.equal(k.entfallen.length, 1);
  assert.deepEqual(sport.sport.termine.map((t) => [t.datum, t.uhrzeit, t.ende]), [['2026-10-26', '09:00', '11:20']]);
  assert.equal(sport.stundenplan.length, 1);
  assert.equal(k.abweichungen.length, 0);
});

test('Termine mit Einträgen werden nie verändert; Abweichungen kommen in die Änderungsliste', () => {
  const { b, sport, lf } = buch();
  importiere(b, PLAN(), ZU(sport, lf), VOR);
  const [t1, t2] = sport.sport.termine;
  sport.sport.anwesenheit[t1.id] = { [sport.schueler[0].id]: { z: '.' } }; // Anwesenheit
  t2.vermerk = 'Prüfungsvorbereitung'; // Notiz
  assert.equal(terminHatEintraege(sport, t1), true);
  assert.equal(terminHatEintraege(sport, t2), true);
  const neu = lesen([ev('s1', 'WAK 1 Sport', '20261026T090000', '20261026T103000'), ev('l1', 'FIA 25 LF3', '20261026T100000', '20261026T114500'), ev('l2', 'FIA 25 LF3', '20261030T100000', '20261030T114500')]); // s1 verschoben, s3 entfallen (Zeitraum bis 30.10.)
  const plan = importiere(b, neu, ZU(sport, lf), VOR);
  const k = plan.klassen.find((x) => x.klasse === sport);
  assert.deepEqual(k.abweichungen.map((a) => a.art).sort(), ['entfallen', 'geaendert']);
  assert.deepEqual(sport.sport.termine.map((t) => [t.datum, t.uhrzeit]), [['2026-10-26', '08:00'], ['2026-10-28', '08:00']], 'beide Termine unverändert');
  assert.equal(sport.sport.anwesenheit[t1.id][sport.schueler[0].id].z, '.');
  assert.equal(t2.vermerk, 'Prüfungsvorbereitung');
});

test('Termine in der Vergangenheit werden nicht verändert, auch wenn sie leer sind', () => {
  const { b, sport, lf } = buch();
  importiere(b, PLAN(), ZU(sport, lf), VOR);
  const spaetJetzt = ortszeitZuMs(2026, 10, 27, 12, 0, 0, 'Europe/Berlin'); // 26.10. liegt dann in der Vergangenheit
  const neu = lesen([ev('s1', 'WAK 1 Sport', '20261026T090000', '20261026T103000'), ev('s2', 'WAK 1 Sport', '20261026T103000', '20261026T112000'), ev('s3', 'WAK 1 Sport', '20261028T100000', '20261028T113000'), ev('l1', 'FIA 25 LF3', '20261026T100000', '20261026T114500')]);
  const plan = importiere(b, neu, ZU(sport, lf), spaetJetzt);
  assert.deepEqual(sport.sport.termine.map((t) => [t.datum, t.uhrzeit]), [['2026-10-26', '08:00'], ['2026-10-28', '10:00']], '26.10. (vergangen) bleibt, 28.10. (Zukunft) wird verschoben');
  assert.equal(plan.klassen.find((k) => k.klasse === sport).abweichungen.length, 0);
});

test('Termin in Untis ausgefallen: leere Zukunft wird entfernt, mit Einträgen als Abweichung gemeldet', () => {
  const { b, sport, lf } = buch();
  importiere(b, PLAN(), ZU(sport, lf), VOR);
  sport.sport.mitarbeit[sport.sport.termine[1].id] = { [sport.schueler[0].id]: 3 };
  const neu = lesen([ev('s1', 'WAK 1 Sport', '20261026T080000', '20261026T084500', { status: 'CANCELLED' }), ev('s2', 'WAK 1 Sport', '20261026T084500', '20261026T093000', { status: 'CANCELLED' }), ev('s3', 'WAK 1 Sport', '20261028T080000', '20261028T093000', { status: 'CANCELLED' }), ev('l1', 'FIA 25 LF3', '20261026T100000', '20261026T114500')]);
  const plan = importiere(b, neu, ZU(sport, lf), VOR);
  const k = plan.klassen.find((x) => x.klasse === sport);
  assert.equal(sport.sport.termine.length, 1, 'der leere Termin vom 26.10. ist weg');
  assert.equal(sport.sport.termine[0].datum, '2026-10-28');
  assert.deepEqual(k.abweichungen.map((a) => a.art), ['ausgefallen']);
  assert.ok(sport.stundenplan.every((e) => e.status === 'ausgefallen'));
});

test('Lernfeld-Klasse: Vorschläge werden bei erneutem Import frei aktualisiert und entfernt', () => {
  const { b, sport, lf } = buch();
  importiere(b, PLAN(), ZU(sport, lf), VOR);
  importiere(b, lesen([ev('l1', 'FIA 25 LF3', '20261026T110000', '20261026T124500'), ev('s1', 'WAK 1 Sport', '20261026T080000', '20261026T084500'), ev('s2', 'WAK 1 Sport', '20261026T084500', '20261026T093000'), ev('s3', 'WAK 1 Sport', '20261028T080000', '20261028T093000')]), ZU(sport, lf), VOR);
  assert.equal(lf.stundenplan[0].uhrzeit, '11:00');
  importiere(b, lesen([ev('s1', 'WAK 1 Sport', '20261026T080000', '20261026T084500'), ev('s2', 'WAK 1 Sport', '20261026T084500', '20261026T093000'), ev('s3', 'WAK 1 Sport', '20261028T080000', '20261028T093000')]), ZU(sport, lf), VOR);
  assert.equal(lf.stundenplan.length, 0);
});

test('Außerhalb des Zeitraums der neuen Datei bleibt Bestehendes unverändert (kein „entfallen“)', () => {
  const { b, sport, lf } = buch();
  importiere(b, PLAN(), ZU(sport, lf), VOR);
  const nurNachher = lesen([ev('n1', 'WAK 1 Sport', '20261109T080000', '20261109T093000')]);
  const plan = importiere(b, nurNachher, ZU(sport, lf), VOR);
  assert.equal(plan.klassen.find((k) => k.klasse === sport).entfallen.length, 0);
  assert.equal(sport.sport.termine.length, 3);
});

test('Startvorschlag „jetzt“: laufende Einheit, Beginn in den nächsten 30 Minuten, sonst keiner', () => {
  const { b, sport, lf } = buch();
  importiere(b, PLAN(), ZU(sport, lf), VOR);
  const um = (h, m, tag = 26) => ortszeitZuMs(2026, 10, tag, h, m, 0, 'Europe/Berlin');
  let v = jetztVorschlag(b, um(8, 30));
  assert.equal(v.laeuft, true);
  assert.equal(v.text, 'Jetzt: WAK 1 Sport – Einheit erfassen');
  assert.equal(v.klasse.id, sport.id);
  assert.equal(v.terminId, sport.sport.termine[0].id);
  v = jetztVorschlag(b, um(7, 40));
  assert.equal(v.laeuft, false);
  assert.equal(v.inMinuten, 20);
  assert.equal(jetztVorschlag(b, um(7, 20)), null, '40 Minuten vorher: noch nichts');
  assert.equal(jetztVorschlag(b, um(9, 31)).klasse.id, lf.id, 'nach dem Ende der Sport-Einheit: die Lernfeld-Stunde um 10:00 steht in 29 Minuten an');
  assert.equal(jetztVorschlag(b, um(11, 50)), null, 'nach der letzten Stunde');
  v = jetztVorschlag(b, um(10, 5));
  assert.equal(v.klasse.id, lf.id);
  assert.equal(v.text, 'Jetzt: FIA 25 Geschäftsprozesse – Stunde notieren');
  assert.equal(jetztVorschlag(b, um(8, 30, 27)), null, 'anderer Tag');
});

test('Startvorschlag: ausgefallene Stunden zählen nicht; laufende vor kommender', () => {
  const { b, sport, lf } = buch();
  importiere(b, lesen([ev('a', 'WAK 1 Sport', '20261026T080000', '20261026T093000', { status: 'CANCELLED' }), ev('l1', 'FIA 25 LF3', '20261026T084000', '20261026T093000')]), ZU(sport, lf), VOR);
  const v = jetztVorschlag(b, ortszeitZuMs(2026, 10, 26, 8, 30, 0, 'Europe/Berlin'));
  assert.equal(v.klasse.id, lf.id);
  assert.equal(v.laeuft, false);
  assert.equal(v.inMinuten, 10);
});

test('Vorschläge für Lernfeld: Einträge ab einem Datum und an einem Tag', () => {
  const { b, sport, lf } = buch();
  importiere(b, PLAN(), ZU(sport, lf), VOR);
  assert.deepEqual(eintraegeAm(lf, '2026-10-26').map((e) => e.uhrzeit), ['10:00']);
  assert.deepEqual(eintraegeAb(sport, '2026-10-27').map((e) => e.datum), ['2026-10-28']);
});

test('Gespeichertes Notenbuch mit Stundenplan übersteht pruefeBuch; alte Dateien bekommen leere Felder', () => {
  const { b, sport, lf } = buch();
  importiere(b, PLAN(), ZU(sport, lf), VOR);
  const kopie = pruefeBuch(JSON.parse(JSON.stringify(b)));
  assert.deepEqual(kopie.klassen[0].stundenplan, sport.stundenplan);
  assert.deepEqual(kopie.einstellungen.stundenplan.zuordnung, b.einstellungen.stundenplan.zuordnung);
  const alt = JSON.parse(JSON.stringify(b));
  delete alt.einstellungen.stundenplan;
  delete alt.klassen[0].stundenplan;
  const neu = pruefeBuch(alt);
  assert.deepEqual(neu.klassen[0].stundenplan, []);
  assert.deepEqual(neu.einstellungen.stundenplan.zuordnung, {});
});

test('Gemerkte Zuordnung wird beim nächsten Import vorgeschlagen (auch ohne Klassennamen im Text)', () => {
  const { b, sport, lf } = buch();
  importiere(b, lesen([ev('q1', 'Sport Gruppe A', '20261026T080000', '20261026T084500')]), { 'sport gruppe a': sport.id }, VOR);
  const k = kombinationen(b, lesen([ev('q2', 'Sport Gruppe A', '20261102T080000', '20261102T084500')]));
  assert.equal(k[0].vorschlag, sport.id);
  assert.equal(k[0].gemerkt, true);
  // gelöschte Klasse: Zuordnung gilt nicht mehr
  b.klassen = b.klassen.filter((x) => x.id !== sport.id);
  assert.equal(kombinationen(b, lesen([ev('q3', 'Sport Gruppe A', '20261109T080000', '20261109T084500')]))[0].vorschlag, '');
});

test('WebUntis-Format: Fach im Titel, Klasse und Lehrkürzel in der Beschreibung', () => {
  const { b, sport } = buch();
  const plan = lesen([
    ev('w1', 'SP', '20261028T113000', '20261028T130000', { tz: 'Europe/Vienna', location: 'SPHA', description: 'WAK 1 HM' }),
    ev('w2', 'SP', '20261029T080000', '20261029T093000', { tz: 'Europe/Vienna', location: 'SPHA', description: 'WKM1-1 HM' }),
    ev('w3', 'SP', '20261104T113000', '20261104T130000', { tz: 'Europe/Vienna', location: 'SPHA', description: 'WAK 1 XY' }),
    ev('w4', 'DALTON', '20261030T080000', '20261030T093000', { description: 'WKM1-2; WKM2-2 BA; HM' }),
    ev('w5', '', '20261028T130000', '20261028T133000', { location: 'Außen', description: 'HM' }),
  ]);
  const k = kombinationen(b, plan);
  // Vertretung (anderes Lehrkürzel) ergibt keine neue Kombination; Klassen werden getrennt.
  assert.deepEqual(k.map((x) => [x.text, x.anzahl]), [['DALTON · WKM1-2 WKM2-2', 1], ['HM', 1], ['SP · WAK 1', 2], ['SP · WKM1-1', 1]]);
  assert.equal(k.find((x) => x.text === 'SP · WAK 1').vorschlag, sport.id);
});
