// Excel-Export Sport (SPEC 9.6): je Reihe ein Blatt (Rohwerte, Termine, Zeichen, Mitarbeit, Merkmale) und ein Blatt Gesamtnote.
// Fotos und Prozentwerte stehen nicht drin.
import { datumDeutsch, aktiveSchueler } from './modell.js';
import {
  termineGeordnet, anwesenheitZeichen, mitarbeitZelle, spsNummern, reihenErgebnis, endnotenKlasse, einstellungenAus, teilRohwert,
  teilHoechstwert, punkte, istPruefungstag,
} from './sport.js';
import { fehlzeitenSummen } from './fehlzeiten.js';

const rund = (x) => (x === null || x === undefined ? null : Math.round(x * 100) / 100);

/** Blätter als {name, zeilen}. */
export function sportBlaetter(d, ein = einstellungenAus(null)) {
  const personen = aktiveSchueler(d);
  const kopfInfo = [['Klasse', d.kopf.klasse, 'Schuljahr', d.kopf.schuljahr, 'Notensystem', d.sport.notensystem === 'punkte' ? 'Punkte 0–15' : 'Noten 1,0–6,0'], []];
  const blaetter = [];
  for (const r of d.sport.reihen) {
    const zeilen = [...kopfInfo, ['Reihe', r.name, 'Halbjahr', r.halbjahr, 'Gewichte Prüfung/Mitarbeit/Verhalten', `${r.gewichte.pruefung}/${r.gewichte.mitarbeit}/${r.gewichte.verhalten}`], []];
    // 1. Rohwerte der Prüfung
    zeilen.push(['Prüfung: Rohwerte']);
    zeilen.push(['Nr.', 'Name', 'Vorname', ...r.teile.flatMap((t) => [...Array.from({ length: t.versuche || 0 }, (_, i) => `${t.name} V${i + 1}`), `${t.name} Summe (max. ${teilHoechstwert(t)})`]), 'Prüfungsnote']);
    personen.forEach((p, i) => {
      const w = r.werte[p.id] || {};
      const e = reihenErgebnis(d, r, p.id, ein);
      zeilen.push([i + 1, p.name, p.vorname, ...r.teile.flatMap((t) => {
        const v = w.versuche?.[t.id] || [];
        return [...Array.from({ length: t.versuche || 0 }, (_, k) => v[k] ?? null), teilRohwert(w, t)];
      }), e.pruefung.note]);
    });
    zeilen.push([]);
    // 2. Termine, Zeichen, Mitarbeit, Merkmale
    const termine = termineGeordnet(d).filter((t) => t.reihe === r.id);
    zeilen.push(['Termine']);
    zeilen.push(['', 'Datum', ...termine.map((t) => datumDeutsch(t.datum))]);
    zeilen.push(['', 'Prüfungstag', ...termine.map((t) => (istPruefungstag(t, ein) ? 'ja' : ''))]);
    zeilen.push(['', 'Vermerk', ...termine.map((t) => t.vermerk || '')]);
    zeilen.push([]);
    zeilen.push(['Anwesenheit (Zeichen)']);
    zeilen.push(['Nr.', 'Name', ...termine.map((t) => datumDeutsch(t.datum))]);
    personen.forEach((p, i) => zeilen.push([i + 1, `${p.name}, ${p.vorname}`, ...termine.map((t) => { const e = d.sport.anwesenheit[t.id]?.[p.id]; return e?.z ? `${e.z}${e.z === 'V' && e.min ? e.min : ''}${e.stern ? '*' : ''}` : ''; })]));
    zeilen.push([]);
    zeilen.push(['Mitarbeit (0–3, leer = zählt nicht)']);
    zeilen.push(['Nr.', 'Name', ...termine.map((t) => datumDeutsch(t.datum))]);
    personen.forEach((p, i) => {
      const sps = spsNummern(d, p.id);
      zeilen.push([i + 1, `${p.name}, ${p.vorname}`, ...termine.map((t) => { const c = mitarbeitZelle(d, t, p.id, ein, sps); return c.zaehlt ? c.wert : null; })]);
    });
    zeilen.push([]);
    zeilen.push(['Merkmale (angehakt)']);
    for (let m = 0; m < 3; m++) {
      zeilen.push([`M${m + 1}`, r.merkmaleTexte[m] || '', ...termine.map((t) => datumDeutsch(t.datum))]);
      personen.forEach((p, i) => zeilen.push([i + 1, `${p.name}, ${p.vorname}`, ...termine.map((t) => (d.sport.merkmale[t.id]?.[p.id]?.[m] ? 'x' : ''))]));
    }
    zeilen.push([]);
    // 3. Ergebnis
    zeilen.push(['Ergebnis der Reihe']);
    zeilen.push(['Nr.', 'Name', 'Prüfungsnote', 'Grundnote', 'M1', 'M2', 'M3', 'Mitarbeit', 'Verhalten', ...r.direkte.map((x) => x.name), 'Reihenwert', 'Reihennote', 'Bemerkung']);
    personen.forEach((p, i) => {
      const e = reihenErgebnis(d, r, p.id, ein);
      zeilen.push([i + 1, `${p.name}, ${p.vorname}`, e.pruefung.note, e.mitarbeit.grundnote, ...[0, 1, 2].map((m) => (e.mitarbeit.gezeigt[m] ? 'ja' : '')), rund(e.mitarbeit.note), e.verhalten, ...e.direkte.map((x) => x.note), rund(e.wert), e.note, e.bemerkung]);
    });
    blaetter.push({ titel: r.name || 'Reihe', zeilen });
  }
  // Gesamtnote
  const { ergebnis } = endnotenKlasse(d, personen, ein);
  const punkteAn = d.sport.notensystem === 'punkte';
  const gz = [...kopfInfo, ['Gesamtnote Sport'], ['Nr.', 'Name', 'Vorname', ...d.sport.reihen.flatMap((r) => [`${r.name} Wert`, `${r.name} Note`]), 'Ø Wert', 'Ø Note', 'Endnote', 'festgesetzt', ...(punkteAn ? ['Vorschlag (Punkte)'] : []), 'sps', 'offen', 'Fehlstd.']];
  personen.forEach((p, i) => {
    const e = ergebnis.get(p.id);
    const g = e.gesamt;
    gz.push([i + 1, p.name, p.vorname, ...d.sport.reihen.flatMap((r) => { const x = g.reihen.find((y) => y.reihe.id === r.id)?.erg; return [rund(x?.wert), x?.note ?? null]; }), rund(g.oWert), rund(g.oNote), e.endnote, e.festgesetzt ? `ja: ${e.festgesetzt.begruendung}` : '', ...(punkteAn ? [g.oWert === null ? null : punkte(g.oWert, ein)] : []), g.sps, g.offen, fehlzeitenSummen(d, p.id).gesamt]);
  });
  blaetter.push({ titel: 'Gesamtnote', zeilen: gz });
  return blaetter;
}

export function sportXlsx(d, ein) {
  const X = globalThis.XLSX;
  if (!X) throw new Error('Die Excel-Bibliothek ist nicht geladen.');
  const mappe = X.utils.book_new();
  const benutzt = new Set();
  for (const b of sportBlaetter(d, ein)) {
    let name = String(b.titel).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Blatt';
    for (let i = 2; benutzt.has(name.toLowerCase()); i++) name = `${name.slice(0, 28)} ${i}`;
    benutzt.add(name.toLowerCase());
    X.utils.book_append_sheet(mappe, X.utils.aoa_to_sheet(b.zeilen), name);
  }
  return X.write(mappe, { type: 'array', bookType: 'xlsx' });
}
