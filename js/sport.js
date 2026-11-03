// Rechenkern Sport (SPEC Abschnitt 9). Reine Logik ohne Oberfläche, Einstellungen werden übergeben (9.6a).
import { sportStandard } from './modell.js';

const EPS = 1e-9;

/** Auf `stellen` Nachkommastellen abschneiden (nicht runden), wie in der Lernfeld-Notenliste; tolerant gegen Gleitkommafehler. */
export function abschneidenNote(x, stellen = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const f = 10 ** stellen;
  return Math.floor(x * f + 1e-7) / f;
}

// ---------- Anwesenheitszeichen (9.2) ----------

/** Wirkung eines Zeichens auf die Mitarbeit: zaehlt (Wert aus Mitarbeit), null (fest 0), offen, ohne (zählt nicht). */
export const ZEICHEN = {
  '.': { art: 'zaehlt', text: 'anwesend und aktiv' },
  V: { art: 'zaehlt', text: 'verspätet' },
  sps: { art: 'sps', text: 'Sportsachen vergessen' },
  k: { art: 'offen', text: 'anwesend, nicht aktiv, Grund offen' },
  ke: { art: 'ohne', text: 'nicht aktiv, entschuldigt' },
  ka: { art: 'ohne', text: 'nicht aktiv, mit Attest' },
  ku: { art: 'null', text: 'nicht aktiv, unentschuldigt' },
  '|': { art: 'offen', text: 'fehlt, Grund offen' },
  E: { art: 'ohne', text: 'fehlt entschuldigt' },
  A: { art: 'ohne', text: 'fehlt mit Attest' },
  B: { art: 'ohne', text: 'betrieblich befreit' },
  P: { art: 'ohne', text: 'privat befreit' },
  U: { art: 'null', text: 'fehlt unentschuldigt' },
};

/** Fehlt die Person laut Zeichen (für Prüfungstage)? 'entschuldigt', 'unentschuldigt', 'offen' oder null (anwesend/unbekannt). */
function fehlenArt(z, ein) {
  if (['E', 'A', 'B', 'P', 'ke', 'ka'].includes(z)) return 'entschuldigt';
  if (['U', 'ku'].includes(z)) return 'unentschuldigt';
  if (['|', 'k'].includes(z)) return ein.offenZaehltNull ? 'unentschuldigt' : 'offen';
  if (z === '') return 'unbekannt';
  return null;
}

export function einstellungenAus(buch) {
  return { ...sportStandard(), ...(buch?.einstellungen?.sport || {}) };
}

// ---------- Hilfen ----------

/** Rundet halbe Werte zur besseren Note: 2,5 → 2; 2,51 → 3. Begrenzt auf 1 bis 6. */
export function rundeNote(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  return Math.min(6, Math.max(1, Math.ceil(x - 0.5 - EPS)));
}

/** Punkte = 17 − 3 × Note, kaufmännisch gerundet, begrenzt (9.5). */
export function punkte(note, ein = sportStandard()) {
  if (note === null || note === undefined || Number.isNaN(note)) return null;
  const p = ein.punkte;
  const roh = p.basis - p.faktor * note;
  return Math.min(p.max, Math.max(p.min, Math.floor(roh + 0.5 + EPS)));
}

/** Note (ganz oder dezimal) für die Anzeige im Notensystem der Klasse. */
export function ausgabe(note, klasse, ein) {
  if (note === null || note === undefined) return '';
  if (klasse.sport.notensystem === 'punkte') return String(punkte(note, ein));
  return String(Math.round(note * 100) / 100).replace('.', ',');
}

function mittel(liste) {
  return liste.length ? liste.reduce((a, b) => a + b, 0) / liste.length : null;
}

function gewichtetesMittel(paare) {
  let z = 0;
  let n = 0;
  for (const [wert, g] of paare) {
    if (wert === null || wert === undefined) continue;
    z += wert * g;
    n += g;
  }
  return n > 0 ? z / n : null;
}

