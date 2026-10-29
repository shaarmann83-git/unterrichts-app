import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xlsxLaden, KOPF_A, KOPF_B, zeileA, zeileB, xlsBytes } from './hilfen-untis.js';
import { dateiTyp, neueDateien, abgleichPlanen, abgleichAnwenden, speicherOrdner } from '../js/untis-eingang.js';
import { neueKlasse, neuesBuch } from '../js/modell.js';
import { teilnahmeVorschlaege } from '../js/nachschreiben.js';
import { neueKlassenarbeit } from '../js/modell.js';

xlsxLaden();

function buch() {
  const a = neueKlasse({ klasse: 'TEST-A' });
  a.schueler = a.schueler.slice(0, 3);
  [['Muster', 'Erika'], ['Beispiel', 'Max'], ['Probe', 'Sam']].forEach(([n, v], i) => { a.schueler[i].name = n; a.schueler[i].vorname = v; });
  const b = neueKlasse({ klasse: 'TEST-B' });
  b.schueler = b.schueler.slice(0, 2);
  [['Zweit', 'Zora'], ['Dritt', 'Dirk']].forEach(([n, v], i) => { b.schueler[i].name = n; b.schueler[i].vorname = v; });
  return neuesBuch(a), { ...neuesBuch(a), klassen: [a, b] };
}

const B1 = (status = 'offen') => xlsBytes(KOPF_B, [
  zeileB({ name: 'Muster', vorname: 'Erika', id: 'E1', klasse: 'TEST-A', von: '2025-10-14', bis: '2025-10-15', status }),
  zeileB({ name: 'Zweit', vorname: 'Zora', id: 'E2', klasse: 'TEST-B', von: '2025-10-15', status: 'entschuldigt' }),
  zeileB({ name: 'Fremd', vorname: 'Fred', id: 'E3', klasse: 'UNBEKANNT-X', von: '2025-10-15', status: 'entschuldigt' }),
]);
const A1 = () => xlsBytes(KOPF_A, [zeileA({ name: 'Muster Erika', id: 'E1', klasse: 'TEST-A', datum: '2025-10-14', stunde: 1 })]);

test('Dateityp am Namen', () => {
  assert.equal(dateiTyp('AbsenceList_20251020_0930.xls'), 'B');
  assert.equal(dateiTyp('absenceperstudent_20251020_0930.XLSX'), 'A');
  assert.equal(dateiTyp('Notizen.xls'), null);
});

test('Neue Datei erkennen, andere Dateien ignorieren', async () => {
  const b = buch();
  const o = speicherOrdner([
    { name: 'AbsenceList_20251020_0930.xls', bytes: B1(), geaendert: 1 },
    { name: 'Einkaufsliste.xls', bytes: B1(), geaendert: 5 },
  ]);
  const r = await neueDateien(o, b);
  assert.deepEqual(r.neu.map((d) => d.name), ['AbsenceList_20251020_0930.xls']);
  assert.deepEqual(r.bekannt, []);
});

test('Von mehreren neuen Dateien zählt nur die neueste (Zeitstempel im Namen, sonst Änderungsdatum)', async () => {
  const b = buch();
  const o = speicherOrdner([
    { name: 'AbsenceList_20251019_0800.xls', bytes: B1('offen'), geaendert: 3 },
    { name: 'AbsenceList_20251020_0930.xls', bytes: B1('entschuldigt mit Attest'), geaendert: 2 },
    { name: 'AbsenceList_20251018_1200.xls', bytes: B1('nicht entschuldigt'), geaendert: 1 },
  ]);
  const r = await neueDateien(o, b);
  assert.equal(r.neu.length, 1);
  assert.equal(r.neu[0].name, 'AbsenceList_20251020_0930.xls');
  assert.deepEqual(r.aeltere.sort(), ['AbsenceList_20251018_1200.xls', 'AbsenceList_20251019_0800.xls']);
  const o2 = speicherOrdner([
    { name: 'AbsenceList.xls', bytes: B1('offen'), geaendert: 100 },
    { name: 'AbsenceList (1).xls', bytes: B1('entschuldigt mit Attest'), geaendert: 200 },
  ]);
  assert.equal((await neueDateien(o2, b)).neu[0].name, 'AbsenceList (1).xls');
});

