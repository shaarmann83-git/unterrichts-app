// Rechenkern: nur Mathematik, keine Oberfläche. Regeln laut docs/SPEC.md Abschnitt 4.
import { IHK_EINTRAEGE } from './ihk-schema.js';
import { daltonProzent } from './dalton.js';

const EPS = 1e-9;

export const NOTEN_WORTE = {
  1: 'sehr gut',
  2: 'gut',
  3: 'befriedigend',
  4: 'ausreichend',
  5: 'mangelhaft',
  6: 'ungenügend',
};

/** Abschneiden (nicht Runden) auf `stellen` Nachkommastellen, tolerant gegen Gleitkommafehler. */
export function abschneiden(wert, stellen) {
  if (wert === null || wert === undefined || Number.isNaN(wert)) return null;
  const f = 10 ** stellen;
  return Math.floor(wert * f + EPS) / f;
}

/** Kaufmännisch runden auf `stellen` Nachkommastellen (nur für Anzeige und Noten-Rundung). */
export function runden(wert, stellen) {
  if (wert === null || wert === undefined || Number.isNaN(wert)) return null;
  const f = 10 ** stellen;
  return Math.round(wert * f + (wert >= 0 ? EPS : -EPS)) / f;
}

/** Prozent einer Klassenarbeit: trunc(summe * 100 / gesamt, 1). */
export function prozentKA(summe, gesamt) {
  if (summe === null || summe === undefined) return null;
  if (!(gesamt > 0)) return null;
  return abschneiden((summe * 100) / gesamt, 1);
}

/** Untergrenzen in Prozent für die Noten 1 bis 5; darunter 6. Entspricht der Excel-Vorlage (SPEC 4). */
export const NOTENGRENZEN_STANDARD = [91.5, 80.5, 66.5, 49.5, 29.5];

/**
 * Untergrenzen in Prozent für 15 bis 1 Notenpunkte; darunter 0 Punkte.
 * Voreinstellung: Bewertungsschema BG 11, 12 und 13 der BBS Lingen Wirtschaft (Stand 2017).
 */
export const PUNKTEGRENZEN_STANDARD = [95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 33, 27, 20];

/**
 * Ordnet einen Prozentwert über absteigende Untergrenzen zu.
 * Der erste Treffer gewinnt; liegt der Wert unter allen Grenzen, gilt `rest`.
 */
function ausGrenzen(p, grenzen, werte, rest) {
  if (p === null || p === undefined || Number.isNaN(p)) return null;
  const q = p + EPS;
  for (let i = 0; i < grenzen.length; i++) if (q >= grenzen[i]) return werte[i];
  return rest;
}

/** Note 1..6 aus Prozent. Ohne eigene Grenzen gilt der Schlüssel der Excel-Vorlage. */
export function noteAusProzent(p, grenzen = NOTENGRENZEN_STANDARD) {
  return ausGrenzen(p, grenzen, [1, 2, 3, 4, 5], 6);
}

