// Alle Einstellungen für die Protokolle der Klassenarbeiten an einer Stelle (Reiter „Klassenarbeiten“).
import { K } from '../kontext.js';
import { h } from '../ui.js';
import { ZWEITE_UNTERSCHRIFT } from '../modell.js';
import { kopfbilderReihe } from './kopfbilder.js';

/** Schriftarten für das Protokoll. „Calibri“ nutzt die Schrift des Geräts, sonst die mitgelieferte Ersatzschrift Carlito (gleiche Maße). */
export const SCHRIFTEN = [
  { name: 'Calibri', stapel: 'Calibri, Carlito, sans-serif', skala: 1 },
  { name: 'Arial', stapel: "Arial, Helvetica, 'Liberation Sans', sans-serif", skala: 0.9 },
  { name: 'Verdana', stapel: "Verdana, 'DejaVu Sans', sans-serif", skala: 0.77 },
  { name: 'Times New Roman', stapel: "'Times New Roman', Times, 'Liberation Serif', serif", skala: 1 },
];

/** Schriftgrößen gelten für Calibri; andere Schriften werden so skaliert, dass sie gleich groß wirken. */
export function schriftStil(name) {
  const f = SCHRIFTEN.find((x) => x.name === name) || SCHRIFTEN[0];
  return `--protokoll-schrift: ${f.stapel}; --skala: ${f.skala}`;
}

/** Aufklappbarer Bereich mit allen Protokoll-Einstellungen (Schrift, rechtes Unterschriftsfeld, Kopf). */
export function protokollEinstellungen(klasse) {
  const dr = (K.buch.einstellungen.druck ||= { kopfLinks: '', kopfRechts: '' });
  return h('details', { class: 'protokoll-einstellungen' },
    h('summary', {}, 'Einstellungen für die Protokolle'),
    h('p', { class: 'klein' }, 'Diese Einstellungen gelten für alle Protokolle. Schrift und Kopf gelten für das ganze Notenbuch, das rechte Unterschriftsfeld nur für diese Klasse. Links unten steht immer „Korrekturdatum und Unterschrift Lehrkraft“.'),
    h('div', { class: 'formular' },
      h('label', {}, 'Schriftart', h('select', { 'aria-label': 'Schriftart des Protokolls', onchange: (e) => { dr.schrift = e.target.value; K.aenderung(); } },
        SCHRIFTEN.map((x) => h('option', { value: x.name, selected: (dr.schrift || 'Calibri') === x.name }, x.name)))),
      h('label', {}, 'Rechtes Unterschriftsfeld', h('select', { id: 'klasse-zweite-unterschrift', 'aria-label': 'Rechtes Unterschriftsfeld', onchange: (e) => { klasse.zweiteUnterschrift = e.target.value; K.aenderung(); } },
        Object.entries(ZWEITE_UNTERSCHRIFT).map(([w, v]) => h('option', { value: w, selected: klasse.zweiteUnterschrift === w }, v.auswahl))))),
    h('h3', {}, 'Kopf des Protokolls'),
    kopfbilderReihe(K.buch, () => K.neuZeichnen()),
  );
}