/** Termine in zeitlicher Reihenfolge (Datum, dann Reihenfolge der Liste). Ohne Datum zuletzt. */
export function termineGeordnet(klasse) {
  return klasse.sport.termine
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const da = a.t.datum || '9999';
      const db = b.t.datum || '9999';
      return da < db ? -1 : da > db ? 1 : a.i - b.i;
    })
    .map((x) => x.t);
}

export function istPruefungstag(termin, ein) {
  if (termin.pruefungstag) return true;
  const woerter = String(termin.vermerk || '').split(/[^A-Za-zÄÖÜäöüß0-9]+/).filter(Boolean);
  return woerter.some((w) => ein.pruefungstagKennzeichen.includes(w));
}

export function anwesenheitZeichen(klasse, terminId, schuelerId) {
  return klasse.sport.anwesenheit[terminId]?.[schuelerId]?.z || '';
}

/**
 * Zählt „sps“ je Person über alle Reihen und Termine eines Halbjahres.
 * Rückgabe: Map(terminId -> Nummer des sps, 1 = erstes Mal). Das erste Mal zählt wie anwesend, ab dem zweiten 0.
 */
export function spsNummern(klasse, schuelerId) {
  const zaehler = {};
  const ergebnis = new Map();
  for (const t of termineGeordnet(klasse)) {
    if (anwesenheitZeichen(klasse, t.id, schuelerId) !== 'sps') continue;
    const hj = t.halbjahr || 1;
    zaehler[hj] = (zaehler[hj] || 0) + 1;
    ergebnis.set(t.id, zaehler[hj]);
  }
  return ergebnis;
}

// ---------- Mitarbeit (9.3) ----------

/** Grundnote aus Ø Beteiligung nach der Tabelle der Einstellungen. */
export function grundnoteAusMittel(m, ein) {
  if (m === null || m === undefined) return null;
  const t = ein.mitarbeitsTabelle;
  for (let i = 0; i < t.length; i++) if (m >= t[i] - EPS) return i + 1;
  return 6;
}

/** Wirksamer Wert einer Termin-Zelle: {zaehlt, wert, grund} */
export function mitarbeitZelle(klasse, termin, schuelerId, ein, sps) {
  const z = anwesenheitZeichen(klasse, termin.id, schuelerId);
  if (z === '') return { zaehlt: false, wert: null, grund: 'leer' };
  const art = ZEICHEN[z]?.art;
  if (art === 'ohne' || !art) return { zaehlt: false, wert: null, grund: 'ohne' };
  if (art === 'null') return { zaehlt: true, wert: 0, grund: 'auto0' };
  if (art === 'offen') {
    return ein.offenZaehltNull ? { zaehlt: true, wert: 0, grund: 'auto0' } : { zaehlt: false, wert: null, grund: 'offen' };
  }
  if (art === 'sps' && (sps.get(termin.id) || 1) >= 2) return { zaehlt: true, wert: 0, grund: 'auto0' };
  // zählt: Wert aus der Mitarbeit (Abweichung) oder Standardwert
  const abw = klasse.sport.mitarbeit[termin.id]?.[schuelerId];
  const wert = typeof abw === 'number' ? abw : ein.standardwert;
  return { zaehlt: true, wert, grund: typeof abw === 'number' ? 'manuell' : 'standard' };
}

