// WebUntis-Import (SPEC 8.6): Format A „AbsencePerStudent“ (je Fehlstunde), Format B „AbsenceList“ (je Zeitraum).
// Reine Logik: arbeitet auf Tabellenzeilen (Arrays) und Klassendaten, ohne Oberfläche.
import { neueId } from './modell.js';
import { normName, normKopf, datumIso, zelle } from './tabelle.js';

/** Index der Überschrift (normalisiert); `nr` wählt bei doppelten Überschriften das n-te Vorkommen (0 = erstes). */
function spaltenIndex(kopf, name, nr = 0) {
  let n = -1;
  for (let i = 0; i < kopf.length; i++) {
    if (normKopf(kopf[i]) === normKopf(name)) {
      n += 1;
      if (n === nr) return i;
    }
  }
  return -1;
}

/** Kopfzeile = erste nicht leere Zeile; gibt {kopf, daten} zurück. */
export function kopfUndDaten(zeilen) {
  const i = zeilen.findIndex((z) => z.some((f) => zelle(f) !== ''));
  if (i < 0) return { kopf: [], daten: [] };
  return { kopf: zeilen[i].map(zelle), daten: zeilen.slice(i + 1) };
}

/** Erkennt das Format an der Kopfzeile: 'A', 'B' oder null. */
export function formatErkennen(zeilen) {
  const { kopf } = kopfUndDaten(zeilen);
  const norm = kopf.map(normKopf);
  const hat = (...namen) => namen.every((n) => norm.includes(n));
  if (hat('schülerinnen', 'fehlstd', 'stundennr')) return 'A';
  if (hat('langname', 'beginndatum', 'enddatum')) return 'B';
  return null;
}

export function statusNormieren(text) {
  const t = normName(text).replace(/\./g, '');
  if (!t) return 'offen';
  if (t.includes('attest')) return 'attest';
  if (t === 'nicht entschuldigt' || t === 'nicht entsch' || t.startsWith('nicht ')) return 'nicht';
  if (t === 'entschuldigt' || t === 'entsch') return 'entschuldigt';
  if (t === 'offen') return 'offen';
  return 'offen';
}

const zahlOderNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
};

/** Format A -> normalisierte Zeilen. Die Überschrift „Text“ kommt zweimal vor; ausgewertet wird das zweite Vorkommen. */
export function zeilenAusA(zeilen) {
  const { kopf, daten } = kopfUndDaten(zeilen);
  const i = (n, nr = 0) => spaltenIndex(kopf, n, nr);
  const sp = {
    name: i('Schüler*innen'),
    id: i('Externe Id'),
    klasse: i('Klasse'),
    datum: i('Datum'),
    std: i('Fehlstd.'),
    min: i('Fehlmin.'),
    fach: i('Fach'),
    grund: i('Abwesenheitsgrund'),
    text: spaltenIndex(kopf, 'Text', 1) >= 0 ? spaltenIndex(kopf, 'Text', 1) : i('Text'),
    zaehlt: i('Abwesenheit zählt'),
    stunde: i('Stundennr.'),
    status: i('Status'),
    tage: i('Fehltage'),
  };
  const w = (z, k) => (sp[k] >= 0 ? z[sp[k]] : '');
  const ergebnis = [];
  for (const z of daten) {
    const name = zelle(w(z, 'name'));
    const datum = datumIso(w(z, 'datum'));
    if (!name || !datum) continue; // leere Zeilen und Zeilen ohne Datum überspringen
    ergebnis.push({
      quelle: 'A',
      nameVoll: name,
      id: zelle(w(z, 'id')),
      klasse: zelle(w(z, 'klasse')),
      datum,
      std: zahlOderNull(w(z, 'std')) ?? 0,
      min: zahlOderNull(w(z, 'min')) ?? 0,
      fach: zelle(w(z, 'fach')),
      grund: zelle(w(z, 'grund')),
      notiz: zelle(w(z, 'text')),
      zaehlt: normName(zelle(w(z, 'zaehlt'))) !== 'false',
      stunde: zahlOderNull(w(z, 'stunde')),
      status: statusNormieren(zelle(w(z, 'status'))),
      tage: zahlOderNull(w(z, 'tage')),
    });
  }
  return ergebnis;
}

