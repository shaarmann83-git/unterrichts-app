// Dalton-Aufgaben: Bewertung -> Note -> Prozent (SPEC 8.3). Die Umrechnung in Prozent nutzt dasselbe IHK-Schema wie die sonstige Leistung.
import { prozentSL } from './rechnen.js';

export const DALTON_STATUS = {
  abgegeben: 'abgegeben',
  nicht: 'nicht abgegeben',
  entschuldigt: 'entschuldigt (zählt nicht)',
  taeuschung: 'Täuschung (abgeschrieben)',
};
export const DALTON_QUALITAET = { gut: 'gut', mittel: 'mittel', schlecht: 'schlecht' };

/** Dalton-Note eines Eintrags oder null (zählt nicht). Überschriebene Note hat Vorrang. */
export function daltonNote(eintrag, zuordnung) {
  if (!eintrag) return null;
  if (typeof eintrag.note === 'number' && !Number.isNaN(eintrag.note)) return eintrag.note;
  switch (eintrag.status) {
    case 'abgegeben':
      return eintrag.qualitaet ? (zuordnung[eintrag.qualitaet] ?? null) : null;
    case 'nicht':
      return zuordnung.nicht ?? null;
    case 'taeuschung':
      return zuordnung.taeuschung ?? null;
    default: // entschuldigt oder Status fehlt
      return null;
  }
}

/** Dalton-Prozent (IHK-Schema, auf 2 Stellen abgeschnitten) oder null. */
export function daltonProzent(eintrag, zuordnung) {
  const note = daltonNote(eintrag, zuordnung);
  return note === null ? null : prozentSL(note);
}
