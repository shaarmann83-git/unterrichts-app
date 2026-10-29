// Nachschreibliste über alle Klassen (SPEC 8.6): wer muss welche Arbeit noch nachschreiben.
import { K } from '../kontext.js';
import { h } from '../ui.js';
import { datumDeutsch } from '../modell.js';
import { nachschreibListe, TEILNAHME } from '../nachschreiben.js';
import { untisListeLaden } from './fehlzeiten.js';
import { vorschlaegeDialog } from './untis-dialog.js';
import { ansichtRegistrieren } from '../registry.js';

export function zeigeNachschreiben() {
  const buch = K.buch;
  const wurzel = h('section', { class: 'seite' });
  const { offen, entscheidung } = nachschreibListe(buch);
  const tabelle = (zeilen, mitTermin) => h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle' },
    h('thead', {}, h('tr', {}, ['Klasse', 'Arbeit', 'Datum', 'Person', mitTermin ? 'Nachschreibtermin' : 'Stand'].map((t) => h('th', {}, t)))),
    h('tbody', {}, zeilen.map((z) => h('tr', {},
      h('td', {}, z.klasse.kopf.klasse), h('td', {}, `KA ${z.kaNr}`), h('td', {}, datumDeutsch(z.ka.datum)), h('td', { class: 'links name' }, z.name),
      mitTermin
        ? h('td', {}, h('input', { type: 'date', class: 'nachschreibtermin', 'aria-label': `Nachschreibtermin ${z.name}`, value: z.termin, onchange: (e) => {
            z.ka.teilnahme[z.person.id] = { ...z.ka.teilnahme[z.person.id], nachschreibtermin: e.target.value };
            K.aenderung();
          } }), h('span', { class: 'nur-druck' }, datumDeutsch(z.termin)))
        : h('td', { class: 'links' }, TEILNAHME[z.status]))))));
  wurzel.append(
    h('h1', {}, 'Nachschreiben'),
    h('div', { class: 'knopfreihe nicht-drucken' },
      h('button', { type: 'button', class: 'knopf primaer', id: 'untis-laden', onclick: async () => { await untisListeLaden(null); K.neuZeichnen(); } }, 'Untis-Liste laden'),
      h('button', { type: 'button', class: 'knopf', onclick: async () => { await vorschlaegeDialog(buch.klassen); K.neuZeichnen(); } }, 'Vorschläge prüfen'),
      h('button', { type: 'button', class: 'knopf', onclick: () => window.print() }, 'Liste drucken / PDF')),
    h('h2', {}, `Muss noch nachschreiben (${offen.length})`),
    offen.length ? tabelle(offen, true) : h('p', { class: 'hinweis' }, 'Niemand. Fehlt jemand mit Attest bei einer Klassenarbeit, erscheint die Person hier.'),
    h('h2', { class: 'nicht-drucken' }, `Ohne Entscheidung (${entscheidung.length})`),
    h('p', { class: 'klein nicht-drucken' }, 'Gefehlt ohne Attest oder Entschuldigung offen: Wie das benotet wird, legt die App nicht fest. Tragen Sie Punkte oder Ihre Entscheidung in der Klassenarbeit ein.'),
    entscheidung.length ? h('div', { class: 'nicht-drucken' }, tabelle(entscheidung, false)) : null,
  );
  return { el: wurzel };
}

ansichtRegistrieren('nachschreiben', { text: 'Nachschreiben', bauen: zeigeNachschreiben, klasse: false, reihe: 9 });
