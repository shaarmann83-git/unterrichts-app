import { NOTENGRENZEN_STANDARD, PUNKTEGRENZEN_STANDARD } from './rechnen.js';
// Datenmodell: Notenbuch (Datei) mit beliebig vielen Klassen und einfache Änderungen daran.
// Eine Klasse enthält alles aus SPEC Abschnitt 3 plus die Erweiterungen aus Abschnitt 8.

export const FORMAT_VERSION = 2;
export const STANDARD_SCHUELER = 32;
export const STANDARD_KLASSENARBEITEN = 4;
export const STANDARD_AUFGABEN = 10;

export const DALTON_STANDARD_ZUORDNUNG = { gut: 2, mittel: 3, schlecht: 4, nicht: 6, taeuschung: 6 };
export const DALTON_STANDARD_TEXTE = {
  gut: 'vollständig, fachlich überwiegend richtig',
  mittel: 'vollständig, mehrere fachliche Fehler',
  schlecht: 'lückenhaft oder überwiegend fehlerhaft',
  nicht: 'nicht abgegeben',
  taeuschung: 'abgeschrieben (Täuschung)',
};

// ---------- Sport (SPEC Abschnitt 9) ----------

/** Standard der Sport-Einstellungen (9.6a). Gelten für alle Sport-Klassen eines Notenbuchs. */
export function sportStandard() {
  return {
    pruefschluessel: [83, 58, 40, 25, 10], // ab x % -> Note 1, 2, 3, 4, 5, darunter 6
    mitarbeitsTabelle: [2.8, 2.4, 1.7, 1.0, 0.4], // ab Ø -> Grundnote 1, 2, 3, 4, 5, darunter 6
    standardwert: 2,
    mindestTermine: 3,
    schritt: 1 / 3,
    offenZaehltNull: true,
    punkte: { basis: 17, faktor: 3, min: 0, max: 15 },
    pruefungstagKennzeichen: ['T', 'P'],
    protokoll: [], // [{zeit, was, vorher, nachher}]
  };
}

export const SPORT_ZEICHEN = ['.', 'V', 'sps', 'k', 'ke', 'ka', 'ku', '|', 'E', 'A', 'B', 'P', 'U'];

export function neueSport() {
  return {
    notensystem: 'noten', // 'noten' | 'punkte'
    zeitraum: 'halbjahr', // 'halbjahr' | 'jahr'
    endnoteVariante: 'besser', // 'besser' | 'wert' | 'note'
    termine: [], // {id, datum, uhrzeit, reihe (Reihen-ID oder ''), pruefungstag, vermerk, halbjahr, uid}
    anwesenheit: {}, // [terminId][schuelerId] = {z, min, stern, text, quelle}
    mitarbeit: {}, // [terminId][schuelerId] = 0..3 (nur Abweichungen vom Standardwert)
    merkmale: {}, // [terminId][schuelerId] = [bool, bool, bool]
    reihen: [],
    endnoten: {}, // [schuelerId] = {wert, begruendung}
  };
}

export const STUFEN_STANDARD = [
  'Netz/Aus bzw. nicht fangbar',
  'im Feld, aber außerhalb der Zielzone',
  'in der Zielzone',
  'in der Zielzone und alle drei Merkmale sauber',
];

export function neuerPruefteil(name = '') {
  return { id: neueId(), name, versuche: 5, hoechst: null, gewicht: 1, zone: '', merkmale: ['', '', ''], stufen: null };
}

export function neueReihe(name = '') {
  return {
    id: neueId(),
    name,
    vorlage: '',
    halbjahr: 1,
    gewichtReihe: 1,
    gewichte: { pruefung: 0.5, mitarbeit: 0.5, verhalten: 0 },
    teile: [], // Prüfungsteile
    direkte: [], // weitere direkte Teilleistungen {id, name, gewicht, stufen: [Text je Note 1..6]}
    merkmaleTexte: ['', '', ''],
    ersatzTeile: [], // Prüfungsteile der Ersatzprüfung
    werte: {}, // [schuelerId] = {versuche, summen, direkt, verhalten, bemerkung, mitarbeitNote, ersatz}
  };
}

