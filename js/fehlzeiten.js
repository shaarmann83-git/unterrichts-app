// Fehlzeiten: Bezeichnungen, Summen und Hilfen (SPEC 8.6). Fehlzeiten fließen nie in Noten ein.
import { aktiveSchueler } from './modell.js';

export const FZ_STATUS = {
  entschuldigt: 'entschuldigt',
  attest: 'entschuldigt mit Attest',
  nicht: 'nicht entschuldigt',
  offen: 'offen',
};
export const FZ_QUELLE = { 'untis-a': 'Untis (je Stunde)', 'untis-b': 'Untis (Zeitraum)', manuell: 'manuell' };

/** Wochentage (Mo–Fr) zwischen zwei ISO-Daten einschließlich; bei fehlendem Ende 1 Tag. */
export function werktage(von, bis) {
  if (!von) return 0;
  const ende = bis && bis >= von ? bis : von;
  let n = 0;
  const d = new Date(`${von}T12:00:00Z`);
  const e = new Date(`${ende}T12:00:00Z`);
  while (d <= e) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/** Summen je Person. Einträge mit zaehltNicht werden nicht summiert. */
export function fehlzeitenSummen(klasse, schuelerId) {
  const s = { entschuldigt: 0, attest: 0, nicht: 0, offen: 0, gesamt: 0, tage: 0, verspaetungen: 0, eintraege: 0 };
  for (const f of klasse.fehlzeiten) {
    if (f.schuelerId !== schuelerId || f.zaehltNicht) continue;
    s.eintraege += 1;
    const std = Number(f.std) || 0;
    const min = Number(f.min) || 0;
    if (f.status === 'entschuldigt' || f.status === 'attest') s.entschuldigt += std;
    if (f.status === 'attest') s.attest += std;
    if (f.status === 'nicht') s.nicht += std;
    if (f.status === 'offen') s.offen += std;
    s.gesamt += std;
    if (typeof f.tage === 'number') s.tage += f.tage;
    else if (f.quelle === 'untis-b' || f.datumBis) s.tage += werktage(f.datum, f.datumBis);
    else if (std > 0 || min > 0) s.tage += 0; // je Stunde ohne Tagesangabe: keine Tageszählung
    if (std < 1 && min > 0) s.verspaetungen += 1;
  }
  return s;
}

/** Alle Fehlzeiten einer Person, neueste zuerst. */
export function fehlzeitenVon(klasse, schuelerId) {
  return klasse.fehlzeiten.filter((f) => f.schuelerId === schuelerId).sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
}

export function aktivePersonenIds(klasse) {
  return new Set(aktiveSchueler(klasse).map((s) => s.id));
}
