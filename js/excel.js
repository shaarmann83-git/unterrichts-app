// Import aus der Excel-Vorlage V4 und Export (xlsx, csv). SheetJS (lib/xlsx.full.min.js) liegt als globales XLSX vor.
import {
  neueDaten,
  neuerSchueler,
  neueKlassenarbeit,
  neuerTermin,
  aktiveSchueler,
  datumDeutsch,
} from './modell.js';
import { gesamtPerson, prozentSL, ergebnisKA, gesamtpunkte } from './rechnen.js';
import { daltonNote, daltonProzent } from './dalton.js';
import { FZ_STATUS, FZ_QUELLE, fehlzeitenSummen } from './fehlzeiten.js';
import { sportBlaetter } from './sport-excel.js';
import { einstellungenAus } from './sport.js';

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

/** Beschriftung des Stands: Ganzjahresnote oder Zwischenstand zum Stichtag (SPEC 8.11). */
export function standText(daten, stichtag = daten.stichtag || '') {
  return stichtag ? `Zwischenstand zum ${datumDeutsch(stichtag)}` : 'Ganzjahresnote';
}

/**
 * Gesamtübersicht als Tabelle (Zeilen aus Zahlen/Text; Zahlen unformatiert).
 * Optionen: fehlzeiten (Summen, nie der Abwesenheitsgrund), archiv (Archivierte mit Kennzeichnung), stichtag.
 */
export function gesamtTabelle(daten, { fehlzeiten = true, archiv = false, stichtag = daten.stichtag || '' } = {}) {
  const personen = daten.schueler.filter((s) => (s.name || s.vorname) && (archiv || !s.archiviert));
  const duales = !!daten.bereiche?.duales;
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
    ...(daten.dalton?.modus && daten.dalton.modus !== 'aus' ? ['Ø Dalton'] : []),
    ...(fehlzeiten ? ['Fehlstd. gesamt', 'entschuldigt', 'davon mit Attest', 'nicht entschuldigt', 'offen', 'Fehltage', 'Verspätungen'] : []),
    ...(duales ? ['Betrieb', 'Ansprechperson', 'Telefon', 'E-Mail', 'Notiz Betrieb'] : []),
    ...(archiv ? ['Archiviert'] : []),
  ];
  const zeilen = personen.map((s, i) => {
    const g = gesamtPerson(daten, s.id, { stichtag });
    const z = fehlzeiten ? fehlzeitenSummen(daten, s.id) : null;
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
      ...(daten.dalton?.modus && daten.dalton.modus !== 'aus' ? [g.oDalton] : []),
      ...(z ? [z.gesamt, z.entschuldigt, z.attest, z.nicht, z.offen, z.tage, z.verspaetungen] : []),
      ...(duales ? [s.betrieb?.name || '', s.betrieb?.ansprechperson || '', s.betrieb?.telefon || '', s.betrieb?.email || '', s.betrieb?.notiz || ''] : []),
      ...(archiv ? [s.archiviert ? `ja (${datumDeutsch(s.archiviert.datum)})` : ''] : []),
    ];
  });
  return { kopf, zeilen };
}

