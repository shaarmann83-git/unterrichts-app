// Liest eine Tabellendatei (xlsx, xls, csv) in Zeilen aus Zellwerten. Nutzt SheetJS (lib/xlsx.full.min.js).
import { csvLesen, ohneLeerzeilen } from './tabelle.js';

/** `inhalt`: ArrayBuffer (xlsx/xls) oder Text (csv); gibt Zeilen ohne Leerzeilen zurück. */
export function tabelleAusDatei(inhalt, dateiname, blatt = null) {
  const name = String(dateiname || '').toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = typeof inhalt === 'string' ? inhalt : new TextDecoder().decode(inhalt);
    return ohneLeerzeilen(csvLesen(text));
  }
  const X = globalThis.XLSX;
  if (!X) throw new Error('Die Excel-Bibliothek ist nicht geladen.');
  let mappe;
  try {
    mappe = X.read(inhalt, { type: 'array', cellDates: true });
  } catch {
    throw new Error('Die Datei konnte nicht gelesen werden. Ist es eine Excel- oder CSV-Datei?');
  }
  const ws = mappe.Sheets[blatt || mappe.SheetNames[0]];
  if (!ws) throw new Error('Das Tabellenblatt wurde nicht gefunden.');
  return ohneLeerzeilen(X.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false }));
}
