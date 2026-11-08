// Kopfbilder für den Ausdruck (Protokoll zur Klassenarbeit): wählen, ansehen, entfernen.
import { K } from '../kontext.js';
import { h } from '../ui.js';
import { dateiWaehlen } from '../speicher.js';
import { kopfbildAus } from '../foto.js';

/** Kopfbilder für den Ausdruck wählen, ansehen und entfernen. */
export function kopfbilderReihe(buch, nachher = () => K.neuZeichnen()) {
  const dr = (buch.einstellungen.druck ||= { kopfLinks: '', kopfRechts: '' });
  const feld = (schluessel, text) => {
    const bild = dr[schluessel]
      ? h('img', { src: dr[schluessel], alt: '', style: 'max-height:60px;max-width:180px;vertical-align:middle' })
      : h('span', { class: 'klein' }, 'kein Bild');
    return h('div', { class: 'knopfreihe' },
      h('span', {}, `${text}: `), bild,
      h('button', { type: 'button', class: 'knopf klein', onclick: async () => {
        const datei = await dateiWaehlen('image/*');
        if (!datei) return;
        const url = await kopfbildAus(datei);
        if (!url) return;
        dr[schluessel] = url;
        K.aenderung();
        nachher();
      } }, dr[schluessel] ? 'Bild ersetzen' : 'Bild wählen'),
      dr[schluessel] && h('button', { type: 'button', class: 'knopf klein gefahr', onclick: () => { dr[schluessel] = ''; K.aenderung(); nachher(); } }, 'Entfernen'));
  };
  return h('div', {}, feld('kopfLinks', 'Erstes Bild (oder ganze Breite)'), feld('kopfRechts', 'Zweites Bild (rechts, optional)'));
}

