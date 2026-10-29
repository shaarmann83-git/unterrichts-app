// Import aus der Excel-Vorlage V4 und Export (xlsx, csv). SheetJS (lib/xlsx.full.min.js) liegt als globales XLSX vor.
import {
  neueDaten,
  neuerSchueler,
  neueKlassenarbeit,
  neuerTermin,
  aktiveSchueler,
  datumDeutsch,
} from './modell.js';
import { gesamtPerson, prozentSL } from './rechnen.js';

const XL = () => {
  if (!globalThis.XLSX) throw new Error('Die Excel-Bibliothek ist nicht geladen.');
  return globalThis.XLSX;
};

function wert(blatt, adresse) {
  const z = blatt?.[adresse];
  if (!z || z.v === undefined || z.v === null) return null;
  return z.v;
}

function text(blatt, adresse) {
  const v = wert(blatt, adresse);
  return v === null ? '' : String(v).trim();
}

function zahl(blatt, adresse) {
  const v = wert(blatt, adresse);
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

/** Excel-Datum (Seriennummer, Text TT.MM.JJJJ oder JJJJ-MM-TT) -> ISO-Datum oder ''. */
export function datumNachIso(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

const SPALTEN_AUFGABEN = Array.from({ length: 21 }, (_, i) => String.fromCharCode(68 + i)); // D..X
const SPALTEN_SL = ['D', 'F', 'H', 'J', 'L', 'N', 'P', 'R', 'T', 'V', 'X', 'Z'];
const SPALTEN_GEWICHT_KA = ['G', 'H', 'I', 'J'];
const SPALTEN_GEWICHT_SL = ['M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X'];

/**
 * Liest die Vorlage Notenliste_Teilzeit_V4.xlsx.
 * Gibt die Notendaten und eine Vorschau (was übernommen wird) zurück.
 */
export function importiereVorlage(arrayBuffer) {
  const X = XL();
  const mappe = X.read(arrayBuffer, { type: 'array' });
  const blatt = (name) => mappe.Sheets[name];
  const grund = blatt('Grunddaten');
  if (!grund) throw new Error('Blatt „Grunddaten“ fehlt. Das ist wohl nicht die Vorlage V4.');

  const daten = neueDaten({
    klasse: text(grund, 'D5'),
    lernfeldNr: text(grund, 'G5'),
    lernfeldBez: text(grund, 'G6'),
    schuljahr: text(grund, 'M5'),
  });
  const gw = zahl(grund, 'L12');
  if (gw !== null) daten.gewichtSchriftlich = Math.round(gw * 100 * 1000) / 1000;

  // Schüler:innen: Zeilen 12..43; Position i entspricht Zeile 5+i in KA- und sL-Blättern.
  daten.schueler = [];
  const zeilenIndex = []; // Index 0..31 -> Schüler oder null
  for (let i = 0; i < 32; i++) {
    const zeile = 12 + i;
    const s = neuerSchueler();
    s.name = text(grund, `C${zeile}`);
    s.vorname = text(grund, `D${zeile}`);
    const g = text(grund, `E${zeile}`).toLowerCase();
    s.geschlecht = ['m', 'w', 'd'].includes(g) ? g : '';
    s.geburtstag = datumNachIso(wert(grund, `F${zeile}`));
    if (s.name || s.vorname) {
      daten.schueler.push(s);
      zeilenIndex[i] = s;
    } else {
      zeilenIndex[i] = null;
    }
  }

  // Klassenarbeiten KA 1..KA 4
  daten.klassenarbeiten = [];
  const vorschauKA = [];
  for (let n = 1; n <= 4; n++) {
    const b = blatt(`KA ${n}`);
    if (!b) continue;
    const hoechst = SPALTEN_AUFGABEN.map((sp) => zahl(b, `${sp}4`));
    let letzte = -1;
    hoechst.forEach((h, i) => {
      if (h !== null) letzte = i;
    });
    let punkteAnzahl = 0;
    const ka = neueKlassenarbeit(Math.max(letzte + 1, 0));
    ka.aufgaben = hoechst.slice(0, letzte + 1);
    ka.datum = datumNachIso(wert(b, 'AA1'));
    for (let i = 0; i < 32; i++) {
      const s = zeilenIndex[i];
      const zeile = 5 + i;
      const punkte = SPALTEN_AUFGABEN.slice(0, letzte + 1).map((sp) => zahl(b, `${sp}${zeile}`));
      const attestWert = text(b, `AB${zeile}`);
      const attest = attestWert !== '' && !['0', 'nein', 'false'].includes(attestWert.toLowerCase());
      if (!s) continue;
      if (punkte.some((p) => p !== null) || attest) {
        ka.ergebnisse[s.id] = { punkte, attest, sonstiges: '' };
        punkteAnzahl += punkte.filter((p) => p !== null).length;
      }
    }
    const gewicht = zahl(blatt('Notenliste gesamt'), `${SPALTEN_GEWICHT_KA[n - 1]}6`);
    if (gewicht !== null) ka.gewicht = gewicht;
    if (ka.aufgaben.length === 0 && punkteAnzahl === 0) continue; // leere Arbeit überspringen
    daten.klassenarbeiten.push(ka);
    vorschauKA.push({ nr: n, aufgaben: ka.aufgaben.length, punkte: punkteAnzahl, datum: ka.datum });
  }

  // Sonstige Leistung: 12 Spalten werden zu Terminen, leere werden übersprungen.
  const sl = blatt('sonst. Leistung');
  const gesamtBlatt = blatt('Notenliste gesamt');
  let uebersprungen = 0;
  daten.sonstige = [];
  if (sl) {
    SPALTEN_SL.forEach((sp, idx) => {
      const termin = neuerTermin(datumNachIso(wert(sl, `${sp}3`)));
      let noten = 0;
      for (let i = 0; i < 32; i++) {
        const s = zeilenIndex[i];
        if (!s) continue;
        const note = zahl(sl, `${sp}${5 + i}`);
        if (note !== null) {
          termin.eintraege[s.id] = { note, notiz: '' };
          noten += 1;
        }
      }
      if (noten === 0) {
        uebersprungen += 1;
        return;
      }
      const g = zahl(gesamtBlatt, `${SPALTEN_GEWICHT_SL[idx]}6`);
      if (g !== null) termin.gewicht = g;
      daten.sonstige.push(termin);
    });
  }

  const vorschau = {
    klasse: daten.kopf.klasse,
    lernfeld: [daten.kopf.lernfeldNr, daten.kopf.lernfeldBez].filter(Boolean).join(' '),
    schuljahr: daten.kopf.schuljahr,
    gewichtSchriftlich: daten.gewichtSchriftlich,
    schueler: daten.schueler.length,
    klassenarbeiten: vorschauKA,
    termine: daten.sonstige.length,
    termineUebersprungen: uebersprungen,
  };
  return { daten, vorschau };
}

// ---------- Export ----------

/** Gesamtübersicht als Tabelle (Zeilen aus Zahlen/Text; Zahlen unformatiert). */
export function gesamtTabelle(daten) {
  const personen = aktiveSchueler(daten);
  const kopf = [
    'Nr.',
    'Name',
    'Vorname',
    'Gesamt %',
    'Gesamtnote',
    ...daten.klassenarbeiten.map((_, i) => `KA ${i + 1} %`),
    'Ø KA',
    'Anzahl sL-Noten',
    'Ø sL',
  ];
  const zeilen = personen.map((s, i) => {
    const g = gesamtPerson(daten, s.id);
    return [
      i + 1,
      s.name,
      s.vorname,
      g.gesamtProzent,
      g.gesamtNote,
      ...g.kaProzente,
      g.oKA,
      g.anzahlSL,
      g.oSL,
    ];
  });
  return { kopf, zeilen };
}

/** Alle sL-Einträge: Datum, Stichwort, Name, Note, Prozent, Notiz. */
export function slTabelle(daten) {
  const kopf = ['Datum', 'Stichwort', 'Name', 'Vorname', 'Note', 'Prozent', 'Notiz'];
  const zeilen = [];
  for (const t of daten.sonstige) {
    for (const s of aktiveSchueler(daten)) {
      const e = t.eintraege[s.id];
      if (!e || (e.note === null && !e.notiz) || (e.note === undefined && !e.notiz)) continue;
      const note = e.note ?? null;
      zeilen.push([datumDeutsch(t.datum), t.stichwort || '', s.name, s.vorname, note, note === null ? null : prozentSL(note), e.notiz || '']);
    }
  }
  return { kopf, zeilen };
}

/** CSV mit Semikolon und deutschem Dezimalkomma. */
export function csvText(kopf, zeilen) {
  const feld = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6).replace('.', ',');
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [kopf, ...zeilen].map((z) => z.map(feld).join(';')).join('\r\n') + '\r\n';
}

export function gesamtCsv(daten) {
  const { kopf, zeilen } = gesamtTabelle(daten);
  return csvText(kopf, zeilen);
}

/** xlsx als Bytes: Blatt „Gesamtübersicht“ und Blatt „Sonstige Leistung“. */
export function gesamtXlsx(daten) {
  const X = XL();
  const k = daten.kopf;
  const tab = gesamtTabelle(daten);
  const kopfzeilen = [
    ['Klasse', k.klasse, 'Lernfeld', [k.lernfeldNr, k.lernfeldBez].filter(Boolean).join(' '), 'Schuljahr', k.schuljahr],
    ['Gewichtung schriftlich %', daten.gewichtSchriftlich, 'sonstige %', 100 - daten.gewichtSchriftlich],
    [],
  ];
  const blatt1 = X.utils.aoa_to_sheet([...kopfzeilen, tab.kopf, ...tab.zeilen]);
  const sl = slTabelle(daten);
  const blatt2 = X.utils.aoa_to_sheet([sl.kopf, ...sl.zeilen]);
  const mappe = X.utils.book_new();
  X.utils.book_append_sheet(mappe, blatt1, 'Gesamtübersicht');
  X.utils.book_append_sheet(mappe, blatt2, 'Sonstige Leistung');
  return X.write(mappe, { type: 'array', bookType: 'xlsx' });
}
