// Stundenplan über den Importzeitraum hinaus fortschreiben (SPEC 12.5).
// Untis liefert nur 1 Woche zurück und 12 Wochen voraus. Aus dem erkennbaren Wochenrhythmus je Klasse werden die übrigen
// Unterrichtstage des Schuljahres ergänzt, ohne Ferien und Feiertage (Niedersachsen). Echte Untis-Termine haben immer Vorrang.
import { ortszeitZuMs, STANDARD_ZEITZONE } from './ical.js';
import { neueId } from './modell.js';
import { terminHatEintraege, reiheUebernehmen } from './stundenplan.js';

/**
 * Schuljahre Niedersachsen. Quelle: Ferienübersicht des Niedersächsischen Kultusministeriums,
 * abgeglichen mit kalenderpedia.de und schulferien.eu (Stand 11/2026). Einzelne Tage (Brückentage) als von = bis.
 * Der Unterrichtsbeginn ist der Tag nach den Sommerferien, das Ende der Tag vor den nächsten Sommerferien.
 */
export const SCHULJAHRE_NI = {
  '2026/27': {
    beginn: '2026-08-13',
    ende: '2027-07-07',
    ferien: [
      ['2026-10-12', '2026-10-24', 'Herbstferien'],
      ['2026-12-23', '2027-01-09', 'Weihnachtsferien'],
      ['2027-02-01', '2027-02-02', 'Halbjahresferien'],
      ['2027-03-22', '2027-04-03', 'Osterferien'],
      ['2027-05-07', '2027-05-07', 'Brückentag Himmelfahrt'],
      ['2027-05-18', '2027-05-18', 'Brückentag Pfingsten'],
    ],
  },
  '2027/28': {
    beginn: '2027-08-19',
    ende: '2028-07-19',
    ferien: [
      ['2027-10-16', '2027-10-30', 'Herbstferien'],
      ['2027-12-23', '2028-01-08', 'Weihnachtsferien'],
      ['2028-01-31', '2028-02-01', 'Halbjahresferien'],
      ['2028-04-10', '2028-04-22', 'Osterferien'],
      ['2028-05-26', '2028-05-26', 'Brückentag Himmelfahrt'],
      ['2028-06-06', '2028-06-06', 'Brückentag Pfingsten'],
    ],
  },
};

const TAG_MS = 86400000;
const tageSeit = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / TAG_MS);
const isoVon = (tage) => new Date(tage * TAG_MS).toISOString().slice(0, 10);
/** 0 = Montag … 6 = Sonntag */
const wochentagVon = (iso) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
/** Laufende Nummer der Kalenderwoche (Montag-Start), nur zum Vergleichen. */
const wocheVon = (iso) => Math.floor((tageSeit(iso) + 3) / 7);

function ostern(jahr) {
  // Gaußsche Osterformel
  const a = jahr % 19, b = Math.floor(jahr / 100), c = jahr % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const monat = Math.floor((hh + l - 7 * m + 114) / 31), tag = ((hh + l - 7 * m + 114) % 31) + 1;
  return tageSeit(`${jahr}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`);
}

/** Gesetzliche Feiertage in Niedersachsen (inkl. Reformationstag): Map von ISO-Datum auf Name. */
export function feiertageNI(jahr) {
  const o = ostern(jahr);
  return new Map([
    [`${jahr}-01-01`, 'Neujahr'], [`${jahr}-05-01`, 'Tag der Arbeit'], [`${jahr}-10-03`, 'Tag der Deutschen Einheit'],
    [`${jahr}-10-31`, 'Reformationstag'], [`${jahr}-12-25`, '1. Weihnachtstag'], [`${jahr}-12-26`, '2. Weihnachtstag'],
    [isoVon(o - 2), 'Karfreitag'], [isoVon(o + 1), 'Ostermontag'], [isoVon(o + 39), 'Christi Himmelfahrt'], [isoVon(o + 50), 'Pfingstmontag'],
  ]);
}

export const schuljahrDaten = (schuljahr) => SCHULJAHRE_NI[String(schuljahr || '').trim()] || null;

/** Unterrichtsfrei (Ferien, Feiertag, Wochenende)? */
export function unterrichtsfrei(datum, sj) {
  if (wochentagVon(datum) > 4) return true;
  if (feiertageNI(Number(datum.slice(0, 4))).has(datum)) return true;
  return !!sj && sj.ferien.some(([von, bis]) => datum >= von && datum <= bis);
}

/**
 * Wochenrhythmus aus den echten (nicht erzeugten) Einträgen: pro Wochentag, Uhrzeit und Fach ein Muster.
 * Rückgabe: [{wt, uhrzeit, ende, summary, schluessel, stunden, takt (1 = jede Woche, 2 = alle 2 Wochen …), anker}]
 */
