import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xlsxLaden, KOPF_A, KOPF_B, zeileA, zeileB, xlsBytes } from './hilfen-untis.js';
import { tabelleAusDatei } from '../js/tabelle-datei.js';
import { zeilenAusA, zeilenAusB, importPlanen, importAnwenden, anwesenheitPlan } from '../js/untis.js';
import { neueKlasse, neueId, neueReihe } from '../js/modell.js';
import { pruefungReihe, einstellungenAus, reihenErgebnis } from '../js/sport.js';
import { neuesBuch } from '../js/modell.js';

xlsxLaden();
const dateiB = (z) => zeilenAusB(tabelleAusDatei(xlsBytes(KOPF_B, z), 'AbsenceList_20251020_0930.xls'));
const dateiA = (z) => zeilenAusA(tabelleAusDatei(xlsBytes(KOPF_A, z), 'AbsencePerStudent_20251020_0930.xls'));

function sportKlasse() {
  const k = neueKlasse({ klasse: 'TEST-A', fachtyp: 'sport' });
  k.schueler = k.schueler.slice(0, 3);
  [['Muster', 'Erika'], ['Beispiel', 'Max'], ['Probe', 'Sam']].forEach(([n, v], i) => { k.schueler[i].name = n; k.schueler[i].vorname = v; });
  const r = neueReihe('Badminton');
  k.sport.reihen.push(r);
  const termin = (datum, extra = {}) => { const t = { id: neueId(), datum, uhrzeit: '', reihe: r.id, pruefungstag: false, vermerk: '', halbjahr: 1, ...extra }; k.sport.termine.push(t); return t; };
  return { k, r, termin };
}
const zeichen = (k, t, i) => k.sport.anwesenheit[t.id]?.[k.schueler[i].id]?.z;

test('Untis (Format B) schreibt A, E, U, | in die Anwesenheit der Termine im Zeitraum', () => {
  const { k, termin } = sportKlasse();
  const t1 = termin('2025-10-14'); const t2 = termin('2025-10-15'); const t3 = termin('2025-10-17');
  const b = dateiB([
    zeileB({ name: 'Muster', vorname: 'Erika', id: 'E1', von: '2025-10-14', bis: '2025-10-15', status: 'entschuldigt mit Attest' }),
    zeileB({ name: 'Beispiel', vorname: 'Max', id: 'E2', von: '2025-10-15', status: 'entschuldigt' }),
    zeileB({ name: 'Probe', vorname: 'Sam', id: 'E3', von: '2025-10-15', status: 'nicht entschuldigt' }),
    zeileB({ name: 'Probe', vorname: 'Sam', id: 'E3', von: '2025-10-17', status: 'offen' }),
  ]);
  const plan = importPlanen(k, { a: [], b });
  assert.equal(plan.anwesenheit.setzen.length, 5);
  assert.equal(zeichen(k, t1, 0), undefined, 'der Plan verändert nichts');
  importAnwenden(k, plan);
  assert.equal(zeichen(k, t1, 0), 'A');
  assert.equal(zeichen(k, t2, 0), 'A');
  assert.equal(zeichen(k, t2, 1), 'E');
  assert.equal(zeichen(k, t2, 2), 'U');
  assert.equal(zeichen(k, t3, 2), '|');
  assert.equal(zeichen(k, t3, 0), undefined);
  assert.equal(k.sport.anwesenheit[t2.id][k.schueler[0].id].quelle, 'untis');
});

test('Nie ein von Hand gesetztes Zeichen überschreiben; Abweichung wird gemeldet', () => {
  const { k, termin } = sportKlasse();
  const t = termin('2025-10-15');
  k.sport.anwesenheit[t.id] = { [k.schueler[1].id]: { z: '.', quelle: 'hand' }, [k.schueler[2].id]: { z: 'U', quelle: 'hand' } };
  const b = dateiB([
    zeileB({ name: 'Beispiel', vorname: 'Max', id: 'E2', von: '2025-10-15', status: 'entschuldigt' }),
    zeileB({ name: 'Probe', vorname: 'Sam', id: 'E3', von: '2025-10-15', status: 'nicht entschuldigt' }),
  ]);
  const plan = importPlanen(k, { a: [], b });
  assert.equal(plan.anwesenheit.setzen.length, 0);
  assert.deepEqual(plan.anwesenheit.abweichungen.map((x) => [x.hand, x.untis]), [['.', 'E']], 'gleiches Zeichen ist keine Abweichung');
  importAnwenden(k, plan);
  assert.equal(zeichen(k, t, 1), '.');
  assert.equal(zeichen(k, t, 2), 'U');
});

test('Frühere Untis-Zeichen werden bei erneutem Import aktualisiert (offen → mit Attest), Doppelimport ändert nichts', () => {
  const { k, termin } = sportKlasse();
  const t = termin('2025-10-15');
  const roh = (status) => dateiB([zeileB({ name: 'Muster', vorname: 'Erika', id: 'E1', von: '2025-10-15', status })]);
  importAnwenden(k, importPlanen(k, { a: [], b: roh('offen') }));
  assert.equal(zeichen(k, t, 0), '|');
  const gleich = importPlanen(k, { a: [], b: roh('offen') });
  assert.equal(gleich.anwesenheit.setzen.length, 0);
  const neu = importPlanen(k, { a: [], b: roh('entschuldigt mit Attest') });
  assert.deepEqual(neu.anwesenheit.setzen.map((x) => [x.vorher, x.z]), [['|', 'A']]);
  importAnwenden(k, neu);
  assert.equal(zeichen(k, t, 0), 'A');
});