/** Mitarbeit einer Person in einer Reihe. */
export function mitarbeitReihe(klasse, reihe, schuelerId, ein) {
  const sps = spsNummern(klasse, schuelerId);
  const termine = termineGeordnet(klasse).filter((t) => t.reihe === reihe.id);
  const zaehlend = [];
  let offen = 0;
  let spsAnzahl = 0;
  const merkmalAnzahl = [0, 0, 0];
  for (const t of termine) {
    const z = anwesenheitZeichen(klasse, t.id, schuelerId);
    if (z === 'sps') spsAnzahl += 1;
    if (ZEICHEN[z]?.art === 'offen') offen += 1;
    const c = mitarbeitZelle(klasse, t, schuelerId, ein, sps);
    if (c.zaehlt) zaehlend.push({ terminId: t.id, wert: c.wert });
    // Häkchen aus Terminen mit sps oder ku/U zählen nicht
    const ok = z !== 'sps' && z !== 'ku' && z !== 'U';
    const haken = klasse.sport.merkmale[t.id]?.[schuelerId];
    if (ok && haken) haken.forEach((b, i) => { if (b) merkmalAnzahl[i] += 1; });
  }
  const n = zaehlend.length;
  const m = n >= ein.mindestTermine ? mittel(zaehlend.map((x) => x.wert)) : null;
  const grund = grundnoteAusMittel(m, ein);
  const gezeigt = merkmalAnzahl.map((a) => a >= 2);
  const anzahlGezeigt = gezeigt.filter(Boolean).length;
  const aufwertung = Math.min(1, anzahlGezeigt * ein.schritt);
  // Mit „Punkte“ darf die Note unter 1,0 sinken (bis 15 Punkte), sonst nie besser als 1,0
  const bestNote = klasse.sport.notensystem === 'punkte' ? (ein.punkte.basis - ein.punkte.max) / ein.punkte.faktor : 1;
  // Mitarbeitsnote auf 2 Stellen abschneiden (Regel der Nutzerin, wie im Lernfeld)
  const berechnet = grund === null ? null : abschneidenNote(Math.max(bestNote, grund - aufwertung), 2);
  const uebers = reihe.werte[schuelerId]?.mitarbeitNote;
  const ueberschrieben = uebers && typeof uebers.wert === 'number' ? uebers : null;
  return {
    termine: termine.length,
    zaehlend,
    n,
    mittel: m,
    grundnote: grund,
    merkmalAnzahl,
    gezeigt,
    aufwertung: grund === null ? 0 : aufwertung,
    berechnet,
    ueberschrieben,
    note: ueberschrieben ? ueberschrieben.wert : berechnet,
    offen,
    sps: spsAnzahl,
  };
}

// ---------- Prüfung (9.4) ----------

/** Rohwert eines Prüfungsteils: Summe der Einzelversuche, sonst direkt eingegebene Summe, sonst null. */
export function teilRohwert(werte, teil) {
  const v = werte?.versuche?.[teil.id];
  if (Array.isArray(v) && v.some((x) => typeof x === 'number')) return v.reduce((s, x) => s + (typeof x === 'number' ? x : 0), 0);
  const s = werte?.summen?.[teil.id];
  return typeof s === 'number' ? s : null;
}

export function teilHoechstwert(teil) {
  return typeof teil.hoechst === 'number' ? teil.hoechst : (teil.versuche || 0) * 3;
}

/** Prüfungsnote (ganz) aus Prozent nach dem gemeinsamen Schlüssel. */
export function pruefungsnoteAusProzent(p, ein) {
  if (p === null || p === undefined) return null;
  const t = ein.pruefschluessel;
  for (let i = 0; i < t.length; i++) if (p >= t[i] - EPS) return i + 1;
  return 6;
}

/** Prozent über die Teile, in denen ein Wert steht: Σ(g × roh) / Σ(g × höchst). Nicht geprüfte Teile wirken nicht als 0. */
export function pruefungsprozent(teile, werte) {
  let z = 0;
  let n = 0;
  let geprueft = 0;
  for (const t of teile) {
    const roh = teilRohwert(werte, t);
    if (roh === null) continue;
    geprueft += 1;
    z += (t.gewicht ?? 1) * roh;
    n += (t.gewicht ?? 1) * teilHoechstwert(t);
  }
  return { prozent: n > 0 ? (z / n) * 100 : null, geprueft, teile: teile.length };
}

/**
 * Prüfung einer Person in einer Reihe.
 * status: 'normal' | 'ersatz' | 'auto6' (unentschuldigt an allen Prüfungstagen) | 'nachpruefung-offen' | 'offen' | 'leer'
 */
