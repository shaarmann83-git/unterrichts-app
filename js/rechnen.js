// Rechenkern: nur Mathematik, keine Oberfläche. Regeln laut docs/SPEC.md Abschnitt 4.
import { IHK_EINTRAEGE } from './ihk-schema.js';

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

/** Note 1..6 aus Prozent nach den Notengrenzen der SPEC. */
export function noteAusProzent(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return null;
  const q = p + EPS;
  if (q >= 91.5) return 1;
  if (q >= 80.5) return 2;
  if (q >= 66.5) return 3;
  if (q >= 49.5) return 4;
  if (q >= 29.5) return 5;
  return 6;
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

/** Prozent einer sonstigen Leistung wie in der Gesamtübersicht: IHK-Prozent, auf 2 Stellen abgeschnitten. */
export function prozentSL(note) {
  const p = ihkProzent(note);
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
export function gesamtErgebnis(oKA, oSL, gewichtSchriftlich) {
  if (oKA === null || oKA === undefined || oSL === null || oSL === undefined) {
    return { prozent: null, note: null };
  }
  const gs = gewichtSchriftlich / 100;
  const prozent = oKA * gs + oSL * (1 - gs);
  return { prozent, note: noteAusProzent(prozent) };
}

export function gesamtpunkte(ka) {
  return ka.aufgaben.reduce((s, a) => s + (Number(a) || 0), 0);
}

/** Ergebnis einer Person in einer Klassenarbeit. */
export function ergebnisKA(ka, schuelerId) {
  const erg = ka.ergebnisse[schuelerId];
  const leer = { summe: null, prozent: null, note: null, attest: false };
  if (!erg) return leer;
  if (erg.attest) return { ...leer, attest: true };
  const eingetragen = (erg.punkte || []).filter((p) => p !== null && p !== undefined && p !== '');
  if (eingetragen.length === 0) return leer;
  const summe = eingetragen.reduce((s, p) => s + Number(p), 0);
  const prozent = prozentKA(summe, gesamtpunkte(ka));
  return { summe, prozent, note: noteAusProzent(prozent), attest: false };
}

/** Notenspiegel: Anzahl je Note 1..6 und Durchschnitt. Attest-Personen zählen nicht. */
export function notenspiegel(ka, schueler) {
  const anzahl = [0, 0, 0, 0, 0, 0];
  for (const s of schueler) {
    const e = ergebnisKA(ka, s.id);
    if (e.note !== null) anzahl[e.note - 1] += 1;
  }
  const n = anzahl.reduce((a, b) => a + b, 0);
  const durchschnitt = n === 0 ? null : anzahl.reduce((s, a, i) => s + a * (i + 1), 0) / n;
  return { anzahl, gesamt: n, durchschnitt };
}

/** Alles zu einer Person für die Gesamtübersicht. */
export function gesamtPerson(daten, schuelerId) {
  const kaProzente = daten.klassenarbeiten.map((ka) => ergebnisKA(ka, schuelerId).prozent);
  const kaGewichte = daten.klassenarbeiten.map((ka) => ka.gewicht ?? 1);
  const slNoten = daten.sonstige.map((t) => {
    const n = t.eintraege[schuelerId]?.note;
    return n === undefined || n === '' ? null : n;
  });
  const slProzente = slNoten.map((n) => (n === null ? null : prozentSL(n)));
  const slGewichte = daten.sonstige.map((t) => t.gewicht ?? 1);
  const ka = gewichteterMittelwert(kaProzente, kaGewichte);
  const sl = gewichteterMittelwert(slProzente, slGewichte);
  const gesamt = gesamtErgebnis(ka.mittel, sl.mittel, daten.gewichtSchriftlich);
  return {
    kaProzente,
    oKA: ka.mittel,
    anzahlKA: ka.anzahl,
    slNoten,
    slProzente,
    anzahlSL: sl.anzahl,
    oSL: sl.mittel,
    gesamtProzent: gesamt.prozent,
    gesamtNote: gesamt.note,
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