test('Mit Uhrzeit des Termins zählt auch die Zeit; ohne Uhrzeit genügt das Datum', () => {
  const { k, termin } = sportKlasse();
  const frueh = termin('2025-10-15', { uhrzeit: '08:00' });
  const spaet = termin('2025-10-15', { uhrzeit: '13:00' });
  const ohne = termin('2025-10-15');
  const b = dateiB([zeileB({ name: 'Muster', vorname: 'Erika', id: 'E1', von: '2025-10-15', zeitVon: '07:30', zeitBis: '12:00', status: 'entschuldigt' })]);
  importAnwenden(k, importPlanen(k, { a: [], b }));
  assert.equal(zeichen(k, frueh, 0), 'E');
  assert.equal(zeichen(k, spaet, 0), undefined);
  assert.equal(zeichen(k, ohne, 0), 'E');
});

test('Format A (je Fehlstunde): „nicht entsch.“ → U; mit Attest aus B → A; „zählt nicht“ wird ignoriert', () => {
  const { k, termin } = sportKlasse();
  const t1 = termin('2025-10-15'); const t2 = termin('2025-10-16'); const t3 = termin('2025-10-17');
  const a = dateiA([
    zeileA({ name: 'Muster Erika', id: 'E1', datum: '2025-10-15', stunde: 1, status: 'nicht entsch.' }),
    zeileA({ name: 'Muster Erika', id: 'E1', datum: '2025-10-16', stunde: 1, status: 'entsch.' }),
    zeileA({ name: 'Beispiel Max', id: 'E2', datum: '2025-10-17', stunde: 1, status: 'nicht entsch.', zaehlt: 'false' }),
  ]);
  const b = dateiB([zeileB({ name: 'Muster', vorname: 'Erika', id: 'E1', von: '2025-10-16', status: 'entschuldigt mit Attest' })]);
  importAnwenden(k, importPlanen(k, { a, b }));
  assert.equal(zeichen(k, t1, 0), 'U');
  assert.equal(zeichen(k, t2, 0), 'A');
  assert.equal(zeichen(k, t3, 1), undefined);
});

test('Mehrere Einträge am selben Tag: der entlastendste gewinnt', () => {
  const { k, termin } = sportKlasse();
  const t = termin('2025-10-15');
  const a = dateiA([
    zeileA({ name: 'Muster Erika', id: 'E1', datum: '2025-10-15', stunde: 1, status: 'nicht entsch.' }),
    zeileA({ name: 'Muster Erika', id: 'E1', datum: '2025-10-15', stunde: 2, status: 'entsch.' }),
  ]);
  importAnwenden(k, importPlanen(k, { a, b: [] }));
  assert.equal(zeichen(k, t, 0), 'E');
});

test('Lernfeld-Klassen bekommen keinen Anwesenheits-Plan', () => {
  const k = neueKlasse({ klasse: 'LF' });
  k.schueler[0].name = 'Muster'; k.schueler[0].vorname = 'Erika';
  const plan = importPlanen(k, { a: [], b: dateiB([zeileB({ name: 'Muster', vorname: 'Erika', id: 'E1', klasse: 'LF', von: '2025-10-15', status: 'offen' })]) });
  assert.equal(plan.anwesenheit, null);
});

test('Ende zu Ende: Untis-U am Prüfungstag → Prüfungsnote 6; mit Attest → Nachprüfung offen', () => {
  const { k, r, termin } = sportKlasse();
  r.teile = [{ id: 't1', name: 'Teil', versuche: 5, hoechst: null, gewicht: 1, zone: '', merkmale: ['', '', ''], stufen: null }];
  const t = termin('2025-10-15', { pruefungstag: true });
  const b = dateiB([
    zeileB({ name: 'Muster', vorname: 'Erika', id: 'E1', von: '2025-10-15', status: 'entschuldigt mit Attest' }),
    zeileB({ name: 'Beispiel', vorname: 'Max', id: 'E2', von: '2025-10-15', status: 'nicht entschuldigt' }),
  ]);
  importAnwenden(k, importPlanen(k, { a: [], b }));
  const ein = einstellungenAus(neuesBuch(k));
  assert.equal(pruefungReihe(k, r, k.schueler[0].id, ein).status, 'nachpruefung-offen');
  assert.equal(pruefungReihe(k, r, k.schueler[1].id, ein).status, 'auto6');
  assert.equal(pruefungReihe(k, r, k.schueler[2].id, ein).status, 'offen', 'anwesend/nicht erfasst und kein Wert');
  assert.equal(reihenErgebnis(k, r, k.schueler[1].id, ein).pruefung.note, 6);
});