/** Format B -> normalisierte Zeilen. */
export function zeilenAusB(zeilen) {
  const { kopf, daten } = kopfUndDaten(zeilen);
  const i = (n) => spaltenIndex(kopf, n);
  const sp = {
    name: i('Langname'),
    vorname: i('Vorname'),
    id: i('ID'),
    klasse: i('Klasse'),
    von: i('Beginndatum'),
    bis: i('Enddatum'),
    zeitVon: i('Beginnzeit'),
    zeitBis: i('Endzeit'),
    grund: i('Abwesenheitsgrund'),
    text: i('Text/Grund'),
    status: i('Status'),
  };
  const w = (z, k) => (sp[k] >= 0 ? z[sp[k]] : '');
  const ergebnis = [];
  for (const z of daten) {
    const name = zelle(w(z, 'name'));
    const vorname = zelle(w(z, 'vorname'));
    const datum = datumIso(w(z, 'von'));
    if ((!name && !vorname) || !datum) continue;
    const bis = datumIso(w(z, 'bis')) || datum;
    ergebnis.push({
      quelle: 'B',
      name,
      vorname,
      id: zelle(w(z, 'id')),
      klasse: zelle(w(z, 'klasse')),
      datum,
      datumBis: bis === datum ? '' : bis,
      zeitVon: zelle(w(z, 'zeitVon')),
      zeitBis: zelle(w(z, 'zeitBis')),
      grund: zelle(w(z, 'grund')),
      notiz: zelle(w(z, 'text')),
      status: statusNormieren(zelle(w(z, 'status'))),
    });
  }
  return ergebnis;
}

/** Eigene Zuordnung (Dialog) für nicht erkannte Berichte: Feld -> Spaltenindex, erzeugt Zeilen wie Format B (Zeitraum). */
export const UNTIS_FELDER = [
  { id: 'name', text: 'Name (Nachname)' },
  { id: 'vorname', text: 'Vorname' },
  { id: 'id', text: 'ID / Externe Id' },
  { id: 'klasse', text: 'Klasse' },
  { id: 'von', text: 'Datum (von)' },
  { id: 'bis', text: 'Datum (bis)' },
  { id: 'zeitVon', text: 'Uhrzeit von' },
  { id: 'zeitBis', text: 'Uhrzeit bis' },
  { id: 'status', text: 'Status' },
  { id: 'grund', text: 'Abwesenheitsgrund' },
  { id: 'text', text: 'Text / Notiz' },
];

export function zeilenMitZuordnung(zeilen, zuordnung) {
  const { daten } = kopfUndDaten(zeilen);
  const w = (z, k) => (zuordnung[k] === undefined ? '' : z[zuordnung[k]]);
  const ergebnis = [];
  for (const z of daten) {
    const name = zelle(w(z, 'name'));
    const vorname = zelle(w(z, 'vorname'));
    const datum = datumIso(w(z, 'von'));
    if ((!name && !vorname) || !datum) continue;
    const bis = datumIso(w(z, 'bis')) || datum;
    ergebnis.push({
      quelle: 'B',
      name,
      vorname,
      id: zelle(w(z, 'id')),
      klasse: zelle(w(z, 'klasse')),
      datum,
      datumBis: bis === datum ? '' : bis,
      zeitVon: zelle(w(z, 'zeitVon')),
      zeitBis: zelle(w(z, 'zeitBis')),
      grund: zelle(w(z, 'grund')),
      notiz: zelle(w(z, 'text')),
      status: statusNormieren(zelle(w(z, 'status'))),
    });
  }
  return ergebnis;
}

// ---------- Klassen und Fächer ----------

export const klasseGleich = (a, b) => normName(a) === normName(b) && normName(a) !== '';

/** Welche Untis-Klassen kommen in den Zeilen vor? */
export function untisKlassen(zeilen) {
  return [...new Set(zeilen.map((z) => z.klasse).filter(Boolean))];
}

