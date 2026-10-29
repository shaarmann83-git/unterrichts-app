// Teilnahme an Klassenarbeiten, Vorschläge aus Untis-Fehlzeiten und Nachschreibliste (SPEC 8.6).
import { aktiveSchueler, anzeigename } from './modell.js';

export const TEILNAHME = {
  mitgeschrieben: 'mitgeschrieben',
  'attest-offen': 'gefehlt mit Attest, Nachschreiben offen',
  nachgeschrieben: 'nachgeschrieben',
  'ohne-attest': 'gefehlt ohne Attest',
  'entschuldigung-offen': 'gefehlt, Entschuldigung offen',
};

const min = (hhmm) => {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Deckt der Fehlzeit-Eintrag den Termin der Klassenarbeit ab? Datum muss im Zeitraum liegen.
 * Sind Uhrzeiten der Arbeit und des Zeitraums bekannt, müssen sie sich überschneiden
 * (am ersten Tag ab Beginnzeit, am letzten bis Endzeit, dazwischen ganztägig). Sonst genügt das Datum.
 */
export function deckt(ka, f) {
  if (!ka.datum) return false;
  const bis = f.datumBis || f.datum;
  if (ka.datum < f.datum || ka.datum > bis) return false;
  const kaVon = min(ka.uhrzeitVon);
  const kaBis = min(ka.uhrzeitBis);
  if (kaVon === null || kaBis === null) return true;
  if (f.quelle !== 'untis-b') return true; // je Stunde ohne Uhrzeit: nur Datum
  const start = ka.datum === f.datum && min(f.zeitVon) !== null ? min(f.zeitVon) : 0;
  const ende = ka.datum === bis && min(f.zeitBis) !== null ? min(f.zeitBis) : 24 * 60;
  return start < kaBis && ende > kaVon;
}

const RANG = { 'attest-offen': 3, 'entschuldigung-offen': 2, 'ohne-attest': 1 };

function vorschlagAusStatus(status, quelle) {
  if (status === 'attest') return 'attest-offen';
  // Format A kennt kein Attest: „entschuldigt“ heißt dort nur „Attest unbekannt“, also noch keine Entscheidung.
  if (status === 'entschuldigt' && quelle === 'untis-a') return 'entschuldigung-offen';
  if (status === 'offen') return 'entschuldigung-offen';
  return 'ohne-attest'; // entschuldigt ohne Attest, nicht entschuldigt
}

/** Fehlzeiten einer Person, die den Termin der Klassenarbeit abdecken (ohne Einträge, die nicht zählen). */
export function fehlzeitenAmTermin(klasse, ka, schuelerId) {
  return klasse.fehlzeiten.filter((f) => f.schuelerId === schuelerId && !f.zaehltNicht && deckt(ka, f));
}

function hatPunkte(ka, schuelerId) {
  return (ka.ergebnisse[schuelerId]?.punkte || []).some((p) => p !== null && p !== undefined && p !== '');
}

/**
 * Vorschläge für die Teilnahme je Klassenarbeit und Person. Nichts wird übernommen.
 * Rückgabe: [{kaIndex, ka, person, aktuell, vorschlag, aenderung, fz}]; `aenderung` = es gibt schon einen anderen Stand.
 */
export function teilnahmeVorschlaege(klasse) {
  const liste = [];
  klasse.klassenarbeiten.forEach((ka, kaIndex) => {
    for (const person of aktiveSchueler(klasse)) {
      const aktuell = ka.teilnahme?.[person.id]?.status || 'mitgeschrieben';
      if (aktuell === 'nachgeschrieben') continue;
      if (hatPunkte(ka, person.id) && aktuell === 'mitgeschrieben') continue;
      const treffer = fehlzeitenAmTermin(klasse, ka, person.id);
      if (treffer.length === 0) continue;
      let beste = null;
      for (const f of treffer) {
        const v = vorschlagAusStatus(f.status, f.quelle);
        if (!beste || RANG[v] > RANG[beste.v]) beste = { v, f };
      }
      if (beste.v === aktuell) continue;
      liste.push({ kaIndex, ka, person, aktuell, vorschlag: beste.v, aenderung: aktuell !== 'mitgeschrieben', fz: beste.f });
    }
  });
  return liste;
}

/** Vorschlag übernehmen. */
export function vorschlagUebernehmen(v) {
  v.ka.teilnahme ||= {};
  const alt = v.ka.teilnahme[v.person.id] || {};
  v.ka.teilnahme[v.person.id] = { ...alt, status: v.vorschlag };
}

/**
 * Nachschreibliste über alle Klassen des Notenbuchs: wer muss noch nachschreiben (Attest, offen)
 * und wer ist ohne Entscheidung (ohne Attest, Entschuldigung offen).
 */
export function nachschreibListe(buch) {
  const offen = [];
  const entscheidung = [];
  for (const klasse of buch.klassen) {
    klasse.klassenarbeiten.forEach((ka, i) => {
      for (const person of aktiveSchueler(klasse)) {
        const t = ka.teilnahme?.[person.id];
        if (!t) continue;
        const zeile = { klasse, ka, kaNr: i + 1, person, name: anzeigename(person), termin: t.nachschreibtermin || '', status: t.status };
        if (t.status === 'attest-offen' && !hatPunkte(ka, person.id)) offen.push(zeile);
        else if ((t.status === 'ohne-attest' || t.status === 'entschuldigung-offen') && !hatPunkte(ka, person.id)) entscheidung.push(zeile);
      }
    });
  }
  const sortiere = (a, b) => (a.klasse.kopf.klasse || '').localeCompare(b.klasse.kopf.klasse || '', 'de') || a.kaNr - b.kaNr || a.name.localeCompare(b.name, 'de');
  return { offen: offen.sort(sortiere), entscheidung: entscheidung.sort(sortiere) };
}
