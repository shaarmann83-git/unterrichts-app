// Testhilfen: erzeugt Untis-Beispieldateien (.xls) mit erfundenen Namen und IDs, genau mit den Kopfzeilen aus SPEC 8.6.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let geladen = false;
export function xlsxLaden() {
  if (!geladen) {
    vm.runInThisContext(readFileSync(new URL('../lib/xlsx.full.min.js', import.meta.url), 'utf8'));
    geladen = true;
  }
  return globalThis.XLSX;
}

export const KOPF_A = ['Schüler*innen', 'Externe Id', 'Text', 'Klasse', 'Datum', 'Wochentag', 'Fehlstd.', 'Fehlmin.', 'Lehrkraft', 'Fach', 'Abwesenheitsgrund', 'Text', 'ENr', 'Erledigt', 'Abwesenheit zählt', 'Entschuldigungstext', 'Stundennr.', 'Status', 'Fehltage'];
export const KOPF_B = ['Langname', 'Vorname', 'ID', 'Klasse', 'Beginndatum', 'Enddatum', 'Beginnzeit', 'Endzeit', 'Unterbrechungen', 'Abwesenheitsgrund', 'Text/Grund', 'Entschuldigungsnummer', 'Status', 'Entschuldigungstext', 'gemeldet von Schüler*in'];

/** Zeile für Format A. */
export function zeileA({ name, id, klasse = 'TEST-A', datum, std = 1, min = 0, fach = 'AK3-LF10', grund = 'krank', zaehlt = 'true', stunde = 1, status = 'entsch.', text = '', tage = 0.2 }) {
  const [j, m, t] = datum.split('-').map(Number);
  const d = new Date(j, m - 1, t); // lokale Mitternacht, wie ein echtes Datum in der Untis-Tabelle
  return [name, id, 'Text1', klasse, d, 'Di', std, min, 'XY', fach, grund, text, 1, '', zaehlt, '', stunde, status, tage];
}

/** Zeile für Format B (Datum als Text TT.MM.JJJJ, Uhrzeit als Text). */
export function zeileB({ name, vorname, id, klasse = 'TEST-A', von, bis, zeitVon = '07:30', zeitBis = '15:00', grund = 'krank', text = '', nr = 1, status = 'entschuldigt' }) {
  const tt = (iso) => iso.split('-').reverse().join('.');
  return [name, vorname, id, klasse, tt(von), tt(bis || von), zeitVon, zeitBis, '', grund, text, nr, status, '', 'false'];
}

/** Schreibt eine Mappe mit Blatt Sheet0 als .xls (BIFF8) und gibt die Bytes zurück. Hinter den Daten viele Leerzeilen wie in echten Berichten. */
export function xlsBytes(kopf, zeilen, leerzeilen = 30, typ = 'biff8') {
  const X = xlsxLaden();
  const daten = [kopf, ...zeilen, ...Array.from({ length: leerzeilen }, () => [])];
  const ws = X.utils.aoa_to_sheet(daten, { cellDates: true });
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Sheet0');
  return X.write(wb, { type: 'array', bookType: typ, cellDates: true });
}
