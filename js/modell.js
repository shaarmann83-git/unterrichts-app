// Datenmodell einer Notendatei (eine Klasse in einem Lernfeld) und einfache Änderungen daran.

export const FORMAT_VERSION = 1;
export const STANDARD_SCHUELER = 32;
export const STANDARD_KLASSENARBEITEN = 4;
export const STANDARD_AUFGABEN = 10;

export function neueId() {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function neueKlassenarbeit(aufgabenAnzahl = STANDARD_AUFGABEN) {
  return {
    id: neueId(),
    datum: '',
    schwerpunkte: '',
    gewicht: 1,
    aufgaben: Array.from({ length: aufgabenAnzahl }, () => null),
    ergebnisse: {},
  };
}

export function neuerSchueler() {
  return { id: neueId(), name: '', vorname: '', geschlecht: '', geburtstag: '', volljaehrig: false };
}

export function neuerTermin(datum, stichwort = '') {
  return { id: neueId(), datum, stichwort, gewicht: 1, eintraege: {} };
}

/** Neue, leere Notendatei. */
export function neueDaten({ klasse = '', lernfeldNr = '', lernfeldBez = '', schuljahr = '' } = {}) {
  return {
    format: 'noten',
    version: FORMAT_VERSION,
    dokumentId: neueId(),
    gespeichertAm: '',
    kopf: { klasse, lernfeldNr, lernfeldBez, schuljahr },
    gewichtSchriftlich: 50,
    schueler: Array.from({ length: STANDARD_SCHUELER }, neuerSchueler),
    klassenarbeiten: Array.from({ length: STANDARD_KLASSENARBEITEN }, () => neueKlassenarbeit()),
    sonstige: [],
  };
}

/** Prüft und ergänzt eingelesene Daten. Wirft einen verständlichen Fehler bei falschem Format. */
export function pruefeDaten(daten) {
  if (!daten || typeof daten !== 'object' || daten.format !== 'noten') {
    throw new Error('Das ist keine Notendatei dieser App.');
  }
  if (daten.version > FORMAT_VERSION) {
    throw new Error('Diese Notendatei stammt aus einer neueren Version der App.');
  }
  daten.dokumentId ||= neueId();
  daten.gespeichertAm ||= '';
  daten.kopf ||= {};
  for (const k of ['klasse', 'lernfeldNr', 'lernfeldBez', 'schuljahr']) daten.kopf[k] ??= '';
  daten.gewichtSchriftlich ??= 50;
  daten.schueler ||= [];
  daten.klassenarbeiten ||= [];
  daten.sonstige ||= [];
  for (const ka of daten.klassenarbeiten) {
    ka.id ||= neueId();
    ka.gewicht ??= 1;
    ka.aufgaben ||= [];
    ka.ergebnisse ||= {};
  }
  for (const t of daten.sonstige) {
    t.id ||= neueId();
    t.gewicht ??= 1;
    t.eintraege ||= {};
  }
  return daten;
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

/** Nur Zeilen mit Name oder Vorname gelten als Schüler:innen in Auswertungen. */
export function aktiveSchueler(daten) {
  return daten.schueler.filter((s) => s.name || s.vorname);
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

export function dateiname(daten) {
  const rein = (t) => String(t || '').trim().replace(/[\\/:*?"<>|\s]+/g, '-');
  const klasse = rein(daten.kopf.klasse) || 'Klasse';
  const jahr = rein(daten.kopf.schuljahr).replace(/\//g, '-') || 'Schuljahr';
  return `${klasse}_${jahr}.noten`;
}
