// Tabellen lesen (CSV, xlsx, xls) und Spalten zuordnen. Reine Logik ohne Oberfläche (SPEC 8.6, 8.12).

/** Trennzeichen aus der ersten Zeile erraten: Semikolon, Tab oder Komma. */
export function trennzeichenRaten(text) {
  const erste = text.split(/\r?\n/, 1)[0] || '';
  const zaehle = (z) => erste.split(z).length - 1;
  const kandidaten = [[';', zaehle(';')], ['\t', zaehle('\t')], [',', zaehle(',')]];
  kandidaten.sort((a, b) => b[1] - a[1]);
  return kandidaten[0][1] > 0 ? kandidaten[0][0] : ';';
}

/** CSV-Text in Zeilen aus Texten. Unterstützt Anführungszeichen, Zeilenumbrüche in Feldern und BOM. */
export function csvLesen(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const trenn = trennzeichenRaten(text);
  const zeilen = [];
  let zeile = [];
  let feld = '';
  let inAnf = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inAnf) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          feld += '"';
          i++;
        } else inAnf = false;
      } else feld += c;
    } else if (c === '"') inAnf = true;
    else if (c === trenn) {
      zeile.push(feld);
      feld = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      zeile.push(feld);
      zeilen.push(zeile);
      zeile = [];
      feld = '';
    } else feld += c;
  }
  if (feld !== '' || zeile.length) {
    zeile.push(feld);
    zeilen.push(zeile);
  }
  return zeilen;
}

/** Leere Zeilen entfernen (alle Felder leer). */
export function ohneLeerzeilen(zeilen) {
  return zeilen.filter((z) => z.some((f) => f !== null && f !== undefined && String(f).trim() !== ''));
}

/** Zelle als Text, ohne führende/abschließende Leerzeichen. */
export function zelle(wert) {
  if (wert === null || wert === undefined) return '';
  if (wert instanceof Date) return datumIso(wert);
  return String(wert).trim();
}

/** Date (aus SheetJS cellDates) oder Excel-Seriennummer oder TT.MM.JJJJ oder JJJJ-MM-TT -> ISO-Datum oder ''. */
export function datumIso(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/** Name zum Vergleichen: Groß-/Kleinschreibung und doppelte Leerzeichen egal, ß/ss und Umlaute bleiben unverändert. */
export function normName(t) {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Spaltenüberschrift zum Vergleichen. */
export function normKopf(t) {
  return normName(t).replace(/[.:*]/g, '');
}

/**
 * Rät die Zuordnung Feld -> Spaltenindex anhand der Überschriften.
 * `regeln`: { feld: [Überschriften in Kleinbuchstaben ohne Satzzeichen] }
 */
export function spaltenRaten(kopf, regeln) {
  const norm = kopf.map(normKopf);
  const zuordnung = {};
  const belegt = new Set();
  for (const [feld, namen] of Object.entries(regeln)) {
    const i = norm.findIndex((n, idx) => !belegt.has(idx) && namen.includes(n));
    if (i >= 0) {
      zuordnung[feld] = i;
      belegt.add(i);
    }
  }
  return zuordnung;
}