/** Notenpunkte 15..0 aus Prozent. Ohne eigene Grenzen gilt das Schema der BBS Lingen. */
export function punkteAusProzent(p, grenzen = PUNKTEGRENZEN_STANDARD) {
  return ausGrenzen(p, grenzen, [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 0);
}

// IHK-Schema: Note (in Zehnteln) -> Mittelwert aller zugeordneten Prozentwerte (wie AVERAGEIF).
const IHK_MITTEL = (() => {
  const summen = new Map();
  for (const e of IHK_EINTRAEGE) {
    const k = Math.round(e.note * 10);
    const s = summen.get(k) || { summe: 0, anzahl: 0 };
    s.summe += e.prozent;
    s.anzahl += 1;
    summen.set(k, s);
  }
  const mittel = new Map();
  for (const [k, s] of summen) mittel.set(k, s.summe / s.anzahl);
  return mittel;
})();

/** Dezimalnote (1,0 bis 6,0) -> Prozent laut IHK-Schema; null, wenn keine Note oder außerhalb. */
export function ihkProzent(note) {
  if (note === null || note === undefined || Number.isNaN(note)) return null;
  const k = Math.round(runden(note, 1) * 10);
  return IHK_MITTEL.has(k) ? IHK_MITTEL.get(k) : null;
}

/**
 * Mittlerer Prozentwert eines Punktwerts 0..15, also die Umkehrung des Punkteschlüssels.
 * Gebildet wie beim IHK-Schema: Mittelwert aller ganzen Prozentwerte des Intervalls.
 * Beispiel BBS Lingen: 11 Punkte gilt von 75 bis 79 %, also 77 %.
 */
export function prozentAusPunkten(punkte, grenzen = PUNKTEGRENZEN_STANDARD) {
  if (punkte === null || punkte === undefined || Number.isNaN(punkte)) return null;
  const p = Math.round(punkte);
  if (p < 0 || p > 15) return null;
  const i = 15 - p; // 15 Punkte -> Index 0
  const unten = p === 0 ? 0 : grenzen[i];
  const oben = p === 15 ? 100 : grenzen[i - 1] - 1;
  return (unten + oben) / 2;
}

/** Notensystem einer Klasse: 'punkte' = 0 bis 15, sonst Noten 1 bis 6. */
export const istPunktsystem = (klasse) => klasse?.notensystem === 'punkte';

/** Bewertung aus Prozent, je nach Notensystem der Klasse: Note 1..6 oder Notenpunkte 0..15. */
export function bewertungAusProzent(prozent, klasse) {
  return istPunktsystem(klasse)
    ? punkteAusProzent(prozent, klasse.punktegrenzen)
    : noteAusProzent(prozent, klasse?.notengrenzen);
}

/** Bewertung als Text, z. B. „3 (befriedigend)“ oder „11 Punkte“. Leer, wenn nichts vorliegt. */
export function bewertungText(wert, klasse) {
  if (wert === null || wert === undefined) return '';
  return istPunktsystem(klasse) ? `${String(wert).padStart(2, '0')} Punkte` : `${wert} (${NOTEN_WORTE[wert]})`;
}

/** Prozent einer sonstigen Leistung wie in der Gesamtübersicht: IHK-Prozent, auf 2 Stellen abgeschnitten. */
export function prozentSL(note) {
  const p = ihkProzent(note);
  return p === null ? null : abschneiden(p, 2);
}

/** Prozent einer sonstigen Leistung je nach Notensystem der Klasse. */
export function prozentSLKlasse(wert, klasse) {
  if (!istPunktsystem(klasse)) return prozentSL(wert);
  const p = prozentAusPunkten(wert, klasse.punktegrenzen);
  return p === null ? null : abschneiden(p, 2);
}

/** Gewichteter Mittelwert; Einträge ohne Wert (null) zählen weder im Zähler noch im Nenner. */
export function gewichteterMittelwert(werte, gewichte) {
  let zaehler = 0;
  let nenner = 0;
  let anzahl = 0;
  for (let i = 0; i < werte.length; i++) {
    const w = werte[i];
    if (w === null || w === undefined || Number.isNaN(w)) continue;
    const g = gewichte[i] ?? 1;
    zaehler += w * g;
    nenner += g;
    anzahl += 1;
  }
  if (anzahl === 0 || nenner === 0) return { mittel: null, anzahl };
  return { mittel: zaehler / nenner, anzahl };
}

/** Gesamtprozent und Gesamtnote aus Ø KA und Ø sL; nur, wenn beide vorhanden sind. */
export function gesamtErgebnis(oKA, oSL, gewichtSchriftlich, klasse = null) {
  if (oKA === null || oKA === undefined || oSL === null || oSL === undefined) {
    return { prozent: null, note: null };
  }
  const gs = gewichtSchriftlich / 100;
  const prozent = oKA * gs + oSL * (1 - gs);
  return { prozent, note: bewertungAusProzent(prozent, klasse) };
}

export function gesamtpunkte(ka) {
  return ka.aufgaben.reduce((s, a) => s + (Number(a) || 0), 0);
}

/** Ergebnis einer Person in einer Klassenarbeit. */
export function ergebnisKA(ka, schuelerId, klasse = null) {
  const erg = ka.ergebnisse[schuelerId];
  const leer = { summe: null, prozent: null, note: null, attest: false };
  const eingetragen = (erg?.punkte || []).filter((p) => p !== null && p !== undefined && p !== '');
  // „gefehlt mit Attest, Nachschreiben offen“ wirkt wie das Feld Attest, solange keine Punkte da sind.
  const attestOffen = ka.teilnahme?.[schuelerId]?.status === 'attest-offen';
  if (erg?.attest || (attestOffen && eingetragen.length === 0)) return { ...leer, attest: true };
  if (!erg || eingetragen.length === 0) return leer;
  const summe = eingetragen.reduce((s, p) => s + Number(p), 0);
  const prozent = prozentKA(summe, gesamtpunkte(ka));
  return { summe, prozent, note: bewertungAusProzent(prozent, klasse), attest: false };
}

/** Notenspiegel: Anzahl je Note 1..6 und Durchschnitt. Attest-Personen zählen nicht. */
export function notenspiegel(ka, schueler, klasse = null) {
  const punkte = istPunktsystem(klasse);
  // Noten: Stufen 1..6. Punkte: Stufen 15..0.
  const stufen = punkte ? [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] : [1, 2, 3, 4, 5, 6];
  const anzahl = stufen.map(() => 0);
  for (const s of schueler) {
    const e = ergebnisKA(ka, s.id, klasse);
    const i = stufen.indexOf(e.note);
    if (e.note !== null && i >= 0) anzahl[i] += 1;
  }
  const n = anzahl.reduce((a, b) => a + b, 0);
  const durchschnitt = n === 0 ? null : anzahl.reduce((su, a, i) => su + a * stufen[i], 0) / n;
  return { stufen, anzahl, gesamt: n, durchschnitt, punkte };
}

/** Gilt ein Datum beim Zwischenstand? Ohne Stichtag oder ohne Datum: ja (SPEC 8.11). */
export function imStichtag(datum, stichtag) {
  return !stichtag || !datum || datum <= stichtag;
}

/** Alles zu einer Person für die Gesamtübersicht (Ganzjahr, oder Zwischenstand mit `stichtag`). */
export function gesamtPerson(daten, schuelerId, { stichtag = daten.stichtag || '' } = {}) {
  const kaProzente = daten.klassenarbeiten.map((ka) => ergebnisKA(ka, schuelerId, daten).prozent);
  const kaGewertet = daten.klassenarbeiten.map((ka, i) => (imStichtag(ka.datum, stichtag) ? kaProzente[i] : null));
  const kaGewichte = daten.klassenarbeiten.map((ka) => ka.gewicht ?? 1);
  const slNoten = daten.sonstige.map((t) => {
    const n = t.eintraege[schuelerId]?.note;
    return n === undefined || n === '' ? null : n;
  });
  const slProzente = slNoten.map((n) => (n === null ? null : prozentSLKlasse(n, daten)));
  const slGewertet = slProzente.map((p, i) => (imStichtag(daten.sonstige[i].datum, stichtag) ? p : null));
  const slGewichte = daten.sonstige.map((t) => t.gewicht ?? 1);
  const ka = gewichteterMittelwert(kaGewertet, kaGewichte);
  const slNormal = gewichteterMittelwert(slGewertet, slGewichte);

  // Dalton (nur Einrechnung, wenn eingeschaltet): SPEC 8.3
  const dal = daten.dalton;
  const daltonAktiv = !!dal && dal.modus !== 'aus';
  const daltonAufgaben = daltonAktiv ? dal.aufgaben : [];
  const daltonProzente = daltonAufgaben.map((a) => daltonProzent(a.eintraege[schuelerId], dal.zuordnung));
  const daltonGewertet = daltonProzente.map((p, i) =>
    imStichtag(daltonAufgaben[i].abgabe || daltonAufgaben[i].ausgabe, stichtag) ? p : null,
  );
  const daltonMittel = gewichteterMittelwert(daltonGewertet, daltonAufgaben.map((a) => a.gewicht ?? 1));
  let oSL = slNormal.mittel;
  if (daltonAktiv && dal.modus === 'einrechnen') {
    const d = (dal.anteil ?? 10) / 100;
    if (slNormal.mittel !== null && daltonMittel.mittel !== null) {
      oSL = slNormal.mittel * (1 - d) + daltonMittel.mittel * d;
    } else if (slNormal.mittel === null) {
      oSL = daltonMittel.mittel;
    }
  }
  const gesamt = gesamtErgebnis(ka.mittel, oSL, daten.gewichtSchriftlich, daten);
  return {
    kaProzente,
    oKA: ka.mittel,
    anzahlKA: ka.anzahl,
    slNoten,
    slProzente,
    anzahlSL: slNormal.anzahl,
    oSLNormal: slNormal.mittel,
    daltonProzente,
    oDalton: daltonMittel.mittel,
    anzahlDalton: daltonMittel.anzahl,
    oSL,
    gesamtProzent: gesamt.prozent,
    gesamtNote: gesamt.note,
    stichtag,
  };
}

/** Volljährig zum Stichtag `heute` (Date) aus ISO-Geburtstag (JJJJ-MM-TT); null ohne gültigen Geburtstag. */
export function istVolljaehrig(geburtstagIso, heute = new Date()) {
  if (!geburtstagIso || !/^\d{4}-\d{2}-\d{2}$/.test(geburtstagIso)) return null;
  const [j, m, t] = geburtstagIso.split('-').map(Number);
  const achtzehn = new Date(j + 18, m - 1, t);
  if (Number.isNaN(achtzehn.getTime())) return null;
  const h = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate());
  return h >= achtzehn;
}

/** Deutsche Zahlendarstellung (Komma). Rundet nur für die Anzeige. */
export function formatZahl(wert, stellen = 1) {
  if (wert === null || wert === undefined || Number.isNaN(wert)) return '';
  return runden(wert, stellen).toFixed(stellen).replace('.', ',');
}

/** Wie formatZahl, aber ohne überflüssige Nullen am Ende (12,5 statt 12,50; 45 statt 45,00). */
export function formatKurz(wert, maxStellen = 2) {
  const t = formatZahl(wert, maxStellen);
  return t.includes(',') ? t.replace(/0+$/, '').replace(/,$/, '') : t;
}

/** Eingabe wie „3,5“ oder „3.5“ -> Zahl; leer -> null; ungültig -> NaN. */
export function zahlLesen(text) {
  if (text === null || text === undefined) return null;
  const t = String(text).trim().replace(',', '.');
  if (t === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}
