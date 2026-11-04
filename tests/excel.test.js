import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

before(() => {
  const code = readFileSync(new URL('../lib/xlsx.full.min.js', import.meta.url), 'utf8');
  vm.runInThisContext(code);
});

const nah = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/** Baut eine Mini-Vorlage mit der Zellstruktur aus SPEC Abschnitt 6 (erfundene Namen). */
function vorlage() {
  const X = globalThis.XLSX;
  const wb = X.utils.book_new();
  const blatt = (zellen) => {
    const ws = {};
    let maxR = 0;
    let maxC = 0;
    for (const [adr, v] of Object.entries(zellen)) {
      ws[adr] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v: String(v) };
      const c = X.utils.decode_cell(adr);
      maxR = Math.max(maxR, c.r);
      maxC = Math.max(maxC, c.c);
    }
    ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
    return ws;
  };
  X.utils.book_append_sheet(
    wb,
    blatt({
      D5: 'TEST-A', G5: 1, G6: 'Geschäftsprozesse', M5: '2025/26', L12: 0.5,
      C12: 'Muster', D12: 'Erika', E12: 'w', F12: 38000,
      C13: 'Beispiel', D13: 'Max', E13: 'm',
      C14: 'Probe', D14: 'Sam', E14: 'd',
    }),
    'Grunddaten',
  );
  X.utils.book_append_sheet(
    wb,
    blatt({ D4: 15, E4: 15, F4: 15, D5: 11, E5: 11, F5: 11, D6: 11, E6: 11, F6: 11, AA1: '05.11.2025', AB7: 'x' }),
    'KA 1',
  );
  X.utils.book_append_sheet(wb, blatt({ D4: 25, E4: 25, D5: 23, E5: 23 }), 'KA 2');
  X.utils.book_append_sheet(wb, blatt({}), 'KA 3');
  X.utils.book_append_sheet(wb, blatt({ D4: 10 }), 'KA 4');
  X.utils.book_append_sheet(
    wb,
    blatt({ D3: '01.10.2025', D5: 2, F3: '08.10.2025', F5: 3.3, H3: '15.10.2025' }),
    'sonst. Leistung',
  );
  X.utils.book_append_sheet(
    wb,
    blatt({ G6: 1, H6: 2, I6: 1, J6: 1, M6: 1, N6: 0.5 }),
    'Notenliste gesamt',
  );
  return X.write(wb, { type: 'array', bookType: 'xlsx' });
}

test('Import der Vorlage: Kopf, Schüler, KA, Termine, Gewichte', async () => {
  const { importiereVorlage } = await import('../js/excel.js');
  const { daten, vorschau } = importiereVorlage(vorlage());
  assert.equal(daten.kopf.klasse, 'TEST-A');
  assert.equal(daten.kopf.lernfeldNr, '1');
  assert.equal(daten.kopf.lernfeldBez, 'Geschäftsprozesse');
  assert.equal(daten.kopf.schuljahr, '2025/26');
  assert.equal(daten.gewichtSchriftlich, 50);
  assert.equal(daten.schueler.length, 3);
  assert.equal(daten.schueler[0].geburtstag, '2004-01-14'); // Seriennummer 38000
  assert.equal(daten.schueler[2].geschlecht, 'd');
  // KA 3 (leer) wird übersprungen, KA 1, 2 und 4 (nur Höchstpunkte) bleiben
  assert.deepEqual(vorschau.klassenarbeiten.map((k) => k.nr), [1, 2, 4]);
  const ka1 = daten.klassenarbeiten[0];
  assert.deepEqual(ka1.aufgaben, [15, 15, 15]);
  assert.equal(ka1.datum, '2025-11-05');
  assert.equal(ka1.gewicht, 1);
  assert.equal(daten.klassenarbeiten[1].gewicht, 2);
  assert.equal(ka1.ergebnisse[daten.schueler[2].id].attest, true);
  // sL: Termin 3 hat keine Noten und wird übersprungen
  assert.equal(daten.sonstige.length, 2);
  assert.equal(vorschau.termineUebersprungen, 10);
  assert.equal(daten.sonstige[0].datum, '2025-10-01');
  assert.equal(daten.sonstige[1].gewicht, 0.5);
  assert.equal(daten.sonstige[1].eintraege[daten.schueler[0].id].note, 3.3);
});

test('Importierte Daten ergeben den Prüffall mit Einzelgewichten', async () => {
  const { importiereVorlage } = await import('../js/excel.js');
  const { gesamtPerson } = await import('../js/rechnen.js');
  const { daten } = importiereVorlage(vorlage());
  const g = gesamtPerson(daten, daten.schueler[0].id);
  nah(g.oKA, 85.7666666667, 1e-6);
  nah(g.oSL, 79.8333333333, 1e-6);
  nah(g.gesamtProzent, 82.8, 1e-9);
  assert.equal(g.gesamtNote, 2);
});

test('Falsche Datei wird verständlich abgelehnt', async () => {
  const { importiereVorlage } = await import('../js/excel.js');
  const X = globalThis.XLSX;
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([[1]]), 'Blatt1');
  assert.throws(() => importiereVorlage(X.write(wb, { type: 'array', bookType: 'xlsx' })), /Grunddaten/);
});

test('CSV: Semikolon, Dezimalkomma, Anführungszeichen', async () => {
  const { csvText } = await import('../js/excel.js');
  const t = csvText(['A', 'B'], [['x;y', 79.825], ['"q"', null]]);
  assert.equal(t, 'A;B\r\n"x;y";79,825\r\n"""q""";\r\n');
});

test('Export: Gesamtübersicht und sL-Blatt enthalten die Werte', async () => {
  const { importiereVorlage, gesamtXlsx, gesamtCsv, slTabelle } = await import('../js/excel.js');
  const { daten } = importiereVorlage(vorlage());
  daten.sonstige[0].eintraege[daten.schueler[1].id] = { note: null, notiz: 'Aufgabe vergessen' };
  const sl = slTabelle(daten);
  assert.equal(sl.zeilen.length, 3);
  assert.deepEqual(sl.zeilen[0].slice(0, 2), ['01.10.2025', '']);
  assert.equal(sl.zeilen[0][5], 85.5);
  const csv = gesamtCsv(daten);
  assert.match(csv, /^Nr\.;Name;Vorname;Gesamt %;Gesamtnote;KA 1 %;KA 2 %;KA 3 %;Ø KA;Anzahl sL-Noten;Ø sL/);
  assert.match(csv, /1;Muster;Erika;82,8;2;73,3;92;;85,766667;2;79,833333/);
  const X = globalThis.XLSX;
  const wb = X.read(gesamtXlsx(daten), { type: 'array' });
  assert.deepEqual(wb.SheetNames, ['Gesamtübersicht', 'Sonstige Leistung']);
  const zeilen = X.utils.sheet_to_json(wb.Sheets['Sonstige Leistung'], { header: 1 });
  assert.equal(zeilen.length, 4);
});