export function untisFaecher(zeilenA) {
  return [...new Set(zeilenA.map((z) => z.fach).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
}

/** Gehört eine Untis-Klasse zu dieser Klasse des Notenbuchs? (gemerkter Untis-Name, sonst Klassenname) */
export function klassePasst(klasse, untisKlasse) {
  if (klasse.untis?.klassenName) return klasseGleich(klasse.untis.klassenName, untisKlasse);
  return klasseGleich(klasse.kopf.klasse, untisKlasse);
}

/**
 * Welche Klasse des Notenbuchs gehört zu einer Untis-Klasse? Eine gemerkte Zuordnung (untis.klassenName) hat Vorrang;
 * sonst zählt der Klassenname, aber nur bei Klassen ohne eigene Zuordnung (so bleibt bei gleichen Namen die gemerkte Wahl maßgeblich).
 */
export function klasseFuerUntis(buch, untisKlasse) {
  return (
    buch.klassen.find((k) => k.untis?.klassenName && klasseGleich(k.untis.klassenName, untisKlasse)) ||
    buch.klassen.find((k) => !k.untis?.klassenName && klasseGleich(k.kopf.klasse, untisKlasse))
  );
}

/** Verteilt Zeilen auf die Klassen des Notenbuchs. Gibt {proKlasse: Map(klassenId -> Zeilen), unbekannt: [Untis-Klasse]} zurück. */
export function aufKlassenVerteilen(buch, zeilen) {
  const proKlasse = new Map();
  const unbekannt = new Set();
  for (const z of zeilen) {
    const k = klasseFuerUntis(buch, z.klasse);
    if (!k) {
      unbekannt.add(z.klasse || '(ohne Klasse)');
      continue;
    }
    if (!proKlasse.has(k.id)) proKlasse.set(k.id, []);
    proKlasse.get(k.id).push(z);
  }
  return { proKlasse, unbekannt: [...unbekannt] };
}

// ---------- Personen zuordnen ----------

/** Schlüssel einer Zeile für die Zuordnung (ID, sonst Name). */
export function personSchluessel(z) {
  if (z.id) return `id:${z.id}`;
  return `name:${z.quelle === 'A' ? normName(z.nameVoll) : `${normName(z.name)}|${normName(z.vorname)}`}`;
}

export function zeilenName(z) {
  return z.quelle === 'A' ? z.nameVoll : [z.name, z.vorname].filter(Boolean).join(', ');
}

function personen(klasse) {
  return klasse.schueler.filter((s) => s.name || s.vorname);
}

/**
 * Ordnet jede verschiedene Person der Zeilen einer Person der Klasse zu.
 * Rückgabe: Map(schlüssel -> {status:'id'|'name'|'mehrdeutig'|'unbekannt', schuelerId, kandidaten:[ids]}).
 */
export function personenZuordnen(klasse, zeilen) {
  const ergebnis = new Map();
  const alle = personen(klasse);
  // Alle Zeilen je Schlüssel sammeln: Bei gleicher Untis-ID können Format A und B die Namen unterschiedlich schreiben
  // (A: „Nachname Rufname“ in einer Zelle, B: Langname und vollständiger Vorname getrennt). Jede Schreibweise wird probiert.
  const gruppen = new Map();
  for (const z of zeilen) {
    const k = personSchluessel(z);
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(z);
  }
  const eindeutig = (liste) => [...new Map(liste.map((s) => [s.id, s])).values()];
  for (const [schluessel, gruppe] of gruppen) {
    const id = gruppe.find((z) => z.id)?.id;
    let treffer = id ? alle.filter((s) => s.untisId && s.untisId === id) : [];
    if (treffer.length === 1) {
      ergebnis.set(schluessel, { status: 'id', schuelerId: treffer[0].id, kandidaten: [treffer[0].id] });
      continue;
    }
    // 1. Format B: Langname und Vorname genau
    treffer = eindeutig(gruppe.filter((z) => z.quelle !== 'A').flatMap((z) =>
      alle.filter((s) => normName(s.name) === normName(z.name) && normName(s.vorname) === normName(z.vorname))));
    // 2. Format A: „Name Vorname“ genau
    if (treffer.length === 0) {
      treffer = eindeutig(gruppe.filter((z) => z.quelle === 'A').flatMap((z) =>
        alle.filter((s) => normName(`${s.name} ${s.vorname}`) === normName(z.nameVoll))));
    }
    // 3. Format A: Nachname am Anfang (Untis nutzt dort oft den Rufnamen); nur wenn in der Klasse eindeutig
    if (treffer.length === 0) {
      const kandidaten = eindeutig(gruppe.filter((z) => z.quelle === 'A').flatMap((z) =>
        alle.filter((s) => s.name && normName(z.nameVoll).startsWith(`${normName(s.name)} `))));
      if (kandidaten.length === 1) {
        ergebnis.set(schluessel, { status: 'name', schuelerId: kandidaten[0].id, kandidaten: [kandidaten[0].id] });
        continue;
      }
      if (kandidaten.length > 1) {
        ergebnis.set(schluessel, { status: 'mehrdeutig', schuelerId: null, kandidaten: kandidaten.map((s) => s.id) });
        continue;
      }
    }
    if (treffer.length === 1) ergebnis.set(schluessel, { status: 'name', schuelerId: treffer[0].id, kandidaten: [treffer[0].id] });
    else if (treffer.length > 1) ergebnis.set(schluessel, { status: 'mehrdeutig', schuelerId: null, kandidaten: treffer.map((s) => s.id) });
    else ergebnis.set(schluessel, { status: 'unbekannt', schuelerId: null, kandidaten: [] });
  }
  return ergebnis;
}

// ---------- Planen und Anwenden ----------

const tagImBereich = (d, von, bis) => d >= von && d <= bis;
const bisDatum = (f) => f.datumBis || f.datum;

/** Zwei Einträge gleich? (Schlüssel) */
function eintragSchluessel(f) {
  if (f.quelle === 'untis-b') return `b|${f.schuelerId}|${f.datum}|${f.datumBis || ''}|${f.zeitVon || ''}|${f.zeitBis || ''}`;
  return `a|${f.schuelerId}|${f.datum}|${f.stunde ?? ''}|${normName(f.fach)}`;
}

function mitZaehler(liste) {
  const gesehen = new Map();
  return liste.map((f) => {
    const s = eintragSchluessel(f);
    const n = (gesehen.get(s) || 0) + 1;
    gesehen.set(s, n);
    return { f, schluessel: `${s}#${n}` };
  });
}

function eintragAusZeile(z, schuelerId) {
  if (z.quelle === 'A') {
    return {
      id: neueId(), schuelerId, datum: z.datum, datumBis: '', zeitVon: '', zeitBis: '', stunde: z.stunde, std: z.std, min: z.min,
      fach: z.fach, status: z.status, grund: z.grund, quelle: 'untis-a', notiz: z.notiz, zaehltNicht: !z.zaehlt, tage: z.tage ?? undefined,
    };
  }
  return {
    id: neueId(), schuelerId, datum: z.datum, datumBis: z.datumBis || '', zeitVon: z.zeitVon || '', zeitBis: z.zeitBis || '', stunde: null,
    std: 0, min: 0, fach: '', status: z.status, grund: z.grund, quelle: 'untis-b', notiz: z.notiz, zaehltNicht: false,
  };
}

const gleichInhalt = (a, b) =>
  a.status === b.status && (a.std || 0) === (b.std || 0) && (a.min || 0) === (b.min || 0) && (a.grund || '') === (b.grund || '') && !!a.zaehltNicht === !!b.zaehltNicht;

/**
 * Plant den Import ohne etwas zu verändern.
 * `eingabe`: { a: Zeilen aus Format A (oder []), b: Zeilen aus Format B (oder []) } – schon auf diese Klasse verteilt.
 * `optionen`: { faecher: [..] (leer = alle), manuell: Map(schlüssel -> schuelerId | null (überspringen)) }
 * Gibt zurück: { fehlzeiten (neuer Stand), neu, geaendert, weggefallen, unzugeordnet, untisIds, uebernommen }.
 */
export function importPlanen(klasse, eingabe, optionen = {}) {
  const manuell = optionen.manuell || new Map();
  const faecherAuswahl = new Set((optionen.faecher || []).map((f) => normName(f)));
  const zeilenA = (eingabe.a || []).filter((z) => faecherAuswahl.size === 0 || faecherAuswahl.has(normName(z.fach)));
  const zeilenB = eingabe.b || [];

  const zuordnung = personenZuordnen(klasse, [...zeilenA, ...zeilenB]);
  const aufloesen = (z) => {
    const k = personSchluessel(z);
    if (manuell.has(k)) return manuell.get(k);
    return zuordnung.get(k)?.schuelerId ?? null;
  };

  const unzugeordnet = new Map();
  const untisIds = new Map();
  const neueEintraege = [];
  let uebernommen = 0;
  for (const z of [...zeilenA, ...zeilenB]) {
    const sid = aufloesen(z);
    const k = personSchluessel(z);
    if (!sid) {
      if (!manuell.has(k)) {
        const eintrag = unzugeordnet.get(k) || { schluessel: k, name: zeilenName(z), id: z.id, status: zuordnung.get(k)?.status, kandidaten: zuordnung.get(k)?.kandidaten || [], zeilen: 0 };
        eintrag.zeilen += 1;
        unzugeordnet.set(k, eintrag);
      }
      continue;
    }
    if (z.id) {
      const person = klasse.schueler.find((s) => s.id === sid);
      if (person && !person.untisId) untisIds.set(sid, z.id);
    }
    neueEintraege.push(eintragAusZeile(z, sid));
    uebernommen += 1;
  }

  const neuA = neueEintraege.filter((f) => f.quelle === 'untis-a');
  const neuB = neueEintraege.filter((f) => f.quelle === 'untis-b');

  // Attest aus Format B: neue B-Einträge, sonst die bereits gespeicherten
  const bQuelle = zeilenB.length > 0 ? neuB : klasse.fehlzeiten.filter((f) => f.quelle === 'untis-b');
  for (const a of neuA) {
    if (a.status !== 'entschuldigt') continue;
    const hatAttest = bQuelle.some((b) => b.schuelerId === a.schuelerId && b.status === 'attest' && tagImBereich(a.datum, b.datum, bisDatum(b)));
    if (hatAttest) a.status = 'attest';
  }

  // Was wird ersetzt?
  const zuErsetzen = (f) => {
    if (f.quelle === 'manuell' || !String(f.quelle).startsWith('untis')) return false;
    if (zeilenB.length > 0 && f.quelle === 'untis-b' && neuB.length > 0) {
      const von = neuB.reduce((m, x) => (x.datum < m ? x.datum : m), neuB[0].datum);
      const bis = neuB.reduce((m, x) => (bisDatum(x) > m ? bisDatum(x) : m), bisDatum(neuB[0]));
      if (f.datum <= bis && bisDatum(f) >= von) return true;
    }
    if (neuA.length > 0) {
      const von = neuA.reduce((m, x) => (x.datum < m ? x.datum : m), neuA[0].datum);
      const bis = neuA.reduce((m, x) => (x.datum > m ? x.datum : m), neuA[0].datum);
      if (f.quelle === 'untis-a' && tagImBereich(f.datum, von, bis)) {
        return faecherAuswahl.size === 0 || faecherAuswahl.has(normName(f.fach));
      }
      // Format A ersetzt Zeitraum-Einträge (B) nur für Tage, die vollständig im Bereich liegen
      if (f.quelle === 'untis-b' && neuB.length === 0 && f.datum >= von && bisDatum(f) <= bis) return true;
    }
    return false;
  };

  const entfernt = klasse.fehlzeiten.filter(zuErsetzen);
  const behalten = klasse.fehlzeiten.filter((f) => !zuErsetzen(f));
  const alteMap = new Map(mitZaehler(entfernt).map(({ f, schluessel }) => [schluessel, f]));
  const neueMap = mitZaehler(neueEintraege);

  const neu = [];
  const geaendert = [];
  for (const { f, schluessel } of neueMap) {
    const alt = alteMap.get(schluessel);
    if (!alt) {
      neu.push(f);
    } else {
      if (!gleichInhalt(alt, f)) geaendert.push({ vorher: alt, nachher: f });
      f.id = alt.id; // gleiche Zeile behält ihre ID
      alteMap.delete(schluessel);
    }
  }
  const weggefallen = [...alteMap.values()];

  const ergebnisFehlzeiten = [...behalten, ...neueEintraege];
  return {
    fehlzeiten: ergebnisFehlzeiten,
    neu,
    geaendert,
    weggefallen,
    unzugeordnet: [...unzugeordnet.values()],
    untisIds,
    uebernommen,
    // Sport: Untis schreibt Zeichen in die Anwesenheit (SPEC 9.2)
    anwesenheit: klasse.fachtyp === 'sport' ? anwesenheitPlan(klasse, ergebnisFehlzeiten) : null,
  };
}

// ---------- Sport: Untis → Anwesenheit (SPEC 9.2) ----------

const STATUS_ZEICHEN = { attest: 'A', entschuldigt: 'E', nicht: 'U', offen: '|' };
// Bei mehreren Einträgen am selben Tag gewinnt der entlastendste (so wird nie voreilig ein U gesetzt)
const STATUS_RANG = { attest: 4, entschuldigt: 3, offen: 2, nicht: 1 };

const minuten = (hhmm) => {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Deckt der Untis-Eintrag den Sport-Termin ab? Datum im Zeitraum; mit Uhrzeit des Termins auch zeitlich (erster Tag ab Beginn, letzter Tag bis Ende). */
function deckTermin(termin, f) {
  if (!termin.datum) return false;
  const bis = f.datumBis || f.datum;
  if (termin.datum < f.datum || termin.datum > bis) return false;
  const t = minuten(termin.uhrzeit);
  if (t === null || f.quelle !== 'untis-b') return true;
  const von = termin.datum === f.datum && minuten(f.zeitVon) !== null ? minuten(f.zeitVon) : 0;
  const ende = termin.datum === bis && minuten(f.zeitBis) !== null ? minuten(f.zeitBis) : 24 * 60;
  return t >= von && t < ende;
}

/**
 * Vergleicht die Untis-Fehlzeiten mit der Anwesenheit einer Sport-Klasse. Nichts wird verändert.
 * setzen: leere Zellen und frühere Untis-Zeichen, die sich ändern. abweichungen: von Hand gesetzte Zeichen, die abweichen (bleiben unangetastet).
 */
export function anwesenheitPlan(klasse, fehlzeiten) {
  const setzen = [];
  const abweichungen = [];
  const untisEintraege = fehlzeiten.filter((f) => String(f.quelle).startsWith('untis') && !f.zaehltNicht);
  for (const termin of klasse.sport.termine) {
    for (const person of klasse.schueler) {
      if (!person.name && !person.vorname) continue;
      const treffer = untisEintraege.filter((f) => f.schuelerId === person.id && deckTermin(termin, f));
      if (treffer.length === 0) continue;
      const bester = treffer.reduce((a, b) => ((STATUS_RANG[b.status] || 0) > (STATUS_RANG[a.status] || 0) ? b : a));
      const z = STATUS_ZEICHEN[bester.status];
      if (!z) continue;
      const bisher = klasse.sport.anwesenheit[termin.id]?.[person.id];
      if (!bisher || !bisher.z) setzen.push({ terminId: termin.id, schuelerId: person.id, z, vorher: '' });
      else if (bisher.z === z) continue;
      else if (bisher.quelle === 'untis') setzen.push({ terminId: termin.id, schuelerId: person.id, z, vorher: bisher.z });
      else abweichungen.push({ terminId: termin.id, schuelerId: person.id, hand: bisher.z, untis: z });
    }
  }
  return { setzen, abweichungen };
}

/** Wendet einen Plan an. */
export function importAnwenden(klasse, plan) {
  klasse.fehlzeiten = plan.fehlzeiten;
  for (const x of plan.anwesenheit?.setzen || []) {
    (klasse.sport.anwesenheit[x.terminId] ||= {})[x.schuelerId] = { z: x.z, quelle: 'untis' };
  }
  for (const [sid, id] of plan.untisIds) {
    const s = klasse.schueler.find((x) => x.id === sid);
    if (s && !s.untisId) s.untisId = id;
  }
}

/** Prüfsumme (SHA-256, hex) von Bytes, für „bereits importiert“. */
export async function pruefsumme(bytes) {
  const h = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Zeitstempel aus dem Dateinamen …_JJJJMMTT_HHMM… als sortierbarer Text, sonst ''. */
export function zeitstempelAusName(name) {
  const m = String(name).match(/_(\d{8})_(\d{4})/);
  return m ? `${m[1]}${m[2]}` : '';
}