export function pruefungReihe(klasse, reihe, schuelerId, ein) {
  const werte = reihe.werte[schuelerId] || {};
  const tage = klasse.sport.termine.filter((t) => t.reihe === reihe.id && istPruefungstag(t, ein));
  const eigene = pruefungsprozent(reihe.teile, werte);
  const hatErsatz = !!werte.ersatz && (werte.ersatz.aktiv !== false);
  if (hatErsatz) {
    const e = werte.ersatz;
    const pz = pruefungsprozent(reihe.ersatzTeile, e);
    let note = null;
    if (typeof e.note === 'number') note = e.note;
    else if (pz.prozent !== null) note = pruefungsnoteAusProzent(pz.prozent, ein);
    return { status: 'ersatz', note, prozent: pz.prozent, geprueft: pz.geprueft, teile: reihe.ersatzTeile.length, ersatzOhneBeschreibung: !(e.beschreibung || '').trim(), tage: tage.length };
  }
  if (eigene.prozent !== null) {
    return { status: 'normal', note: pruefungsnoteAusProzent(eigene.prozent, ein), prozent: eigene.prozent, geprueft: eigene.geprueft, teile: eigene.teile, tage: tage.length };
  }
  if (tage.length === 0) return { status: 'leer', note: null, prozent: null, geprueft: 0, teile: reihe.teile.length, tage: 0 };
  // Keine Werte, aber es gab Prüfungstage
  const arten = tage.map((t) => fehlenArt(anwesenheitZeichen(klasse, t.id, schuelerId), ein));
  const fehltAlle = arten.every((a) => a !== null && a !== 'unbekannt');
  if (fehltAlle) {
    if (arten.some((a) => a === 'entschuldigt')) return { status: 'nachpruefung-offen', note: null, prozent: null, geprueft: 0, teile: reihe.teile.length, tage: tage.length };
    if (arten.every((a) => a === 'unentschuldigt')) return { status: 'auto6', note: 6, prozent: null, geprueft: 0, teile: reihe.teile.length, tage: tage.length };
    return { status: 'offen', note: null, prozent: null, geprueft: 0, teile: reihe.teile.length, tage: tage.length };
  }
  return { status: 'offen', note: null, prozent: null, geprueft: 0, teile: reihe.teile.length, tage: tage.length };
}

// ---------- Reihenwert, Reihennote (9.5) ----------

export function reihenErgebnis(klasse, reihe, schuelerId, ein) {
  const werte = reihe.werte[schuelerId] || {};
  const pr = pruefungReihe(klasse, reihe, schuelerId, ein);
  const mi = mitarbeitReihe(klasse, reihe, schuelerId, ein);
  const g = reihe.gewichte;
  const verhalten = typeof werte.verhalten === 'number' ? werte.verhalten : null;
  const direkte = reihe.direkte.map((d) => ({ id: d.id, name: d.name, gewicht: d.gewicht ?? 1, note: typeof werte.direkt?.[d.id] === 'number' ? werte.direkt[d.id] : null }));
  const paare = [
    [pr.note, g.pruefung ?? 0],
    [mi.note, g.mitarbeit ?? 0],
    [verhalten, g.verhalten ?? 0],
    ...direkte.map((d) => [d.note, d.gewicht]),
  ];
  // Reihenwert auf 2 Stellen abschneiden; Ø über die Reihen bleibt ungekürzt
  const wert = abschneidenNote(gewichtetesMittel(paare), 2);
  return { pruefung: pr, mitarbeit: mi, verhalten, direkte, wert, note: rundeNote(wert), bemerkung: werte.bemerkung || '' };
}

/** Warnhinweis, wenn neben der Mitarbeit eine weitere beteiligungsnahe Teilleistung gewichtet ist. */
export function doppelBewertungHinweis(reihe) {
  const beteiligungsnah = reihe.direkte.some((d) => (d.gewicht ?? 1) > 0 && /spiel|beteilig|engagement|mitarbeit/i.test(d.name || ''));
  return beteiligungsnah && (reihe.gewichte.mitarbeit ?? 0) > 0 ? 'Achtung, Engagement wird evtl. doppelt bewertet.' : '';
}

// ---------- Gesamtnote (9.5) ----------

function reihenImZeitraum(klasse, halbjahr) {
  if (klasse.sport.zeitraum !== 'jahr' || !halbjahr || halbjahr === 'jahr') return klasse.sport.reihen;
  return klasse.sport.reihen.filter((r) => (r.halbjahr || 1) === halbjahr);
}

