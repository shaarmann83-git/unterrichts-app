import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xlsxLaden, KOPF_A, KOPF_B, zeileA, zeileB, xlsBytes } from './hilfen-untis.js';
import { tabelleAusDatei } from '../js/tabelle-datei.js';
import {
  formatErkennen, zeilenAusA, zeilenAusB, importPlanen, importAnwenden, personenZuordnen,
  untisFaecher, aufKlassenVerteilen, zeilenMitZuordnung, pruefsumme, zeitstempelAusName,
} from '../js/untis.js';
import { teilnahmeVorschlaege, vorschlagUebernehmen, nachschreibListe, deckt } from '../js/nachschreiben.js';
import { fehlzeitenSummen } from '../js/fehlzeiten.js';
import { neueKlasse, neuesBuch, neueKlassenarbeit } from '../js/modell.js';

xlsxLaden();

function klasse() {
  const k = neueKlasse({ klasse: 'TEST-A', schuljahr: '2025/26' });
  k.schueler = k.schueler.slice(0, 4);
  [['Muster', 'Erika'], ['Beispiel', 'Max'], ['Probe', 'Sam'], ['Von Test', 'Anna Lena']].forEach(([n, v], i) => { k.schueler[i].name = n; k.schueler[i].vorname = v; });
  return k;
}
const person = (k, name) => k.schueler.find((s) => s.name === name);

function dateiA(zeilen) {
  return zeilenAusA(tabelleAusDatei(xlsBytes(KOPF_A, zeilen), 'AbsencePerStudent_20251020_0930.xls'));
}
function dateiB(zeilen) {
  return zeilenAusB(tabelleAusDatei(xlsBytes(KOPF_B, zeilen), 'AbsenceList_20251020_0930.xls'));
}

const B_ZEILEN = [
  zeileB({ name: 'Muster', vorname: 'Erika', id: 'E1001', von: '2025-10-14', bis: '2025-10-16', zeitVon: '07:30', zeitBis: '15:00', status: 'entschuldigt mit Attest' }),
  zeileB({ name: 'Beispiel', vorname: 'Max', id: 'E1002', von: '2025-10-20', zeitVon: '08:00', zeitBis: '12:00', status: 'nicht entschuldigt', grund: '' }),
  zeileB({ name: 'Probe', vorname: 'Sam', id: 'E1003', von: '2025-10-21', status: 'offen' }),
  zeileB({ name: 'Fremd', vorname: 'Frieda', id: 'E9999', klasse: 'ANDERE-B', von: '2025-10-21', status: 'entschuldigt' }),
];