test('Eine Datei mit mehreren Klassen wird verteilt, unbekannte Klassen werden gemeldet', async () => {
  const b = buch();
  const r = await neueDateien(speicherOrdner([{ name: 'AbsenceList_20251020_0930.xls', bytes: B1(), geaendert: 1 }]), b);
  const plan = abgleichPlanen(b, r.neu);
  assert.equal(plan.klassen.length, 2);
  assert.deepEqual(plan.unbekannteKlassen, ['UNBEKANNT-X']);
  assert.deepEqual(plan.klassen.map((k) => k.plan.neu.length), [1, 1]);
  const zahlen = abgleichAnwenden(b, plan);
  assert.deepEqual(zahlen, [{ klasse: 'TEST-A', neu: 1, geaendert: 0, weggefallen: 0 }, { klasse: 'TEST-B', neu: 1, geaendert: 0, weggefallen: 0 }]);
  assert.equal(b.klassen[0].fehlzeiten.length, 1);
  assert.equal(b.klassen[1].fehlzeiten.length, 1);
});

test('Bereits importierte Datei wird nicht erneut verarbeitet', async () => {
  const b = buch();
  const o = speicherOrdner([{ name: 'AbsenceList_20251020_0930.xls', bytes: B1(), geaendert: 1 }]);
  const r1 = await neueDateien(o, b);
  abgleichAnwenden(b, abgleichPlanen(b, r1.neu));
  const r2 = await neueDateien(o, b);
  assert.equal(r2.neu.length, 0);
  assert.deepEqual(r2.bekannt, ['AbsenceList_20251020_0930.xls']);
  // gleiche Datei unter neuem Namen: dieselbe Prüfsumme, ebenfalls erkannt
  const o2 = speicherOrdner([{ name: 'AbsenceList_20251021_0800.xls', bytes: B1(), geaendert: 9 }]);
  assert.equal((await neueDateien(o2, b)).neu.length, 0);
});

test('Nur Änderungen zeigen: neuer Stand der Datei gegenüber dem letzten Import', async () => {
  const b = buch();
  abgleichAnwenden(b, abgleichPlanen(b, (await neueDateien(speicherOrdner([{ name: 'AbsenceList_20251020_0930.xls', bytes: B1('offen'), geaendert: 1 }]), b)).neu));
  const r = await neueDateien(speicherOrdner([{ name: 'AbsenceList_20251021_0930.xls', bytes: B1('entschuldigt mit Attest'), geaendert: 2 }]), b);
  const plan = abgleichPlanen(b, r.neu);
  const a = plan.klassen.find((k) => k.klasse.kopf.klasse === 'TEST-A').plan;
  const z = plan.klassen.find((k) => k.klasse.kopf.klasse === 'TEST-B').plan;
  assert.deepEqual([a.neu.length, a.geaendert.length, a.weggefallen.length], [0, 1, 0]);
  assert.deepEqual([z.neu.length, z.geaendert.length, z.weggefallen.length], [0, 0, 0]);
  assert.deepEqual([a.geaendert[0].vorher.status, a.geaendert[0].nachher.status], ['offen', 'attest']);
});

test('A und B gemeinsam: Attest wird zugeordnet, Vorschläge für Klassenarbeit entstehen', async () => {
  const b = buch();
  const o = speicherOrdner([
    { name: 'AbsenceList_20251020_0930.xls', bytes: B1('entschuldigt mit Attest'), geaendert: 1 },
    { name: 'AbsencePerStudent_20251020_0930.xls', bytes: A1(), geaendert: 1 },
  ]);
  const r = await neueDateien(o, b);
  assert.deepEqual(r.neu.map((d) => d.typ).sort(), ['A', 'B']);
  abgleichAnwenden(b, abgleichPlanen(b, r.neu));
  const k = b.klassen[0];
  assert.deepEqual(k.fehlzeiten.map((f) => `${f.quelle}:${f.status}`).sort(), ['untis-a:attest', 'untis-b:attest']);
  const ka = neueKlassenarbeit(1);
  ka.datum = '2025-10-15';
  k.klassenarbeiten = [ka];
  assert.equal(teilnahmeVorschlaege(k)[0].vorschlag, 'attest-offen');
});

test('Nicht erkannte Datei wird gemeldet statt still ignoriert', async () => {
  const b = buch();
  const bytes = xlsBytes(['Foo', 'Bar'], [[1, 2]]);
  const plan = abgleichPlanen(b, [{ name: 'AbsenceList_20251020_0930.xls', bytes, pruefsumme: 'x' }]);
  assert.deepEqual(plan.nichtErkannt, ['AbsenceList_20251020_0930.xls']);
  assert.equal(plan.klassen.length, 0);
});

test('Nach dem Import verarbeitet/löschen über die Ordner-Schnittstelle', async () => {
  const o = speicherOrdner([{ name: 'AbsenceList_20251020_0930.xls', bytes: B1(), geaendert: 1 }]);
  await o.verarbeitet('AbsenceList_20251020_0930.xls');
  assert.equal((await o.liste()).length, 0);
});
