// Archiv einer Klasse: archivierte Personen wiederherstellen oder endgültig löschen (SPEC 8.13).
import { K } from '../kontext.js';
import { h, bestaetigen } from '../ui.js';
import { archivierteSchueler, anzeigename, datumDeutsch } from '../modell.js';
import { ansichtRegistrieren } from '../registry.js';

export function zeigeArchiv() {
  const d = K.daten;
  const wurzel = h('section', { class: 'seite' });
  const liste = archivierteSchueler(d);
  wurzel.append(
    h('h1', {}, 'Archiv'),
    h('p', { class: 'klein' }, 'Archivierte Personen erscheinen nicht in Eingabelisten, Schnelleingabe, Notenspiegel und Druck. Ihre Daten bleiben erhalten.'),
    h('a', { class: 'knopf', href: '#/grunddaten' }, '‹ Zurück zu den Grunddaten'),
  );
  if (liste.length === 0) {
    wurzel.append(h('p', { class: 'hinweis' }, 'Keine archivierten Personen.'));
    return { el: wurzel };
  }
  wurzel.append(
    h('div', { class: 'tabelle-rahmen' },
      h('table', { class: 'tabelle' },
        h('thead', {}, h('tr', {}, ['Name', 'Archiviert am', 'Grund', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, liste.map((s) => h('tr', {},
          h('td', { class: 'links name' }, [s.name, s.vorname].filter(Boolean).join(', ')),
          h('td', {}, datumDeutsch(s.archiviert.datum)),
          h('td', { class: 'links' }, s.archiviert.grund || ''),
          h('td', { class: 'zeilenknoepfe' },
            h('button', { type: 'button', class: 'knopf klein', onclick: () => { s.archiviert = null; K.aenderung(); K.neuZeichnen(); } }, 'Wiederherstellen'),
            h('button', { type: 'button', class: 'knopf klein gefahr', onclick: async () => {
              const ja = await bestaetigen(
                'Endgültig löschen',
                `„${anzeigename(s)}“ wird mit ALLEN Punkten, Noten, Fehlzeiten und Einträgen unwiderruflich aus dieser Klasse gelöscht. Das lässt sich nicht rückgängig machen.`,
                'Endgültig löschen',
                true,
              );
              if (!ja) return;
              d.schueler.splice(d.schueler.indexOf(s), 1);
              for (const ka of d.klassenarbeiten) { delete ka.ergebnisse[s.id]; delete ka.teilnahme[s.id]; }
              for (const t of d.sonstige) delete t.eintraege[s.id];
              for (const a of d.dalton.aufgaben) delete a.eintraege[s.id];
              d.fehlzeiten = d.fehlzeiten.filter((f) => f.schuelerId !== s.id);
              for (const l of d.listen) delete l.eintraege[s.id];
              K.aenderung();
              K.neuZeichnen();
            } }, 'Endgültig löschen'),
          ),
        ))),
      ),
    ),
  );
  return { el: wurzel };
}

ansichtRegistrieren('archiv', { text: 'Archiv', bauen: zeigeArchiv, klasse: true, keinMenue: true });
