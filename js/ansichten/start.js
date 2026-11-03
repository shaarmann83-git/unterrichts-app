import { K } from '../kontext.js';
import { h, leeren, bestaetigen, toast } from '../ui.js';
import { jetztLeiste, stundenplanLaden } from './stundenplan.js';
import {
  neueDateiAnlegen,
  dateiOeffnenAktion,
  arbeitskopieOeffnen,
  excelImportieren,
  dateiSchliessen,
} from '../aktionen.js';
import {
  arbeitskopien,
  arbeitskopieLoeschen,
  alleLokalenDatenLoeschen,
  einstellungen,
  einstellungSetzen,
} from '../speicher.js';

export function zeigeStart() {
  const liste = h('div', { class: 'karte-liste' });
  const wurzel = h('section', { class: 'seite' });

  async function listeFuellen() {
    leeren(liste);
    let kopien = [];
    try {
      kopien = await arbeitskopien();
    } catch {
      /* ohne lokalen Speicher keine Liste */
    }
    if (!kopien.length) {
      liste.append(h('p', { class: 'hinweis' }, 'Noch nichts auf diesem Gerät. Öffnen Sie eine Notendatei oder legen Sie eine neue an.'));
      return;
    }
    for (const k of kopien) {
      liste.append(
        h(
          'div',
          { class: 'karte' },
          h('div', {}, h('strong', {}, k.titel), h('div', { class: 'klein' }, `${k.dateiname || 'ohne Dateiname'}${k.huelle ? ' · verschlüsselt' : ' · ungeschützt'} · Stand ${new Date(k.zeit).toLocaleString('de-DE')}${k.geaendert ? ' · nicht in Datei gespeichert' : ''}`)),
          h(
            'div',
            { class: 'karte-knoepfe' },
            h('button', { type: 'button', class: 'knopf', onclick: () => arbeitskopieOeffnen(k.id) }, 'Öffnen'),
            h(
              'button',
              {
                type: 'button',
                class: 'knopf gefahr',
                onclick: async () => {
                  if (await bestaetigen('Lokale Kopie löschen', `Die lokale Kopie „${k.titel}“ wird von diesem Gerät gelöscht. Die Notendatei bleibt unberührt.`, 'Löschen', true)) {
                    await arbeitskopieLoeschen(k.id);
                    listeFuellen();
                  }
                },
              },
              'Löschen',
            ),
          ),
        ),
      );
    }
  }

  const keinSpeicher = h('input', {
    type: 'checkbox',
    id: 'kein-speicher',
    checked: einstellungen().keineDatenBehalten,
    onchange: async (e) => {
      einstellungSetzen('keineDatenBehalten', e.target.checked);
      if (e.target.checked) {
        for (const k of await arbeitskopien().catch(() => [])) await arbeitskopieLoeschen(k.id);
        toast('Lokale Kopien gelöscht. Es wird nichts mehr auf diesem Gerät gespeichert.');
        listeFuellen();
      }
    },
  });

  wurzel.append(
    ...[jetztLeiste()].filter(Boolean),
    h('h1', {}, 'Notenverwaltung'),
    h(
      'div',
      { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf primaer gross', onclick: neueDateiAnlegen }, 'Neue Notendatei'),
      h('button', { type: 'button', class: 'knopf gross', onclick: dateiOeffnenAktion }, 'Notendatei öffnen'),
      h('button', { type: 'button', class: 'knopf gross', onclick: excelImportieren }, 'Excel-Vorlage importieren'),
      K.buch && h('button', { type: 'button', class: 'knopf gross', id: 'start-stundenplan', onclick: stundenplanLaden }, 'Stundenplan laden (.ics)'),
      K.buch && h('button', { type: 'button', class: 'knopf gross', onclick: dateiSchliessen }, 'Aktuelle Datei schließen'),
    ),
    h('h2', {}, 'Zuletzt geöffnet (lokale Arbeitskopien)'),
    liste,
    h('h2', {}, 'Datenschutz'),
    h(
      'p',
      {},
      'Alle Daten bleiben in Ihrer Notendatei und im Browser dieses Geräts. Es werden keine Daten an Server gesendet. Legen Sie die Notendatei an einem geschützten Ort ab (verschlüsselter Ordner oder Schul-Cloud) und vergeben Sie bei Bedarf ein Passwort.',
    ),
    h('label', { class: 'schalter' }, keinSpeicher, ' Keine Daten auf diesem Gerät behalten (keine Arbeitskopie im Browser)'),
    h(
      'p',
      { class: 'klein' },
      'Hinweis: Mit Passwort wird auch die lokale Arbeitskopie im Browser verschlüsselt. Ohne Passwort ist sie ungeschützt. Auf fremden oder gemeinsam genutzten Geräten sollte der Schalter eingeschaltet sein.',
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'knopf gefahr',
        onclick: async () => {
          if (await bestaetigen('Alle lokalen Daten löschen', 'Alle Arbeitskopien und Einstellungen auf diesem Gerät werden gelöscht. Notendateien, die Sie gespeichert haben, bleiben erhalten. Nicht gespeicherte Änderungen gehen verloren.', 'Alles löschen', true)) {
            await alleLokalenDatenLoeschen();
            toast('Alle lokalen Daten auf diesem Gerät wurden gelöscht.');
            listeFuellen();
          }
        },
      },
      'Alle lokalen Daten auf diesem Gerät löschen',
    ),
  );
  listeFuellen();
  return { el: wurzel };
}
