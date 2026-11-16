// Bewertung und Unterschriften einer Klasse (Notensystem, Notenschlüssel, Punkteschlüssel, Unterschriftszeilen).
// Wird in den Einstellungen angezeigt.
import { K } from '../kontext.js';
import { h } from '../ui.js';
import { zahlLesen, NOTENGRENZEN_STANDARD, PUNKTEGRENZEN_STANDARD } from '../rechnen.js';

/** Elemente für die Klasse `d` (keine Sport-Klasse). */
export function bewertungBereich(d) {
  return [
    h('h2', {}, 'Notensystem'),
    h('div', { class: 'formular' },
      h('label', {}, 'Ausgabe', h('select', { id: 'notensystem', 'aria-label': 'Notensystem', onchange: (e) => { d.notensystem = e.target.value; K.aenderung(); K.neuZeichnen(); } },
        [['noten', 'Noten 1 bis 6 (IHK-Schema)'], ['punkte', 'Notenpunkte 0 bis 15']].map(([w, t]) => h('option', { value: w, selected: (d.notensystem || 'noten') === w }, t))))),
    h('p', { class: 'klein' }, d.notensystem === 'punkte'
      ? 'Gerechnet wird wie bisher über Prozent. Erst am Schluss wird der Prozentwert über den Punkteschlüssel in Notenpunkte umgesetzt. Die sonstige Leistung wird als Punktwert 0 bis 15 eingetragen.'
      : 'Gerechnet wird über Prozent. Die sonstige Leistung wird als Note 1,0 bis 6,0 eingetragen und über das IHK-Schema in Prozent umgesetzt.'),
    h('h2', {}, 'Notenschlüssel'),
    h('p', { class: 'klein' }, 'Ab wie viel Prozent gilt welche Note? Die Werte sind Untergrenzen: Steht bei Note 1 der Wert 91,5, gibt es ab 91,5 % eine 1. Unter der letzten Grenze gilt die Note 6. Gilt nur für diese Klasse.'),
    h('div', { class: 'formular' },
      [1, 2, 3, 4, 5].map((note, i) => h('label', {}, `Note ${note} ab %`,
        h('input', {
          type: 'text', inputmode: 'decimal', class: 'gewicht',
          'aria-label': `Note ${note} ab Prozent`,
          value: String(d.notengrenzen[i]).replace('.', ','),
          oninput: (e) => {
            const z = zahlLesen(e.target.value);
            const ok = z !== null && !Number.isNaN(z) && z >= 0 && z <= 100;
            e.target.classList.toggle('fehler', !ok);
            if (ok) { d.notengrenzen[i] = z; K.aenderung(); }
          },
        }))),
      h('div', { class: 'knopfreihe' },
        h('button', { type: 'button', class: 'knopf klein', onclick: () => { d.notengrenzen = [...NOTENGRENZEN_STANDARD]; K.aenderung(); K.neuZeichnen(); } }, 'Standard wiederherstellen')),
    ),
    h('h2', {}, 'Punkteschlüssel (0 bis 15)'),
    h('p', { class: 'klein' }, 'Nur für Klassen mit Punktsystem. Auch hier sind die Werte Untergrenzen. Voreingestellt ist das Bewertungsschema BG 11, 12 und 13 der BBS Lingen Wirtschaft. Die Umstellung einer Klasse auf Punkte ist noch in Arbeit.'),
    h('div', { class: 'formular' },
      [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((pkt, i) => h('label', {}, `${String(pkt).padStart(2, '0')} Punkte ab %`,
        h('input', {
          type: 'text', inputmode: 'decimal', class: 'gewicht',
          'aria-label': `${pkt} Punkte ab Prozent`,
          value: String(d.punktegrenzen[i]).replace('.', ','),
          oninput: (e) => {
            const z = zahlLesen(e.target.value);
            const ok = z !== null && !Number.isNaN(z) && z >= 0 && z <= 100;
            e.target.classList.toggle('fehler', !ok);
            if (ok) { d.punktegrenzen[i] = z; K.aenderung(); }
          },
        }))),
      h('div', { class: 'knopfreihe' },
        h('button', { type: 'button', class: 'knopf klein', onclick: () => { d.punktegrenzen = [...PUNKTEGRENZEN_STANDARD]; K.aenderung(); K.neuZeichnen(); } }, 'Standard wiederherstellen')),
    ),
  ];
}