/** Alle sL-Einträge: Datum, Stichwort, Name, Note, Prozent, Notiz. */
export function slTabelle(daten, { archiv = false } = {}) {
  const kopf = ['Datum', 'Stichwort', 'Name', 'Vorname', 'Note', 'Prozent', 'Notiz'];
  const zeilen = [];
  for (const t of daten.sonstige) {
    for (const s of daten.schueler.filter((x) => (x.name || x.vorname) && (archiv || !x.archiviert))) {
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

export function gesamtCsv(daten, optionen = {}) {
  const { kopf, zeilen } = gesamtTabelle(daten, optionen);
  const stichtag = optionen.stichtag ?? daten.stichtag ?? '';
  // Bei einem Zwischenstand steht der Stand in der ersten Zeile, damit er nie mit der Ganzjahresnote verwechselt wird.
  return (stichtag ? `${standText(daten, stichtag)}\r\n` : '') + csvText(kopf, zeilen);
}

/** xlsx als Bytes: Blatt „Gesamtübersicht“ und Blatt „Sonstige Leistung“. */
export function gesamtXlsx(daten, optionen = {}) {
  const X = XL();
  const k = daten.kopf;
  const stichtag = optionen.stichtag ?? daten.stichtag ?? '';
  const tab = gesamtTabelle(daten, optionen);
  const kopfzeilen = [
    ['Klasse', k.klasse, 'Lernfeld', [k.lernfeldNr, k.lernfeldBez].filter(Boolean).join(' '), 'Schuljahr', k.schuljahr],
    ['Gewichtung schriftlich %', daten.gewichtSchriftlich, 'sonstige %', 100 - daten.gewichtSchriftlich],
    ['Stand', standText(daten, stichtag)],
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

// ---------- Alles als Excel (SPEC 8.7) ----------

function blattNamen() {
  const benutzt = new Set();
  return (klasse, titel) => {
    const rein = (t) => String(t).replace(/[\\/?*[\]:]/g, ' ').trim();
    let basis = `${rein(klasse || 'Klasse').slice(0, 14)} ${titel}`.slice(0, 31);
    let name = basis;
    for (let i = 2; benutzt.has(name.toLowerCase()); i++) name = `${basis.slice(0, 28)} ${i}`;
    benutzt.add(name.toLowerCase());
    return name;
  };
}

/**
 * Ein Excel-Arbeitsbuch für das ganze Notenbuch. Je Klasse die Blätter Grunddaten, Klassenarbeiten,
 * Sonstige Leistung, Dalton (falls an), Fehlzeiten, Eigene Listen (falls vorhanden), Gesamtübersicht.
 * Fotos sind nie enthalten. Fehlzeiten enthalten den Abwesenheitsgrund (Gesundheitsangabe): sicher ablegen.
 */
export function alleAlsExcel(buch) {
  const X = XL();
  const mappe = X.utils.book_new();
  const name = blattNamen();
  const hinzu = (n, zeilen) => X.utils.book_append_sheet(mappe, X.utils.aoa_to_sheet(zeilen), n);
  for (const k of buch.klassen) {
    const kn = k.kopf.klasse;
    if (k.fachtyp === 'sport') {
      // Sport: je Reihe ein Blatt und die Gesamtnote; dazu Grunddaten und Fehlzeiten wie bei den anderen Klassen
      for (const b of sportBlaetter(k, einstellungenAus(buch))) hinzu(name(kn, b.titel), b.zeilen);
      const fzs = [['Name', 'Vorname', 'Datum', 'bis', 'Fehlstd.', 'Fach', 'Status', 'Grund', 'Quelle', 'zählt']];
      for (const f of k.fehlzeiten) {
        const s = k.schueler.find((x) => x.id === f.schuelerId);
        fzs.push([s?.name || '', s?.vorname || '', datumDeutsch(f.datum), datumDeutsch(f.datumBis), f.std ?? null, f.fach || '', FZ_STATUS[f.status] || '', f.grund || '', FZ_QUELLE[f.quelle] || '', f.zaehltNicht ? 'nein' : 'ja']);
      }
      hinzu(name(kn, 'Fehlzeiten'), fzs);
      continue;
    }
    const personen = k.schueler.filter((s) => s.name || s.vorname);
    const duales = k.bereiche?.duales;
    const kopfInfo = [
      ['Klasse', k.kopf.klasse, 'Lernfeld', [k.kopf.lernfeldNr, k.kopf.lernfeldBez].filter(Boolean).join(' '), 'Schuljahr', k.kopf.schuljahr],
      ['Gewichtung schriftlich %', k.gewichtSchriftlich, 'sonstige %', 100 - k.gewichtSchriftlich],
      ['Stand', standText(k)],
      [],
    ];
    hinzu(name(kn, 'Grunddaten'), [
      ...kopfInfo,
      ['Nr.', 'Name', 'Vorname', 'm/w/d', 'Geburtstag', 'Untis-ID', 'Archiviert', ...(duales ? ['Betrieb', 'Ansprechperson', 'Telefon', 'E-Mail', 'Notiz Betrieb'] : [])],
      ...personen.map((s, i) => [
        i + 1, s.name, s.vorname, s.geschlecht, datumDeutsch(s.geburtstag), s.untisId,
        s.archiviert ? `ja (${datumDeutsch(s.archiviert.datum)}${s.archiviert.grund ? `, ${s.archiviert.grund}` : ''})` : '',
        ...(duales ? [s.betrieb?.name, s.betrieb?.ansprechperson, s.betrieb?.telefon, s.betrieb?.email, s.betrieb?.notiz] : []),
      ]),
    ]);
    const kaZeilen = [...kopfInfo];
    k.klassenarbeiten.forEach((ka, i) => {
      kaZeilen.push([`Klassenarbeit ${i + 1}`, 'Datum', datumDeutsch(ka.datum), 'Gewicht', ka.gewicht, 'Schwerpunkte', ka.schwerpunkte]);
      kaZeilen.push(['Nr.', 'Name', 'Vorname', ...ka.aufgaben.map((_, j) => `Aufg. ${ka.bezeichnungen?.[j] || j + 1}`), '∑', '%', 'Note', 'Attest', 'Teilnahme', 'Sonstiges']);
      kaZeilen.push(['', 'Höchstpunkte', '', ...ka.aufgaben, gesamtpunkte(ka)]);
      personen.forEach((s, n) => {
        const e = ergebnisKA(ka, s.id, k);
        const roh = ka.ergebnisse[s.id];
        kaZeilen.push([n + 1, s.name, s.vorname, ...ka.aufgaben.map((_, j) => roh?.punkte?.[j] ?? null), e.summe, e.prozent, e.note, e.attest ? 'ja' : '', ka.teilnahme?.[s.id]?.status || '', roh?.sonstiges || '']);
      });
      kaZeilen.push([]);
    });
    hinzu(name(kn, 'Klassenarbeiten'), kaZeilen);
    const sl = slTabelle(k, { archiv: true });
    hinzu(name(kn, 'Sonstige Leistung'), [...kopfInfo, sl.kopf, ...sl.zeilen]);
    if (k.dalton && k.dalton.modus !== 'aus') {
      const dz = [['Dalton', k.dalton.modus === 'einrechnen' ? `fließt ein mit ${k.dalton.anteil} %` : 'nur dokumentiert'], [], ['Aufgabe', 'Ausgabe', 'Abgabe', 'Gewicht', 'Name', 'Vorname', 'Status', 'Qualität', 'Selbstständig', 'Note überschrieben', 'Note', 'Prozent', 'Notiz']];
      for (const a of k.dalton.aufgaben) {
        for (const s of personen) {
          const e = a.eintraege[s.id];
          if (!e) continue;
          dz.push([a.titel, datumDeutsch(a.ausgabe), datumDeutsch(a.abgabe), a.gewicht, s.name, s.vorname, e.status || '', e.qualitaet || '', e.selbststaendig || '', e.note ?? null, daltonNote(e, k.dalton.zuordnung), daltonProzent(e, k.dalton.zuordnung), e.notiz || '']);
        }
      }
      hinzu(name(kn, 'Dalton'), dz);
    }
    const fz = [['Name', 'Vorname', 'Datum', 'bis', 'Von', 'Bis', 'Stunde', 'Fehlstd.', 'Fehlmin.', 'Fach', 'Status', 'Grund', 'Quelle', 'zählt', 'Notiz']];
    for (const f of k.fehlzeiten) {
      const s = k.schueler.find((x) => x.id === f.schuelerId);
      fz.push([s?.name || '', s?.vorname || '', datumDeutsch(f.datum), datumDeutsch(f.datumBis), f.zeitVon || '', f.zeitBis || '', f.stunde ?? null, f.std ?? null, f.min ?? null, f.fach || '', FZ_STATUS[f.status] || '', f.grund || '', FZ_QUELLE[f.quelle] || '', f.zaehltNicht ? 'nein' : 'ja', f.notiz || '']);
    }
    hinzu(name(kn, 'Fehlzeiten'), fz);
    if (k.listen.length) {
      const lz = [['Liste', 'Art', 'Name', 'Vorname', 'Datum', 'Wert', 'Notiz']];
      for (const l of k.listen) {
        for (const s of personen) {
          for (const e of l.eintraege[s.id] || []) lz.push([l.name, l.art, s.name, s.vorname, datumDeutsch(e.datum), e.betrag ?? e.wert ?? (e.erledigt ? 'erledigt' : 1), e.notiz || '']);
        }
        if (l.art === 'betrag') for (const s of personen) lz.push([l.name, 'Sollbetrag', s.name, s.vorname, '', l.sollJe?.[s.id] ?? l.soll, '']);
      }
      hinzu(name(kn, 'Eigene Listen'), lz);
    }
    const gt = gesamtTabelle(k, { archiv: true });
    hinzu(name(kn, 'Gesamtübersicht'), [...kopfInfo, gt.kopf, ...gt.zeilen]);
  }
  if (buch.klassen.length === 0) hinzu('Leer', [['Das Notenbuch enthält keine Klassen.']]);
  return X.write(mappe, { type: 'array', bookType: 'xlsx' });
}
