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
    schwerpunkte: '',
    gewicht: 1,
    aufgaben: Array.from({ length: aufgabenAnzahl }, () => null),
    ergebnisse: {},
    teilnahme: {},
  };
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
export function neueKlasse({ klasse = '', lernfeldNr = '', lernfeldBez = '', schuljahr = '' } = {}) {
  return {
    id: neueId(),
    kopf: { klasse, lernfeldNr, lernfeldBez, schuljahr },
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
  };
}

/** Frühere Bezeichnung aus Stufe 1: eine „Datenmenge“ ist jetzt eine Klasse. */
export const neueDaten = neueKlasse;

/** Neues, leeres Notenbuch (optional mit einer ersten Klasse). */
export function neuesBuch(ersteKlasse = null) {
  return {
    format: 'noten',
    version: FORMAT_VERSION,
    dokumentId: neueId(),
    gespeichertAm: '',
    einstellungen: { untisOrdnerAutomatisch: false },
    klassen: ersteKlasse ? [ersteKlasse] : [],
  };
}

/** Ergänzt fehlende Felder einer Klasse. */
export function pruefeKlasse(k) {
  k.id ||= neueId();
  k.kopf ||= {};
  for (const f of ['klasse', 'lernfeldNr', 'lernfeldBez', 'schuljahr']) k.kopf[f] ??= '';
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
    ka.aufgaben ||= [];
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