/** Ø Wert, Ø Note und Reihenergebnisse einer Person. `halbjahr`: 1, 2 oder 'jahr' (nur bei Zeitraum „ganzes Schuljahr“). */
export function gesamtSport(klasse, schuelerId, ein, { halbjahr = 'jahr' } = {}) {
  if (klasse.sport.zeitraum === 'jahr' && (halbjahr === 'jahr' || !halbjahr)) {
    const h1 = gesamtSport(klasse, schuelerId, ein, { halbjahr: 1 });
    const h2 = gesamtSport(klasse, schuelerId, ein, { halbjahr: 2 });
    const w = mittel([h1.oWert, h2.oWert].filter((x) => x !== null));
    const n = mittel([h1.oNote, h2.oNote].filter((x) => x !== null));
    return { reihen: [...h1.reihen, ...h2.reihen], oWert: w, oNote: n, halbjahre: [h1, h2], sps: h1.sps + h2.sps, offen: h1.offen + h2.offen };
  }
  const reihen = reihenImZeitraum(klasse, halbjahr).map((r) => ({ reihe: r, erg: reihenErgebnis(klasse, r, schuelerId, ein) }));
  const oWert = gewichtetesMittel(reihen.map(({ reihe, erg }) => [erg.wert, reihe.gewichtReihe ?? 1]));
  const oNote = gewichtetesMittel(reihen.map(({ reihe, erg }) => [erg.note, reihe.gewichtReihe ?? 1]));
  return {
    reihen,
    oWert,
    oNote,
    sps: reihen.reduce((s, { erg }) => s + erg.mitarbeit.sps, 0),
    offen: reihen.reduce((s, { erg }) => s + erg.mitarbeit.offen, 0),
  };
}

/**
 * Endnoten der ganzen Klasse. Variante 'besser': die Variante (Ø Wert oder Ø Note) mit dem kleineren Klassendurchschnitt
 * der gerundeten Endnoten (bei Gleichstand Ø Wert). Festgesetzte Endnoten haben Vorrang.
 */
export function endnotenKlasse(klasse, personen, ein, optionen = {}) {
  const gesamt = new Map(personen.map((p) => [p.id, gesamtSport(klasse, p.id, ein, optionen)]));
  const ausWert = new Map();
  const ausNote = new Map();
  for (const [id, g] of gesamt) {
    ausWert.set(id, rundeNote(g.oWert));
    ausNote.set(id, rundeNote(g.oNote));
  }
  const dschn = (m) => mittel([...m.values()].filter((x) => x !== null));
  let variante = klasse.sport.endnoteVariante;
  const dW = dschn(ausWert);
  const dN = dschn(ausNote);
  if (variante === 'besser') variante = dN !== null && dW !== null && dN < dW - EPS ? 'note' : 'wert';
  const ergebnis = new Map();
  for (const p of personen) {
    const berechnet = (variante === 'note' ? ausNote : ausWert).get(p.id);
    const fest = klasse.sport.endnoten[p.id];
    const festgesetzt = fest && typeof fest.wert === 'number' ? fest : null;
    ergebnis.set(p.id, { gesamt: gesamt.get(p.id), berechnet, festgesetzt, endnote: festgesetzt ? festgesetzt.wert : berechnet });
  }
  return { ergebnis, variante, durchschnittWert: dW, durchschnittNote: dN };
}

// ---------- Änderungen der Einstellungen (9.6a) ----------

/** Wie viele Reihen-Prüfungsnoten und Endnoten würden sich ändern, wenn `neu` statt `alt` gälte? */
export function aenderungenZaehlen(buch, alt, neu) {
  let geaendert = 0;
  let mitWerten = 0;
  for (const k of buch.klassen) {
    if (k.fachtyp !== 'sport') continue;
    const personen = k.schueler.filter((s) => (s.name || s.vorname) && !s.archiviert);
    for (const r of k.sport.reihen) {
      for (const p of personen) {
        const hat = r.teile.some((t) => teilRohwert(r.werte[p.id], t) !== null);
        if (hat) mitWerten += 1;
        const a = reihenErgebnis(k, r, p.id, alt).note;
        const b = reihenErgebnis(k, r, p.id, neu).note;
        if (a !== b) geaendert += 1;
      }
    }
  }
  return { geaendert, mitWerten };
}