export function rhythmusErkennen(klasse) {
  const gruppen = new Map();
  for (const e of klasse.stundenplan || []) {
    if (e.status !== 'ok' || e.quelle === 'regel' || !e.datum) continue;
    const schluessel = `${wochentagVon(e.datum)}|${e.uhrzeit}|${e.ende || ''}|${e.summary || ''}`;
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, []);
    gruppen.get(schluessel).push(e);
  }
  const muster = [];
  for (const eintraege of gruppen.values()) {
    const wochen = [...new Set(eintraege.map((e) => wocheVon(e.datum)))].sort((a, b) => a - b);
    if (wochen.length < 4) continue; // zu selten: Einzeltermin oder Vertretung
    const luecken = wochen.slice(1).map((w, i) => w - wochen[i]).filter((g) => g <= 3);
    if (luecken.length === 0) continue;
    const zaehler = new Map();
    for (const g of luecken) zaehler.set(g, (zaehler.get(g) || 0) + 1);
    const [takt, anzahl] = [...zaehler.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    if (anzahl / luecken.length < 0.6) continue; // kein verlässlicher Takt
    const erster = eintraege[0];
    muster.push({
      wt: wochentagVon(erster.datum), uhrzeit: erster.uhrzeit, ende: erster.ende, summary: erster.summary,
      schluessel: erster.schluessel, stunden: erster.stunden || 1, takt, ankerWoche: wochen.at(-1),
    });
  }
  return muster;
}

const startMsVon = (datum, uhrzeit) => {
  const [j, m, t] = datum.split('-').map(Number);
  const [h, mi] = (uhrzeit || '00:00').split(':').map(Number);
  return ortszeitZuMs(j, m, t, h, mi, 0, STANDARD_ZEITZONE);
};

function halbjahrVon(datum) {
  const m = Number(datum.slice(5, 7));
  return m >= 2 && m <= 7 ? 2 : 1;
}

/**
 * Schreibt den Plan der Klasse fort. Vorher werden früher erzeugte Einträge ohne Inhalt entfernt und neu berechnet.
 * Erzeugt wird nur außerhalb des Zeitraums, den Untis tatsächlich geliefert hat.
 * Rückgabe: {neu, entfernt, grund}. grund ist gesetzt, wenn nichts erzeugt werden konnte.
 */
export function rhythmusAuffuellen(klasse) {
  const sj = schuljahrDaten(klasse.kopf?.schuljahr);
  if (!sj) return { neu: 0, entfernt: 0, grund: `Für das Schuljahr „${klasse.kopf?.schuljahr || '?'}“ sind keine Ferientermine hinterlegt.` };
  const echte = (klasse.stundenplan || []).filter((e) => e.quelle !== 'regel');
  if (echte.length === 0) return { neu: 0, entfernt: 0, grund: 'Es gibt noch keinen importierten Stundenplan.' };
  const sport = klasse.fachtyp === 'sport';

  // Früher erzeugtes ohne Inhalt entfernen
  let entfernt = 0;
  const behalten = [];
  for (const e of klasse.stundenplan) {
    if (e.quelle !== 'regel') { behalten.push(e); continue; }
    const t = sport ? klasse.sport.termine.find((x) => x.uid === e.uid) : null;
    if (t && terminHatEintraege(klasse, t)) { behalten.push(e); continue; }
    if (t) {
      const sp = klasse.sport;
      sp.termine = sp.termine.filter((x) => x.id !== t.id);
      delete sp.anwesenheit[t.id];
      delete sp.mitarbeit[t.id];
      delete sp.merkmale[t.id];
    }
    entfernt += 1;
  }
  klasse.stundenplan = behalten;

  const datenvon = echte.map((e) => e.datum).sort();
  const fensterVon = datenvon[0], fensterBis = datenvon.at(-1);
  const muster = rhythmusErkennen(klasse);
  if (muster.length === 0) return { neu: 0, entfernt, grund: 'Aus dem Stundenplan lässt sich noch kein fester Wochenrhythmus erkennen (mindestens 4 gleiche Wochen nötig).' };

  // Sport wird meist nur ein Halbjahr unterrichtet: dann nur das Halbjahr auffüllen, in dem der importierte Plan beginnt
  const nurHalbjahr = sport && klasse.sport.zeitraum !== 'jahr' ? halbjahrVon(fensterVon) : 0;
  const belegt = new Set(klasse.stundenplan.map((e) => `${e.datum}|${e.uhrzeit}`));
  const tageMitTermin = new Set(sport ? klasse.sport.termine.map((t) => t.datum) : []);
  const jetztIso = new Date().toISOString();
  const neue = [];
  for (let tag = tageSeit(sj.beginn); tag <= tageSeit(sj.ende); tag += 1) {
    const datum = isoVon(tag);
    if (datum >= fensterVon && datum <= fensterBis) continue; // dort gilt, was Untis geliefert hat
    if (unterrichtsfrei(datum, sj)) continue;
    if (nurHalbjahr && halbjahrVon(datum) !== nurHalbjahr) continue;
    const wt = wochentagVon(datum);
    for (const m of muster) {
      if (m.wt !== wt || (wocheVon(datum) - m.ankerWoche) % m.takt !== 0) continue;
      if (belegt.has(`${datum}|${m.uhrzeit}`) || (sport && tageMitTermin.has(datum))) continue;
      const uid = `regel-${datum}-${m.uhrzeit}`;
      const start = startMsVon(datum, m.uhrzeit);
      const dauer = m.ende ? startMsVon(datum, m.ende) - start : 0;
      neue.push({
        uid, uids: [uid], datum, uhrzeit: m.uhrzeit, ende: m.ende, startMs: start, endeMs: start + dauer, status: 'ok',
        summary: m.summary, schluessel: m.schluessel, stunden: m.stunden, importiert: jetztIso, quelle: 'regel',
      });
      belegt.add(`${datum}|${m.uhrzeit}`);
    }
  }
  klasse.stundenplan.push(...neue);
  klasse.stundenplan.sort((a, b) => a.startMs - b.startMs);
  if (sport) {
    for (const e of neue) {
      klasse.sport.termine.push({ id: neueId(), datum: e.datum, uhrzeit: e.uhrzeit, ende: e.ende, reihe: '', pruefungstag: false, vermerk: '', halbjahr: halbjahrVon(e.datum), uid: e.uid, uids: e.uids, quelle: 'regel', _neu: true });
    }
    reiheUebernehmen(klasse);
  }
  return { neu: neue.length, entfernt, grund: '' };
}