export function neueId() {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function neueKlassenarbeit(aufgabenAnzahl = STANDARD_AUFGABEN) {
  return {
    id: neueId(),
    datum: '',
    uhrzeitVon: '',
    uhrzeitBis: '',
    korrekturdatum: '',
    schwerpunkte: '',
    gewicht: 1,
    aufgaben: Array.from({ length: aufgabenAnzahl }, () => null),
    // false: eine Spalte je Aufgabe. true: Teilaufgaben mit Summe je Aufgabe.
    teilaufgaben: false,
    // Anzahl der Teile je Aufgabe; die Summe entspricht immer der Zahl der Spalten.
    teile: Array.from({ length: aufgabenAnzahl }, () => 1),
    ergebnisse: {},
    teilnahme: {},
  };
}

const BUCHSTABEN = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Spalten einer Klassenarbeit zu Aufgaben zusammenfassen.
 * Rückgabe: [{ nr, schluessel, indizes, geteilt, namen }] in der Reihenfolge der Spalten.
 * `geteilt` ist wahr, wenn die Aufgabe aus mehreren Teilaufgaben besteht; dann heißen die
 * Spalten 1a, 1b, 1c, sonst einfach 1.
 */
export function aufgabenGruppen(ka) {
  const teile = aufgabenTeile(ka);
  const gruppen = [];
  let i = 0;
  teile.forEach((anzahl, g) => {
    const indizes = [];
    for (let k = 0; k < anzahl; k++) indizes.push(i++);
    const nr = g + 1;
    const geteilt = anzahl > 1;
    gruppen.push({
      nr,
      schluessel: String(nr),
      indizes,
      geteilt,
      namen: indizes.map((_, k) => (geteilt ? `${nr}${BUCHSTABEN[k] || k + 1}` : String(nr))),
    });
  });
  return gruppen;
}

/** Teile je Aufgabe, immer passend zur Spaltenzahl. */
export function aufgabenTeile(ka) {
  const spalten = (ka.aufgaben || []).length;
  const teile = Array.isArray(ka.teile) ? ka.teile.map((n) => Math.max(1, Math.round(Number(n) || 1))) : [];
  const summe = teile.reduce((a, b) => a + b, 0);
  if (summe === spalten && teile.length > 0) return teile;
  if (summe < spalten) return [...teile, ...Array.from({ length: spalten - summe }, () => 1)];
  // Zu viele Teile: von hinten kürzen, bis es passt.
  const gekuerzt = [];
  let rest = spalten;
  for (const n of teile) {
    if (rest <= 0) break;
    gekuerzt.push(Math.min(n, rest));
    rest -= Math.min(n, rest);
  }
  return gekuerzt.length ? gekuerzt : Array.from({ length: spalten }, () => 1);
}

/** Beschriftung einer Spalte, z. B. '1a' oder '2'. */
export function spaltenName(ka, index) {
  for (const g of aufgabenGruppen(ka)) {
    const k = g.indizes.indexOf(index);
    if (k >= 0) return g.namen[k];
  }
  return String(index + 1);
}

/** Summe der Höchstpunkte einer Aufgabe (Gruppe). */
export function gruppeHoechst(ka, gruppe) {
  return gruppe.indizes.reduce((s, i) => s + (Number(ka.aufgaben[i]) || 0), 0);
}

/** Summe der erreichten Punkte einer Aufgabe (Gruppe); null, wenn nichts eingetragen ist. */
export function gruppeErreicht(ka, schuelerId, gruppe) {
  const p = ka.ergebnisse?.[schuelerId]?.punkte || [];
  const werte = gruppe.indizes.map((i) => p[i]).filter((v) => v !== null && v !== undefined && v !== '');
  if (werte.length === 0) return null;
  return werte.reduce((s, v) => s + Number(v), 0);
}

export function neuerSchueler() {
  return {
    id: neueId(),
    name: '',
    vorname: '',
    geschlecht: '',
    geburtstag: '',
    volljaehrig: false,
    untisId: '',
    betrieb: { name: '', ansprechperson: '', telefon: '', email: '', notiz: '' },
    foto: null, // { daten: 'data:image/jpeg;base64,...' }
    fotoEinwilligung: null, // { datum: 'JJJJ-MM-TT' }
    archiviert: null, // { datum, grund }
  };
}

export function neuerTermin(datum, stichwort = '') {
  return { id: neueId(), datum, stichwort, gewicht: 1, eintraege: {} };
}

export function neueDaltonAufgabe(titel = '', ausgabe = '', abgabe = '') {
  return { id: neueId(), titel, ausgabe, abgabe, gewicht: 1, eintraege: {} };
}

export function neueDaltonEinstellung() {
  return {
    modus: 'aus', // 'aus' | 'doku' | 'einrechnen'
    anteil: 10,
    zuordnung: { ...DALTON_STANDARD_ZUORDNUNG },
    texte: { ...DALTON_STANDARD_TEXTE },
    aufgaben: [],
  };
}

export function neueListe(name, art) {
  return { id: neueId(), name, art, ausgeblendet: false, soll: 0, eintraege: {} };
}

/** Neue, leere Klasse. */
/** Auswahl für die Bezeichnung einer Klasse. Eigener Text bleibt möglich. */
export const BEZEICHNUNGEN = ['Lernfeld', 'Lerngebiet', 'Fach', 'Kurs'];

/** Auswahlbare Vorlagen für die Unterschriftszeilen. Freier Text bleibt immer möglich. */
export const UNTERSCHRIFT_VORLAGEN = [
  'Korrekturdatum und Unterschrift der Lehrkraft',
  'Unterschrift Ausbilderin/Ausbilder (bei nicht mehr ausreichender Leistung!)',
  'Unterschrift Erziehungsberechtigte(r) (bei Minderjährigen)',
  'Unterschrift Ausbildungsbetrieb',
  'Unterschrift der Schülerin/des Schülers',
  'Datum und Unterschrift, zur Kenntnis genommen',
];

/** Standardtexte der Unterschriftszeilen im Protokoll (SPEC 4). Je Klasse änderbar. */
export const UNTERSCHRIFTEN_STANDARD = [
  'Korrekturdatum und Unterschrift der Lehrkraft',
  'Unterschrift Ausbilderin/Ausbilder (bei nicht mehr ausreichender Leistung!)',
];

/** Zusatzzeile, die nur bei Personen mit Ausbildungsbetrieb gedruckt wird. */
export const UNTERSCHRIFT_MIT_BETRIEB = 'Unterschrift Ausbilderin/Ausbilder (bei nicht mehr ausreichender Leistung!)';
/** Zusatzzeile, die nur bei Personen ohne Ausbildungsbetrieb gedruckt wird. */
export const UNTERSCHRIFT_OHNE_BETRIEB = 'Unterschrift Erziehungsberechtigte(r) (bei Minderjährigen)';

/** Unterschriftszeilen für eine bestimmte Person: feste Zeilen plus passende Zusatzzeile. */
export function unterschriftenFuer(klasse, person) {
  const fest = (klasse.unterschriften || []).map((t) => String(t).trim()).filter(Boolean);
  const hatBetrieb = !!String(person?.betrieb?.name || '').trim();
  const zusatz = hatBetrieb ? klasse.unterschriftMitBetrieb : klasse.unterschriftOhneBetrieb;
  const z = String(zusatz || '').trim();
  return z ? [...fest, z] : fest;
}

/**
 * Zeile „<Bezeichnung> <Nr>: <Text>“ für Ausdruck und Übersichten.
 * `fachLabel` ist frei, z. B. „Lernfeld“ oder „Fach“; ohne Nummer entfällt sie.
 */
export function fachZeile(kopf, { leer = '' } = {}) {
  const label = (kopf.fachLabel || 'Lernfeld').trim();
  const nr = String(kopf.lernfeldNr || '').trim();
  const bez = String(kopf.lernfeldBez || '').trim();
  if (!nr && !bez) return leer;
  return `${[label, nr].filter(Boolean).join(' ')}${bez ? `: ${bez}` : ''}`;
}

export function neueKlasse({ klasse = '', lernfeldNr = '', lernfeldBez = '', schuljahr = '', fachtyp = 'lernfeld', fachLabel = 'Lernfeld' } = {}) {
  return {
    id: neueId(),
    kopf: { klasse, lernfeldNr, lernfeldBez, schuljahr, fachLabel },
    unterschriften: [UNTERSCHRIFTEN_STANDARD[0]],
    unterschriftMitBetrieb: UNTERSCHRIFT_MIT_BETRIEB,
    unterschriftOhneBetrieb: UNTERSCHRIFT_OHNE_BETRIEB,
    // Notenschlüssel je Klasse, damit Berufsschule (Noten) und berufliches Gymnasium (Punkte) nebeneinander möglich sind.
    notensystem: 'noten', // 'noten' = 1 bis 6, 'punkte' = 0 bis 15
    notengrenzen: [...NOTENGRENZEN_STANDARD],
    punktegrenzen: [...PUNKTEGRENZEN_STANDARD],
    gewichtSchriftlich: 50,
    schueler: Array.from({ length: STANDARD_SCHUELER }, neuerSchueler),
    klassenarbeiten: Array.from({ length: STANDARD_KLASSENARBEITEN }, () => neueKlassenarbeit()),
    sonstige: [],
    bereiche: { duales: false, fotos: false },
    dalton: neueDaltonEinstellung(),
    fehlzeiten: [],
    untis: { faecher: [], klassenName: '', importiert: [] },
    listen: [],
    stichtag: '',
    fachtyp, // 'lernfeld' | 'sport'
    sport: neueSport(),
    stundenplan: [], // importierte Stundenplan-Einträge (iCal), nur Zeiten und Fach, keine Schülerdaten
  };
}

/** Frühere Bezeichnung aus Stufe 1: eine „Datenmenge“ ist jetzt eine Klasse. */
export const neueDaten = neueKlasse;

/** Neues, leeres Notenbuch (optional mit einer ersten Klasse). */
export function neuesBuch(ersteKlasse = null, schuljahr = '') {
  return {
    format: 'noten',
    version: FORMAT_VERSION,
    dokumentId: neueId(),
    gespeichertAm: '',
    schuljahr: schuljahr || '',
    einstellungen: {
      untisOrdnerAutomatisch: false, untisDateien: [], sport: sportStandard(),
      stundenplan: { zuordnung: {}, letzterImport: '' },
      // Kopfbilder für den Ausdruck (z. B. Schulfoto links, Logo rechts). Von der Nutzerin hochgeladen.
      druck: { kopfLinks: '', kopfRechts: '' },
    },
    klassen: ersteKlasse ? [ersteKlasse] : [],
  };
}

/** Ergänzt fehlende Felder einer Klasse. */
export function pruefeKlasse(k) {
  k.id ||= neueId();
  k.kopf ||= {};
  for (const f of ['klasse', 'lernfeldNr', 'lernfeldBez', 'schuljahr']) k.kopf[f] ??= '';
  k.kopf.fachLabel ||= 'Lernfeld';
  if (!Array.isArray(k.unterschriften)) k.unterschriften = [...UNTERSCHRIFTEN_STANDARD];
  if (k.unterschriftMitBetrieb === undefined && k.unterschriftOhneBetrieb === undefined
    && k.unterschriften.length === 2 && k.unterschriften[1] === UNTERSCHRIFTEN_STANDARD[1]) {
    // Unveränderte Vorgabe: feste Ausbilder-Zeile wird zur Zusatzzeile, damit sie nur bei
    // Personen mit Ausbildungsbetrieb erscheint. Von Hand geänderte Zeilen bleiben unberührt.
    k.unterschriften = [k.unterschriften[0]];
    k.unterschriftMitBetrieb = UNTERSCHRIFT_MIT_BETRIEB;
    k.unterschriftOhneBetrieb = UNTERSCHRIFT_OHNE_BETRIEB;
  }
  k.unterschriftMitBetrieb ??= '';
  k.unterschriftOhneBetrieb ??= '';
  k.notensystem ||= 'noten';
  if (!Array.isArray(k.notengrenzen) || k.notengrenzen.length !== 5) k.notengrenzen = [...NOTENGRENZEN_STANDARD];
  if (!Array.isArray(k.punktegrenzen) || k.punktegrenzen.length !== 15) k.punktegrenzen = [...PUNKTEGRENZEN_STANDARD];
  k.gewichtSchriftlich ??= 50;
  k.schueler ||= [];
  k.klassenarbeiten ||= [];
  k.sonstige ||= [];
  k.bereiche ||= {};
  k.bereiche.duales ??= false;
  k.bereiche.fotos ??= false;
  const dal = (k.dalton ||= neueDaltonEinstellung());
  dal.modus ||= 'aus';
  dal.anteil ??= 10;
  dal.zuordnung = { ...DALTON_STANDARD_ZUORDNUNG, ...(dal.zuordnung || {}) };
  dal.texte = { ...DALTON_STANDARD_TEXTE, ...(dal.texte || {}) };
  dal.aufgaben ||= [];
  for (const a of dal.aufgaben) {
    a.id ||= neueId();
    a.gewicht ??= 1;
    a.eintraege ||= {};
  }
  k.fehlzeiten ||= [];
  k.untis ||= {};
  k.untis.faecher ||= [];
  k.untis.klassenName ??= '';
  k.untis.importiert ||= [];
  k.listen ||= [];
  for (const l of k.listen) {
    l.id ||= neueId();
    l.eintraege ||= {};
    l.soll ??= 0;
  }
  k.stichtag ??= '';
  k.fachtyp ||= 'lernfeld';
  k.stundenplan ||= [];
  const sp = (k.sport ||= neueSport());
  const vorgabe = neueSport();
  for (const f of ['notensystem', 'zeitraum', 'endnoteVariante']) sp[f] ||= vorgabe[f];
  for (const f of ['termine', 'reihen']) sp[f] ||= [];
  for (const f of ['anwesenheit', 'mitarbeit', 'merkmale', 'endnoten']) sp[f] ||= {};
  for (const t of sp.termine) {
    t.id ||= neueId();
    t.datum ??= '';
    t.uhrzeit ??= '';
    t.reihe ??= '';
    t.pruefungstag ??= false;
    t.vermerk ??= '';
    t.halbjahr ||= 1;
  }
  for (const r of sp.reihen) {
    const v = neueReihe();
    r.id ||= neueId();
    r.halbjahr ||= 1;
    r.gewichtReihe ??= 1;
    r.gewichte = { ...v.gewichte, ...(r.gewichte || {}) };
    r.teile ||= [];
    r.direkte ||= [];
    r.merkmaleTexte ||= ['', '', ''];
    r.ersatzTeile ||= [];
    r.werte ||= {};
    for (const t of [...r.teile, ...r.ersatzTeile]) {
      t.id ||= neueId();
      t.versuche ??= 5;
      t.gewicht ??= 1;
      t.merkmale ||= ['', '', ''];
    }
    for (const d of r.direkte) {
      d.id ||= neueId();
      d.gewicht ??= 1;
    }
  }
  for (const s of k.schueler) {
    s.id ||= neueId();
    s.untisId ??= '';
    s.betrieb ||= { name: '', ansprechperson: '', telefon: '', email: '', notiz: '' };
    s.foto ??= null;
    s.fotoEinwilligung ??= null;
    s.archiviert ??= null;
  }
  for (const ka of k.klassenarbeiten) {
    ka.id ||= neueId();
    ka.gewicht ??= 1;
    ka.uhrzeitVon ??= '';
    ka.uhrzeitBis ??= '';
    ka.korrekturdatum ??= '';
    ka.aufgaben ||= [];
    ka.teilaufgaben = !!ka.teilaufgaben;
    // Ältere Dateien mit getippten Beschriftungen (1a, 1b, …) in Teile je Aufgabe umwandeln.
    if (!Array.isArray(ka.teile) && Array.isArray(ka.bezeichnungen)) {
      const teile = [];
      let letzte = null;
      ka.bezeichnungen.slice(0, ka.aufgaben.length).forEach((b, i) => {
        const m = String(b ?? i + 1).trim().match(/^(\d+)/);
        const s = m ? m[1] : String(b ?? i + 1);
        if (s === letzte) teile[teile.length - 1] += 1;
        else { teile.push(1); letzte = s; }
      });
      ka.teile = teile;
      if (teile.some((n) => n > 1)) ka.teilaufgaben = true;
    }
    delete ka.bezeichnungen;
    ka.teile = aufgabenTeile(ka);
    ka.ergebnisse ||= {};
    ka.teilnahme ||= {};
  }
  for (const t of k.sonstige) {
    t.id ||= neueId();
    t.gewicht ??= 1;
    t.eintraege ||= {};
  }
  return k;
}

/**
 * Prüft eingelesene Notendatei und liefert immer ein Notenbuch.
 * Dateien aus Stufe 1 (eine Klasse, version 1) werden in ein Notenbuch mit einer Klasse umgewandelt.
 */
export function pruefeBuch(roh) {
  if (!roh || typeof roh !== 'object' || roh.format !== 'noten') {
    throw new Error('Das ist keine Notendatei dieser App.');
  }
  if (roh.version > FORMAT_VERSION) {
    throw new Error('Diese Notendatei stammt aus einer neueren Version der App.');
  }
  let buch = roh;
  if (!Array.isArray(roh.klassen)) {
    // Stufe 1: die Datei selbst ist die Klasse.
    const { format, version, dokumentId, gespeichertAm, ...klasse } = roh;
    buch = {
      format: 'noten',
      version: FORMAT_VERSION,
      dokumentId,
      gespeichertAm,
      klassen: [klasse],
    };
  }
  buch.version = FORMAT_VERSION;
  buch.dokumentId ||= neueId();
  buch.gespeichertAm ||= '';
  buch.einstellungen ||= {};
  buch.einstellungen.untisOrdnerAutomatisch ??= false;
  buch.einstellungen.untisDateien ||= [];
  buch.einstellungen.sport = { ...sportStandard(), ...(buch.einstellungen.sport || {}) };
  buch.einstellungen.stundenplan ||= { zuordnung: {}, letzterImport: '' };
  buch.einstellungen.stundenplan.zuordnung ||= {};
  for (const k of buch.klassen) pruefeKlasse(k);
  return buch;
}

/** Stufe-1-Name: prüft ein Notenbuch (Rückgabe wie pruefeBuch). */
export const pruefeDaten = pruefeBuch;

/** Kopiert eine Klasse: Kopfdaten, Einstellungen, Schülerliste; keine Noten, Fehlzeiten oder Dalton-Einträge. */
export function klasseKopieren(klasse, { listenMitnehmen = true } = {}) {
  const k = pruefeKlasse(JSON.parse(JSON.stringify(klasse)));
  k.id = neueId();
  k.kopf.klasse = `${k.kopf.klasse} (Kopie)`.trim();
  // Klassenarbeiten bleiben als leere Hüllen (Anzahl Aufgaben und Gewicht), ohne Datum, Punkte und Höchstpunkte.
  k.klassenarbeiten = klasse.klassenarbeiten.map((ka) => ({
    ...neueKlassenarbeit(ka.aufgaben.length),
    gewicht: ka.gewicht,
  }));
  k.sonstige = [];
  k.fehlzeiten = [];
  k.untis.importiert = [];
  k.dalton.aufgaben = [];
  k.listen = listenMitnehmen ? k.listen.map((l) => ({ ...l, id: neueId(), eintraege: {} })) : [];
  k.stichtag = '';
  // Sport: Reihen-Definitionen bleiben (Teile, Gewichte, Texte), Termine, Anwesenheit, Werte nicht.
  k.stundenplan = [];
  k.sport.termine = [];
  k.sport.anwesenheit = {};
  k.sport.mitarbeit = {};
  k.sport.merkmale = {};
  k.sport.endnoten = {};
  for (const r of k.sport.reihen) r.werte = {};
  // Neue Personen-IDs, damit sich Kopie und Original nie überschneiden; Fotos und Archivierung bleiben nicht erhalten.
  for (const s of k.schueler) {
    s.id = neueId();
    s.foto = null;
    s.fotoEinwilligung = null;
    s.archiviert = null;
  }
  return k;
}

export function anzeigename(s) {
  return [s.vorname, s.name].filter(Boolean).join(' ');
}

/** „Name, V.“ wie in der Korrekturliste. */
export function kurzname(s) {
  const v = s.vorname ? `${s.vorname.trim().charAt(0)}.` : '';
  return [s.name, v].filter(Boolean).join(', ');
}

/** Namenssortierung (deutsch): Name, dann Vorname; leere Zeilen ans Ende. */
export function sortiereSchueler(schueler) {
  const leer = (s) => !s.name && !s.vorname;
  return [...schueler].sort((a, b) => {
    if (leer(a) !== leer(b)) return leer(a) ? 1 : -1;
    return (
      (a.name || '').localeCompare(b.name || '', 'de') ||
      (a.vorname || '').localeCompare(b.vorname || '', 'de')
    );
  });
}

/** Nur Zeilen mit Name oder Vorname und nicht archiviert gelten als Schüler:innen in Eingaben und Auswertungen. */
export function aktiveSchueler(daten) {
  return daten.schueler.filter((s) => (s.name || s.vorname) && !s.archiviert);
}

export function archivierteSchueler(daten) {
  return daten.schueler.filter((s) => (s.name || s.vorname) && s.archiviert);
}

export function buchHatFotos(buch) {
  return buch.klassen.some((k) => k.schueler.some((s) => s.foto));
}

export function heuteIso(datum = new Date()) {
  const j = datum.getFullYear();
  const m = String(datum.getMonth() + 1).padStart(2, '0');
  const t = String(datum.getDate()).padStart(2, '0');
  return `${j}-${m}-${t}`;
}

export function datumDeutsch(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}

const rein = (t) => String(t || '').trim().replace(/[\\/:*?"<>|\s]+/g, '-');

export function dateiname(buch) {
  if (buch.klassen.length === 0) return `Notenbuch_${rein(buch.schuljahr).replace(/\//g, '-') || 'Schuljahr'}.noten`;
  const jahr = rein(buch.klassen[0]?.kopf.schuljahr).replace(/\//g, '-') || 'Schuljahr';
  if (buch.klassen.length > 1) return `Notenbuch_${jahr}.noten`;
  const klasse = rein(buch.klassen[0]?.kopf.klasse) || 'Klasse';
  return `${klasse}_${jahr}.noten`;
}

/** Kurzer Titel für Listen: „FIA 25 · LF 3 · 2025/26“ bzw. „3 Klassen · 2025/26“. */
export function buchTitel(buch) {
  const jahr = buch.klassen[0]?.kopf.schuljahr;
  if (buch.klassen.length > 1) return [`${buch.klassen.length} Klassen`, jahr].filter(Boolean).join(' · ');
  const k = buch.klassen[0];
  if (!k) return 'Leeres Notenbuch';
  return [k.kopf.klasse, k.kopf.lernfeldNr && `LF ${k.kopf.lernfeldNr}`, k.kopf.schuljahr].filter(Boolean).join(' · ') || 'Ohne Titel';
}