test('Format wird an der Kopfzeile erkannt (xls, Leerzeilen am Ende)', () => {
  const a = tabelleAusDatei(xlsBytes(KOPF_A, [zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-14' })]), 'x.xls');
  const b = tabelleAusDatei(xlsBytes(KOPF_B, B_ZEILEN), 'y.xls');
  assert.equal(formatErkennen(a), 'A');
  assert.equal(formatErkennen(b), 'B');
  assert.equal(formatErkennen([['Foo', 'Bar'], [1, 2]]), null);
  assert.equal(a.length, 2, 'Leerzeilen wurden übersprungen');
});

test('Format A: doppelte Spalte „Text“, Datum, Status, „Abwesenheit zählt“', () => {
  const z = dateiA([
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-14', stunde: 1, text: 'Arzttermin' }),
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-15', stunde: 3, status: 'nicht entsch.', std: 2 }),
    zeileA({ name: 'Beispiel Max', id: 'E1002', datum: '2025-10-15', zaehlt: 'false', status: 'offen' }),
  ]);
  assert.equal(z.length, 3);
  assert.equal(z[0].datum, '2025-10-14');
  assert.equal(z[0].notiz, 'Arzttermin', 'zweite Spalte „Text“ wird ausgewertet');
  assert.equal(z[0].status, 'entschuldigt');
  assert.equal(z[1].status, 'nicht');
  assert.equal(z[1].std, 2);
  assert.equal(z[2].status, 'offen');
  assert.equal(z[2].zaehlt, false);
  assert.equal(z[0].stunde, 1);
});

test('Format B: Datum und Uhrzeit als Text, Status mit Attest', () => {
  const z = dateiB(B_ZEILEN);
  assert.equal(z.length, 4);
  assert.deepEqual([z[0].datum, z[0].datumBis, z[0].zeitVon, z[0].zeitBis, z[0].status], ['2025-10-14', '2025-10-16', '07:30', '15:00', 'attest']);
  assert.equal(z[1].datumBis, '');
  assert.equal(z[1].status, 'nicht');
  assert.equal(z[2].status, 'offen');
});

test('Zuordnung: zuerst über die ID, sonst über den Namen; ID wird gespeichert', () => {
  const k = klasse();
  person(k, 'Beispiel').untisId = 'E1002';
  const z = dateiB(B_ZEILEN).slice(0, 3);
  const m = personenZuordnen(k, z);
  assert.equal(m.get('id:E1001').status, 'name');
  assert.equal(m.get('id:E1002').status, 'id');
  const plan = importPlanen(k, { a: [], b: z });
  assert.equal(plan.uebernommen, 3);
  importAnwenden(k, plan);
  assert.equal(person(k, 'Muster').untisId, 'E1001');
  assert.equal(person(k, 'Probe').untisId, 'E1003');
  // zweiter Import nutzt jetzt die IDs, auch wenn sich ein Name geändert hat
  person(k, 'Muster').name = 'Muster-Neu';
  assert.equal(personenZuordnen(k, z).get('id:E1001').status, 'id');
});

test('Zuordnung Format A über Namen: Nachname und Vorname in einer Zelle, Groß-/Kleinschreibung und Leerzeichen egal', () => {
  const k = klasse();
  const z = dateiA([
    zeileA({ name: '  MUSTER   erika ', id: '', datum: '2025-10-14' }),
    zeileA({ name: 'Von Test Anna Lena', id: '', datum: '2025-10-14' }),
    zeileA({ name: 'Unbekannt Uwe', id: '', datum: '2025-10-14' }),
  ]);
  const m = personenZuordnen(k, z);
  assert.equal(m.get('name:muster erika').status, 'name');
  assert.equal(m.get('name:von test anna lena').status, 'name');
  assert.equal(m.get('name:unbekannt uwe').status, 'unbekannt');
  const plan = importPlanen(k, { a: z, b: [] });
  assert.equal(plan.uebernommen, 2);
  assert.equal(plan.unzugeordnet.length, 1);
  assert.equal(plan.unzugeordnet[0].name, 'Unbekannt Uwe');
});

test('Mehrdeutige Namen werden nicht geraten, manuelle Zuordnung und Überspringen funktionieren', () => {
  const k = klasse();
  k.schueler[3].name = 'Muster';
  k.schueler[3].vorname = 'Erika';
  const z = dateiB([zeileB({ name: 'Muster', vorname: 'Erika', id: '', von: '2025-10-14' })]);
  assert.equal(personenZuordnen(k, z).get('name:muster|erika').status, 'mehrdeutig');
  let plan = importPlanen(k, { a: [], b: z });
  assert.equal(plan.uebernommen, 0);
  assert.equal(plan.unzugeordnet[0].kandidaten.length, 2);
  plan = importPlanen(k, { a: [], b: z }, { manuell: new Map([['name:muster|erika', k.schueler[3].id]]) });
  assert.equal(plan.uebernommen, 1);
  assert.equal(plan.fehlzeiten[0].schuelerId, k.schueler[3].id);
  plan = importPlanen(k, { a: [], b: z }, { manuell: new Map([['name:muster|erika', null]]) });
  assert.equal(plan.uebernommen, 0);
  assert.equal(plan.unzugeordnet.length, 0);
});

test('Fachfilter bei Format A', () => {
  const k = klasse();
  const z = dateiA([
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-14', fach: 'AK3-LF10' }),
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-14', fach: 'AK3-LF11', stunde: 2 }),
  ]);
  assert.deepEqual(untisFaecher(z), ['AK3-LF10', 'AK3-LF11']);
  assert.equal(importPlanen(k, { a: z, b: [] }, { faecher: ['AK3-LF10'] }).uebernommen, 1);
  assert.equal(importPlanen(k, { a: z, b: [] }, { faecher: [] }).uebernommen, 2);
});

test('Klassenfilter: mehrere Klassen in einer Datei werden verteilt, unbekannte gemeldet', () => {
  const buch = neuesBuch(klasse());
  const zweite = neueKlasse({ klasse: 'FIA 25' });
  zweite.untis.klassenName = 'ANDERE-B';
  buch.klassen.push(zweite);
  const z = dateiB(B_ZEILEN.concat([zeileB({ name: 'X', vorname: 'Y', id: 'E5', klasse: 'GIBTS-NICHT', von: '2025-10-14' })]));
  const { proKlasse, unbekannt } = aufKlassenVerteilen(buch, z);
  assert.equal(proKlasse.get(buch.klassen[0].id).length, 3);
  assert.equal(proKlasse.get(zweite.id).length, 1);
  assert.deepEqual(unbekannt, ['GIBTS-NICHT']);
});

test('Format B allein: Nachschreib-Vorschläge (Attest, ohne Attest, offen), ohne KA-Uhrzeit genügt das Datum', () => {
  const k = klasse();
  importAnwenden(k, importPlanen(k, { a: [], b: dateiB(B_ZEILEN).slice(0, 3) }));
  const ka = neueKlassenarbeit(1);
  ka.datum = '2025-10-15'; // mitten im mehrtägigen Zeitraum von Muster
  const ka2 = neueKlassenarbeit(1);
  ka2.datum = '2025-10-20';
  const ka3 = neueKlassenarbeit(1);
  ka3.datum = '2025-10-21';
  k.klassenarbeiten = [ka, ka2, ka3];
  const v = teilnahmeVorschlaege(k);
  const wer = (n, i) => v.find((x) => x.person.name === n && x.kaIndex === i)?.vorschlag;
  assert.equal(wer('Muster', 0), 'attest-offen');
  assert.equal(wer('Beispiel', 1), 'ohne-attest');
  assert.equal(wer('Probe', 2), 'entschuldigung-offen');
  assert.equal(v.length, 3);
  assert.ok(v.every((x) => x.aenderung === false));
  // nichts wurde still übernommen
  assert.deepEqual(ka.teilnahme, {});
  vorschlagUebernehmen(v.find((x) => x.person.name === 'Muster'));
  assert.equal(ka.teilnahme[person(k, 'Muster').id].status, 'attest-offen');
});

test('Nachschreib-Vorschläge mit KA-Uhrzeit: Überschneidung, Randtage, mehrere Tage', () => {
  const k = klasse();
  importAnwenden(k, importPlanen(k, { a: [], b: dateiB(B_ZEILEN).slice(0, 3) }));
  const m = person(k, 'Muster');
  const b = person(k, 'Beispiel');
  const mit = (datum, von, bis) => { const ka = neueKlassenarbeit(1); Object.assign(ka, { datum, uhrzeitVon: von, uhrzeitBis: bis }); return ka; };
  // Beispiel fehlt 08:00 bis 12:00
  k.klassenarbeiten = [mit('2025-10-20', '09:00', '10:30'), mit('2025-10-20', '13:00', '14:00'), mit('2025-10-20', '11:30', '13:00'), mit('2025-10-20', '12:00', '13:00'), mit('2025-10-20', '07:00', '08:00')];
  const v = teilnahmeVorschlaege(k).filter((x) => x.person.id === b.id).map((x) => x.kaIndex);
  assert.deepEqual(v, [0, 2], 'überschneidet: 9–10:30 und 11:30–13; nicht: 13–14, 12–13 (Ende 12:00), 7–8 (Beginn 8:00)');
  // Muster: 14.10. ab 07:30 bis 16.10. 15:00
  k.klassenarbeiten = [mit('2025-10-14', '06:00', '07:30'), mit('2025-10-14', '07:00', '08:00'), mit('2025-10-15', '20:00', '21:00'), mit('2025-10-16', '14:00', '15:30'), mit('2025-10-16', '15:00', '16:00'), mit('2025-10-17', '08:00', '09:00')];
  const w = teilnahmeVorschlaege(k).filter((x) => x.person.id === m.id).map((x) => x.kaIndex);
  assert.deepEqual(w, [1, 2, 3], 'Tag 1 ab 7:30, ganzer Zwischentag, letzter Tag bis 15:00');
});

test('deckt(): ohne Datum nie, mit nur einer KA-Uhrzeit zählt das Datum', () => {
  const f = { quelle: 'untis-b', datum: '2025-10-14', datumBis: '', zeitVon: '08:00', zeitBis: '12:00' };
  assert.equal(deckt({ datum: '' }, f), false);
  assert.equal(deckt({ datum: '2025-10-14', uhrzeitVon: '13:00', uhrzeitBis: '' }, f), true);
  assert.equal(deckt({ datum: '2025-10-13' }, f), false);
});

test('Erneuter Import aktualisiert offene Fälle und zeigt die Änderung', () => {
  const k = klasse();
  const ka = neueKlassenarbeit(1);
  ka.datum = '2025-10-21';
  k.klassenarbeiten = [ka];
  importAnwenden(k, importPlanen(k, { a: [], b: dateiB(B_ZEILEN).slice(2, 3) })); // Probe: offen
  let v = teilnahmeVorschlaege(k);
  assert.equal(v[0].vorschlag, 'entschuldigung-offen');
  vorschlagUebernehmen(v[0]);
  assert.equal(teilnahmeVorschlaege(k).length, 0, 'bereits übernommen: kein neuer Vorschlag');
  // Später steht in Untis „entschuldigt mit Attest“
  const neu = dateiB([zeileB({ name: 'Probe', vorname: 'Sam', id: 'E1003', von: '2025-10-21', status: 'entschuldigt mit Attest' })]);
  const plan = importPlanen(k, { a: [], b: neu });
  assert.equal(plan.neu.length, 0);
  assert.equal(plan.geaendert.length, 1);
  assert.equal(plan.geaendert[0].vorher.status, 'offen');
  assert.equal(plan.geaendert[0].nachher.status, 'attest');
  importAnwenden(k, plan);
  v = teilnahmeVorschlaege(k);
  assert.equal(v.length, 1);
  assert.equal(v[0].aktuell, 'entschuldigung-offen');
  assert.equal(v[0].vorschlag, 'attest-offen');
  assert.equal(v[0].aenderung, true);
  // Ist schon nachgeschrieben, wird nichts mehr vorgeschlagen
  ka.teilnahme[v[0].person.id] = { status: 'nachgeschrieben', nachgeschriebenAm: '2025-11-03' };
  assert.equal(teilnahmeVorschlaege(k).length, 0);
});

test('Doppelimport erzeugt keine Doppelungen, manuelle Einträge bleiben', () => {
  const k = klasse();
  k.fehlzeiten.push({ id: 'm1', schuelerId: person(k, 'Muster').id, datum: '2025-10-15', status: 'entschuldigt', std: 2, min: 0, quelle: 'manuell' });
  const z = dateiB(B_ZEILEN).slice(0, 3);
  importAnwenden(k, importPlanen(k, { a: [], b: z }));
  assert.equal(k.fehlzeiten.length, 4);
  const plan = importPlanen(k, { a: [], b: z });
  assert.deepEqual([plan.neu.length, plan.geaendert.length, plan.weggefallen.length], [0, 0, 0]);
  importAnwenden(k, plan);
  assert.equal(k.fehlzeiten.length, 4);
  assert.ok(k.fehlzeiten.some((f) => f.id === 'm1'));
  // Zeile fällt in Untis weg: wird als weggefallen gemeldet und entfernt
  // Beispiel (20.10.) fehlt in der neuen Datei, liegt aber im Zeitraum der Datei (14.–21.10.)
  const nur = importPlanen(k, { a: [], b: [z[0], z[2]] });
  assert.equal(nur.weggefallen.length, 1);
  importAnwenden(k, nur);
  assert.equal(k.fehlzeiten.length, 3);
});

test('Doppelimport Format A: gleiche Fehlstunden bleiben, neue kommen dazu', () => {
  const k = klasse();
  const zeilen1 = [
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-14', stunde: 1 }),
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-14', stunde: 2 }),
  ];
  importAnwenden(k, importPlanen(k, { a: dateiA(zeilen1), b: [] }));
  assert.equal(k.fehlzeiten.length, 2);
  const zeilen2 = [...zeilen1, zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-14', stunde: 3 })];
  const plan = importPlanen(k, { a: dateiA(zeilen2), b: [] });
  assert.equal(plan.neu.length, 1);
  assert.equal(plan.weggefallen.length, 0);
  importAnwenden(k, plan);
  assert.equal(k.fehlzeiten.length, 3);
});

test('A und B kombiniert: „entsch.“ wird mit Attest in B zu „entschuldigt mit Attest“ (ID und Zeitraum)', () => {
  const k = klasse();
  const a = dateiA([
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-15', stunde: 2, status: 'entsch.' }), // im Zeitraum
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-17', stunde: 2, status: 'entsch.' }), // außerhalb
    zeileA({ name: 'Beispiel Max', id: 'E1002', datum: '2025-10-15', stunde: 2, status: 'entsch.' }), // andere Person
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-15', stunde: 3, status: 'nicht entsch.' }),
  ]);
  const b = dateiB(B_ZEILEN.slice(0, 1));
  const plan = importPlanen(k, { a, b });
  const st = (sid, datum, stunde) => plan.fehlzeiten.find((f) => f.quelle === 'untis-a' && f.schuelerId === sid && f.datum === datum && f.stunde === stunde)?.status;
  const m = person(k, 'Muster').id;
  assert.equal(st(m, '2025-10-15', 2), 'attest');
  assert.equal(st(m, '2025-10-17', 2), 'entschuldigt');
  assert.equal(st(person(k, 'Beispiel').id, '2025-10-15', 2), 'entschuldigt');
  assert.equal(st(m, '2025-10-15', 3), 'nicht');
  importAnwenden(k, plan);
  assert.equal(fehlzeitenSummen(k, m).attest, 1);
  assert.equal(fehlzeitenSummen(k, m).entschuldigt, 2);
});

test('Später nur A: ersetzt B-Zeiträume für dieselben Tage, Attest bleibt erhalten', () => {
  const k = klasse();
  importAnwenden(k, importPlanen(k, { a: [], b: dateiB(B_ZEILEN.slice(0, 1)) }));
  assert.equal(k.fehlzeiten.filter((f) => f.quelle === 'untis-b').length, 1);
  const a = dateiA([zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-15', stunde: 2, status: 'entsch.' })]);
  // A deckt nur einen Tag ab: der B-Zeitraum 14.–16. liegt nicht vollständig darin und bleibt
  importAnwenden(k, importPlanen(k, { a, b: [] }));
  assert.equal(k.fehlzeiten.filter((f) => f.quelle === 'untis-b').length, 1);
  const a2 = dateiA([
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-14', stunde: 1, status: 'entsch.' }),
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-16', stunde: 2, status: 'entsch.' }),
  ]);
  const plan = importPlanen(k, { a: a2, b: [] });
  importAnwenden(k, plan);
  assert.equal(k.fehlzeiten.filter((f) => f.quelle === 'untis-b').length, 0, 'B-Zeitraum liegt vollständig im A-Bereich und wird ersetzt');
  assert.ok(k.fehlzeiten.filter((f) => f.quelle === 'untis-a').every((f) => f.status === 'attest'));
});

test('Summen: nicht zählende Zeilen werden nicht summiert, Zeiträume zählen Werktage', () => {
  const k = klasse();
  const m = person(k, 'Muster').id;
  const a = dateiA([
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-14', std: 2, status: 'entsch.', tage: 0.4 }),
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-15', std: 1, status: 'nicht entsch.', tage: 0.2 }),
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-16', std: 1, status: 'offen', zaehlt: 'false', tage: 0.2 }),
    zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-17', std: 0, min: 20, status: 'entsch.', tage: 0 }),
  ]);
  importAnwenden(k, importPlanen(k, { a, b: [] }));
  const s = fehlzeitenSummen(k, m);
  assert.deepEqual([s.entschuldigt, s.nicht, s.offen, s.gesamt], [2, 1, 0, 3]);
  assert.equal(s.verspaetungen, 1);
  assert.ok(Math.abs(s.tage - 0.6) < 1e-9);
  const k2 = klasse();
  importAnwenden(k2, importPlanen(k2, { a: [], b: dateiB(B_ZEILEN.slice(0, 1)) }));
  assert.equal(fehlzeitenSummen(k2, person(k2, 'Muster').id).tage, 3); // Di–Do
});

test('Eigene Spaltenzuordnung für unbekannte Berichte', () => {
  const kopf = ['Nachname', 'Rufname', 'ab', 'bis', 'Art'];
  const roh = tabelleAusDatei(xlsBytes(kopf, [['Muster', 'Erika', '14.10.2025', '15.10.2025', 'entschuldigt mit Attest']]), 'neu.xls');
  assert.equal(formatErkennen(roh), null);
  const z = zeilenMitZuordnung(roh, { name: 0, vorname: 1, von: 2, bis: 3, status: 4 });
  assert.equal(z.length, 1);
  assert.deepEqual([z[0].datum, z[0].datumBis, z[0].status], ['2025-10-14', '2025-10-15', 'attest']);
});

test('Prüfsumme und Zeitstempel aus dem Dateinamen', async () => {
  const a = await pruefsumme(new TextEncoder().encode('abc'));
  assert.equal(a, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(zeitstempelAusName('AbsenceList_20251020_0930.xls'), '202510200930');
  assert.equal(zeitstempelAusName('AbsenceList.xls'), '');
});

test('Nachschreibliste über alle Klassen', () => {
  const buch = neuesBuch(klasse());
  const k2 = klasse();
  k2.kopf.klasse = 'ABC';
  buch.klassen.push(k2);
  const ka = neueKlassenarbeit(1);
  ka.datum = '2025-10-15';
  buch.klassen[0].klassenarbeiten = [ka];
  const ka2 = neueKlassenarbeit(1);
  k2.klassenarbeiten = [ka2];
  ka.teilnahme[buch.klassen[0].schueler[0].id] = { status: 'attest-offen', nachschreibtermin: '2025-11-05' };
  ka.teilnahme[buch.klassen[0].schueler[1].id] = { status: 'ohne-attest' };
  ka2.teilnahme[k2.schueler[2].id] = { status: 'attest-offen' };
  ka.teilnahme[buch.klassen[0].schueler[2].id] = { status: 'attest-offen' };
  ka.ergebnisse[buch.klassen[0].schueler[2].id] = { punkte: [5], attest: false, sonstiges: '' }; // hat nachgeschrieben (Punkte)
  const l = nachschreibListe(buch);
  assert.deepEqual(l.offen.map((x) => `${x.klasse.kopf.klasse}:${x.person.name}`), ['ABC:Probe', 'TEST-A:Muster']);
  assert.equal(l.offen[1].termin, '2025-11-05');
  assert.deepEqual(l.entscheidung.map((x) => x.person.name), ['Beispiel']);
});

test('Gemerkte Klassenzuordnung hat Vorrang vor gleichem Klassennamen', () => {
  const buch = neuesBuch(klasse());
  const zweite = neueKlasse({ klasse: 'TEST-A' }); // gleicher Anzeigename
  buch.klassen.push(zweite);
  const z = dateiB([zeileB({ name: 'Muster', vorname: 'Erika', id: 'E1001', klasse: 'TEST-A', von: '2025-10-14' })]);
  assert.equal(aufKlassenVerteilen(buch, z).proKlasse.has(buch.klassen[0].id), true, 'ohne gemerkte Zuordnung zählt der Klassenname (erste Klasse)');
  zweite.untis.klassenName = 'TEST-A';
  const v = aufKlassenVerteilen(buch, z);
  assert.equal(v.proKlasse.has(zweite.id), true, 'mit gemerkter Zuordnung geht es an die Klasse mit der Zuordnung');
  assert.equal(v.proKlasse.has(buch.klassen[0].id), false);
});

// Befund aus echten Untis-Dateien: Format A schreibt „Nachname Rufname“ (Rufname weicht vom vollständigen Vorname in B ab).
test('A+B gemeinsam: gleiche ID, abweichender Vorname in A – Zuordnung über B, A folgt über die ID', () => {
  const k = klasse();
  const a = dateiA([
    zeileA({ name: 'Muster Eri', id: 'E1001', datum: '2025-10-14', status: 'entsch.' }),
    zeileA({ name: 'Muster Eri', id: 'E1001', datum: '2025-10-20', status: 'entsch.' }),
  ]);
  const b = dateiB([B_ZEILEN[0]]);
  const plan = importPlanen(k, { a, b });
  assert.equal(plan.unzugeordnet.length, 0);
  const erika = person(k, 'Muster');
  const eintraege = plan.fehlzeiten.filter((f) => f.schuelerId === erika.id);
  assert.equal(eintraege.length, 3);
  const aAttest = eintraege.filter((f) => f.quelle === 'untis-a');
  assert.equal(aAttest.find((f) => f.datum === '2025-10-14').status, 'attest');
  assert.equal(aAttest.find((f) => f.datum === '2025-10-20').status, 'entschuldigt');
});

test('Nur A: Nachname mit Rufname wird über eindeutigen Nachnamen zugeordnet', () => {
  const k = klasse();
  const a = dateiA([zeileA({ name: 'Beispiel Maxi', id: 'E1002', datum: '2025-10-14', status: 'entsch.' })]);
  const plan = importPlanen(k, { a, b: [] });
  assert.equal(plan.unzugeordnet.length, 0);
  assert.equal(plan.fehlzeiten[0].schuelerId, person(k, 'Beispiel').id);
});

test('Nur A: „entschuldigt“ ohne Attest-Angabe wird nicht als „ohne Attest“ vorgeschlagen', () => {
  const k = klasse();
  const ka = neueKlassenarbeit(1);
  ka.datum = '2025-10-14';
  k.klassenarbeiten = [ka];
  const a = dateiA([zeileA({ name: 'Muster Erika', id: 'E1001', datum: '2025-10-14', status: 'entsch.' })]);
  importAnwenden(k, importPlanen(k, { a, b: [] }));
  const v = teilnahmeVorschlaege(k);
  assert.equal(v.length, 1);
  assert.equal(v[0].vorschlag, 'entschuldigung-offen');
});