/**
 * Pausen zwischen den Spalten einer Anwesenheitsliste: Ferien, Feiertage und ausgefallene Stunden.
 * `daten`: aufsteigend sortierte ISO-Daten der Unterrichtstage (Spalten).
 * Rückgabe: Map von Spaltenindex auf die Pausen, die direkt davor stehen: [{datum, bis, text, art}].
 * Feiertage und Brückentage erscheinen nur an Wochentagen, an denen die Klasse sonst Unterricht hat.
 */
export function pausenSpalten(klasse, daten) {
  const ergebnis = new Map();
  if (daten.length < 2) return ergebnis;
  const sj = schuljahrDaten(klasse.kopf?.schuljahr);
  const wochentage = new Set(daten.map(wochentagVon));
  for (const e of klasse.stundenplan || []) if (e.status === 'ok' && e.datum) wochentage.add(wochentagVon(e.datum));
  const ausfaelle = new Map();
  for (const e of klasse.stundenplan || []) if (e.status === 'ausgefallen' && e.datum) ausfaelle.set(e.datum, e);
  const spaltenTage = new Set(daten);
  const inFerien = (datum) => sj?.ferien.find(([von, bis]) => datum >= von && datum <= bis) || null;
  for (let i = 1; i < daten.length; i += 1) {
    const von = daten[i - 1], bis = daten[i];
    const liste = [];
    for (const f of sj?.ferien || []) {
      const [fv, fb, name] = f;
      if (fv <= von || fv >= bis) continue;
      const einzeln = fv === fb;
      if (einzeln && !wochentage.has(wochentagVon(fv))) continue;
      liste.push({ datum: fv, bis: fb, text: name, art: 'ferien' });
    }
    // Feiertage und Ausfälle Tag für Tag, außerhalb der Ferien
    for (let tag = tageSeit(von) + 1; tag < tageSeit(bis); tag += 1) {
      const datum = isoVon(tag);
      if (spaltenTage.has(datum) || inFerien(datum) || !wochentage.has(wochentagVon(datum))) continue;
      const feiertag = feiertageNI(Number(datum.slice(0, 4))).get(datum);
      if (feiertag) liste.push({ datum, bis: datum, text: feiertag, art: 'feiertag' });
      else if (ausfaelle.has(datum)) liste.push({ datum, bis: datum, text: 'ausgefallen', art: 'ausfall' });
    }
    if (liste.length) ergebnis.set(i, liste.sort((a, b) => a.datum.localeCompare(b.datum)));
  }
  return ergebnis;
}
