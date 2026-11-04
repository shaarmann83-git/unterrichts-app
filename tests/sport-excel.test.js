import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xlsxLaden } from './hilfen-untis.js';
import { sportBlaetter, sportXlsx } from '../js/sport-excel.js';
import { alleAlsExcel } from '../js/excel.js';
import { neueKlasse, neuesBuch, neueId } from '../js/modell.js';
import { reiheAusVorlage, EINGEBAUTE_VORLAGEN } from '../js/sport-vorlagen.js';
import { einstellungenAus } from '../js/sport.js';

xlsxLaden();

function buch() {
  const k = neueKlasse({ klasse: 'SPORT-A', fachtyp: 'sport' });
  k.schueler = k.schueler.slice(0, 2);
  k.schueler.forEach((s, i) => { s.name = `Muster${i + 1}`; s.vorname = `Person${i + 1}`; });
  const r = reiheAusVorlage(EINGEBAUTE_VORLAGEN.find((v) => v.id === 'volleyball'));
  k.sport.reihen.push(r);
  const t = { id: neueId(), datum: '2026-03-02', uhrzeit: '', reihe: r.id, pruefungstag: false, vermerk: '', halbjahr: 1 };
  k.sport.termine.push(t);
  k.sport.anwesenheit[t.id] = { [k.schueler[0].id]: { z: '.' }, [k.schueler[1].id]: { z: 'sps' } };
  r.werte[k.schueler[0].id] = { versuche: { [r.teile[0].id]: [3, 3, 2, 2, 2] }, summen: { [r.teile[1].id]: 10 } };
  k.schueler[0].foto = { daten: 'data:image/jpeg;base64,AAAA' };
  return neuesBuch(k);
}

test('Sport-Blätter: je Reihe ein Blatt plus Gesamtnote; Rohwerte, Zeichen, keine Prozentwerte, keine Fotos', () => {
  const b = buch();
  const blaetter = sportBlaetter(b.klassen[0], einstellungenAus(b));
  assert.deepEqual(blaetter.map((x) => x.titel), ['Volleyball', 'Gesamtnote']);
  const text = JSON.stringify(blaetter);
  assert.ok(text.includes('Pritschen V1') && text.includes('Anwesenheit (Zeichen)') && text.includes('Merkmale') && text.includes('sps'));
  assert.ok(!text.includes('%') && !text.includes('data:image'));
  const roh = blaetter[0].zeilen.find((z) => z[1] === 'Muster1');
  assert.deepEqual(roh.slice(3, 9), [3, 3, 2, 2, 2, 12], 'Einzelversuche und Summe');
});

test('Sport-XLSX und „Alles als Excel“ enthalten die Sport-Blätter', () => {
  const b = buch();
  const X = globalThis.XLSX;
  const wb = X.read(sportXlsx(b.klassen[0], einstellungenAus(b)), { type: 'array' });
  assert.deepEqual(wb.SheetNames, ['Volleyball', 'Gesamtnote']);
  const alles = X.read(alleAlsExcel(b), { type: 'array' });
  assert.ok(alles.SheetNames.some((n) => n.endsWith('Volleyball')) && alles.SheetNames.some((n) => n.endsWith('Gesamtnote')) && alles.SheetNames.some((n) => n.endsWith('Fehlzeiten')));
  assert.ok(!JSON.stringify(alles.SheetNames.map((n) => X.utils.sheet_to_json(alles.Sheets[n], { header: 1 }))).includes('data:image'));
});
