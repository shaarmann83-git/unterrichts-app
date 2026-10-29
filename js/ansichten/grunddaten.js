import { K } from '../kontext.js';
import { h, leeren, bestaetigen, fuege } from '../ui.js';
import { neuerSchueler, sortiereSchueler } from '../modell.js';
import { istVolljaehrig, zahlLesen } from '../rechnen.js';
import { passwortSetzen, passwortEntfernen } from '../aktionen.js';
import { kannDirektSpeichern } from '../speicher.js';
import { speichern } from '../aktionen.js';

export function zeigeGrunddaten() {
  const d = K.daten;
  const wurzel = h('section', { class: 'seite' });

  const textFeld = (beschriftung, objekt, schluessel, breit = false) =>
    h(
      'label',
      { class: breit ? 'breit' : '' },
      beschriftung,
      h('input', {
        type: 'text',
        value: objekt[schluessel] ?? '',
        oninput: (e) => {
          objekt[schluessel] = e.target.value;
          K.aenderung();
        },
      }),
    );

  const schriftlich = h('input', {
    type: 'text',
    inputmode: 'decimal',
    value: String(d.gewichtSchriftlich).replace('.', ','),
    'aria-label': 'Gewichtung schriftlich in Prozent',
    oninput: (e) => {
      const z = zahlLesen(e.target.value);
      const ok = z !== null && !Number.isNaN(z) && z >= 0 && z <= 100;
      e.target.classList.toggle('fehler', !ok);
      if (ok) {
        d.gewichtSchriftlich = z;
        sonstige.textContent = `${String(100 - z).replace('.', ',')} %`;
        K.aenderung();
      }
    },
  });
  const sonstige = h('strong', {}, `${String(100 - d.gewichtSchriftlich).replace('.', ',')} %`);

  // ----- Schülerliste -----
  const tbody = h('tbody');
  function zeilen() {
    leeren(tbody);
    d.schueler.forEach((s, i) => {
      const vollj = h('span', { class: 'vollj' });
      const manuell = h('input', {
        type: 'checkbox',
        'aria-label': 'Volljährig (manuell)',
        checked: s.volljaehrig,
        onchange: (e) => {
          s.volljaehrig = e.target.checked;
          K.aenderung();
        },
      });
      const volljAnzeige = () => {
        const v = istVolljaehrig(s.geburtstag);
        if (v === null) {
          vollj.textContent = '';
          manuell.hidden = false;
          vollj.append(manuell);
        } else {
          manuell.hidden = true;
          leeren(vollj);
          vollj.textContent = v ? 'ja' : 'nein';
        }
      };
      volljAnzeige();
      const feld = (schluessel, extra = {}) =>
        h('input', {
          type: 'text',
          value: s[schluessel] ?? '',
          'aria-label': `${schluessel} Zeile ${i + 1}`,
          'data-sp': schluessel,
          oninput: (e) => {
            s[schluessel] = e.target.value;
            K.aenderung();
          },
          ...extra,
        });
      tbody.append(
        h(
          'tr',
          {},
          h('td', { class: 'zahl' }, String(i + 1)),
          h('td', {}, feld('name')),
          h('td', {}, feld('vorname')),
          h(
            'td',
            {},
            h(
              'select',
              {
                'aria-label': `Geschlecht Zeile ${i + 1}`,
                onchange: (e) => {
                  s.geschlecht = e.target.value;
                  K.aenderung();
                },
              },
              ['', 'm', 'w', 'd'].map((g) => h('option', { value: g, selected: s.geschlecht === g }, g || '–')),
            ),
          ),
          h(
            'td',
            {},
            h('input', {
              type: 'date',
              value: s.geburtstag || '',
              'aria-label': `Geburtstag Zeile ${i + 1}`,
              onchange: (e) => {
                s.geburtstag = e.target.value;
                leeren(vollj);
                volljAnzeige();
                K.aenderung();
              },
            }),
          ),
          h('td', { class: 'mitte' }, vollj),
          h(
            'td',
            { class: 'zeilenknoepfe' },
            h('button', { type: 'button', class: 'knopf klein', title: 'Nach oben', 'aria-label': 'Nach oben', disabled: i === 0, onclick: () => verschieben(i, -1) }, '↑'),
            h('button', { type: 'button', class: 'knopf klein', title: 'Nach unten', 'aria-label': 'Nach unten', disabled: i === d.schueler.length - 1, onclick: () => verschieben(i, 1) }, '↓'),
            h('button', { type: 'button', class: 'knopf klein gefahr', title: 'Zeile löschen', 'aria-label': 'Zeile löschen', onclick: () => loeschen(i) }, '✕'),
          ),
        ),
      );
    });
  }

  function verschieben(i, richtung) {
    const j = i + richtung;
    if (j < 0 || j >= d.schueler.length) return;
    [d.schueler[i], d.schueler[j]] = [d.schueler[j], d.schueler[i]];
    zeilen();
    K.aenderung();
  }

  async function loeschen(i) {
    const s = d.schueler[i];
    const hatNamen = s.name || s.vorname;
    const ja = await bestaetigen(
      'Zeile löschen',
      hatNamen
        ? `„${[s.vorname, s.name].filter(Boolean).join(' ')}“ wird mit allen Punkten und Noten aus dieser Notendatei gelöscht.`
        : 'Diese leere Zeile wird gelöscht.',
      'Löschen',
      true,
    );
    if (!ja) return;
    d.schueler.splice(i, 1);
    for (const ka of d.klassenarbeiten) delete ka.ergebnisse[s.id];
    for (const t of d.sonstige) delete t.eintraege[s.id];
    zeilen();
    K.aenderung();
  }

  zeilen();

  const passwortBereich = h('div', { class: 'knopfreihe' });
  function passwortZeichnen() {
    leeren(passwortBereich);
    fuege(
      passwortBereich,
      h('span', {}, K.passwort ? 'Passwortschutz: an (gilt ab dem nächsten Speichern)' : 'Passwortschutz: aus'),
      h('button', { type: 'button', class: 'knopf', onclick: async () => { await passwortSetzen(); passwortZeichnen(); } }, K.passwort ? 'Passwort ändern' : 'Passwort setzen'),
      K.passwort && h('button', { type: 'button', class: 'knopf', onclick: async () => { await passwortEntfernen(); passwortZeichnen(); } }, 'Passwort entfernen'),
    );
  }
  passwortZeichnen();

  wurzel.append(
    h('h1', {}, 'Grunddaten'),
    h(
      'div',
      { class: 'formular' },
      textFeld('Klasse', d.kopf, 'klasse'),
      textFeld('Lernfeld-Nr.', d.kopf, 'lernfeldNr'),
      textFeld('Lernfeld-Bezeichnung', d.kopf, 'lernfeldBez', true),
      textFeld('Schuljahr', d.kopf, 'schuljahr'),
    ),
    h('h2', {}, 'Gewichtung'),
    h('div', { class: 'formular' }, h('label', {}, 'Schriftlich in % (0 bis 100)', schriftlich), h('p', {}, 'Sonstige Leistung: ', sonstige)),
    h('h2', {}, 'Notendatei'),
    h(
      'p',
      { class: 'klein' },
      kannDirektSpeichern()
        ? 'Speichern überschreibt die geöffnete Datei direkt.'
        : 'Dieser Browser kann nicht direkt in die Datei speichern: „Speichern“ lädt die Datei herunter. Legen Sie sie an einem geschützten Ort ab.',
    ),
    h(
      'div',
      { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf primaer', onclick: () => speichern() }, 'Speichern'),
      h('button', { type: 'button', class: 'knopf', onclick: () => speichern({ neuWaehlen: true }) }, 'Speichern unter …'),
    ),
    passwortBereich,
    h('p', { class: 'warnung' }, 'Ein vergessenes Passwort kann nicht wiederhergestellt werden. Ohne Passwort ist die Datei nicht lesbar.'),
    h('h2', {}, 'Schüler:innen'),
    h(
      'div',
      { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf', onclick: () => { d.schueler.push(neuerSchueler()); zeilen(); K.aenderung(); } }, 'Zeile hinzufügen'),
      h('button', { type: 'button', class: 'knopf', onclick: () => { d.schueler = sortiereSchueler(d.schueler); zeilen(); K.aenderung(); } }, 'Alphabetisch sortieren'),
    ),
    h(
      'div',
      { class: 'tabelle-rahmen' },
      h(
        'table',
        { class: 'tabelle' },
        h('thead', {}, h('tr', {}, ['Nr.', 'Name', 'Vorname', 'm/w/d', 'Geburtstag', 'Volljährig', ''].map((t) => h('th', {}, t)))),
        tbody,
      ),
    ),
  );
  return { el: wurzel };
}
