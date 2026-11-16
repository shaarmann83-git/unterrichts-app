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

/** Alle Protokoll-Einstellungen im Reiter Drucken: Schrift, rechtes Unterschriftsfeld, Kopf. `nachher` zeichnet die Vorschau neu. */
export function protokollEinstellungen(klasse, nachher) {
  const dr = (K.buch.einstellungen.druck ||= { kopfLinks: '', kopfRechts: '' });
  return h('div', { class: 'protokoll-einstellungen' },
    h('label', {}, 'Schriftart ', h('select', { 'aria-label': 'Schriftart des Protokolls', onchange: (e) => { dr.schrift = e.target.value; K.aenderung(); nachher(); } },
      SCHRIFTEN.map((x) => h('option', { value: x.name, selected: (dr.schrift || 'Calibri') === x.name }, x.name)))),
    h('label', {}, 'Rechtes Unterschriftsfeld ', h('select', { id: 'klasse-zweite-unterschrift', 'aria-label': 'Rechtes Unterschriftsfeld', onchange: (e) => { klasse.zweiteUnterschrift = e.target.value; K.aenderung(); nachher(); } },
      Object.entries(ZWEITE_UNTERSCHRIFT).map(([w, v]) => h('option', { value: w, selected: klasse.zweiteUnterschrift === w }, v.auswahl)))),
    h('details', { class: 'kopfbilder' },
      h('summary', {}, 'Kopf des Protokolls (Logos und Schulname)'),
      h('p', { class: 'klein' }, 'Der Kopf steht oben auf dem Protokoll und gilt für das ganze Notenbuch. Schriftart und Kopf gelten für alle Klassen, das rechte Unterschriftsfeld nur für diese Klasse. Links unten steht immer „Korrekturdatum und Unterschrift Lehrkraft“.'),
      kopfbilderReihe(K.buch, nachher)),
  );
}
