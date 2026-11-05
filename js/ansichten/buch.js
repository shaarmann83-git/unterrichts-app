// Notenbuch: Kacheln je Klasse und Aktionen für das ganze Notenbuch (SPEC 8.1, 8.7).
import { K } from '../kontext.js';
import { h, bestaetigen, inhaltDialog, meldung, toast, fuege, auswahl, auswahlMitFreitext } from '../ui.js';
import { neueKlasse, fachZeile, BEZEICHNUNGEN, klasseKopieren, aktiveSchueler, neueId, pruefeKlasse, buchHatFotos } from '../modell.js';
import {
  passwortSetzen,
  passwortEntfernen,
  speichern,
  sicherungExportieren,
  sicherungImportieren,
  excelImportieren,
  dateiSchliessen,
} from '../aktionen.js';
import { dateiOeffnen, herunterladen, dateiWaehlen } from '../speicher.js';
import { kopfbildAus } from '../foto.js';
import { ausDateitext, istVerschluesselt } from '../krypto.js';
import { passwortFrage } from '../ui.js';
import { alleAlsExcel } from '../excel.js';
import { jetztLeiste } from './stundenplan.js';

function klassenFormular(k = { kopf: { klasse: '', lernfeldNr: '', lernfeldBez: '', schuljahr: '', fachLabel: 'Lernfeld' }, fachtyp: null }) {
  const feld = (beschriftung, wert, platzhalter = '') =>
    h('label', {}, beschriftung, h('input', { type: 'text', value: wert, placeholder: platzhalter }));
  const fach = h('select', { 'aria-label': 'Fachtyp', id: 'klasse-fachtyp' }, [['lernfeld', 'Lernfeld/Fach'], ['sport', 'Sport']].map(([w, t]) => h('option', { value: w }, t)));
  // „Lernfeld“ passt nicht überall (z. B. Politik). Deshalb Auswahl mit eigenem Text.
  const label = k.kopf.fachLabel || 'Lernfeld';
  const bez = auswahlMitFreitext({ werte: BEZEICHNUNGEN, wert: label, bezeichnung: 'Bezeichnung' });
  const felder = [feld('Klasse', k.kopf.klasse, 'z. B. FIA 25'), feld(`${label}-Nr.`, k.kopf.lernfeldNr), feld(`${label}-Bezeichnung`, k.kopf.lernfeldBez), feld('Schuljahr', k.kopf.schuljahr, 'z. B. 2025/26')];
  felder.splice(1, 0, h('label', {}, 'Bezeichnung', bez.el));
  // Der Fachtyp wird nur beim Anlegen gewählt (danach in den Grunddaten)
  if (k.fachtyp === null) felder.push(h('label', {}, 'Fachtyp', fach));
  return { felder, lesen: () => {
    const [klasseName, nr, bezText, jahr] = [felder[0], felder[2], felder[3], felder[4]].map((l) => l.querySelector('input').value.trim());
    return { klasse: klasseName, fachLabel: bez.lesen() || 'Lernfeld', lernfeldNr: nr, lernfeldBez: bezText, schuljahr: jahr, ...(k.fachtyp === null ? { fachtyp: fach.value } : {}) };
  } };
}

async function klasseFragen(titel, klasse, okText) {
  const f = klassenFormular(klasse);
  const ok = await inhaltDialog(titel, f.felder, [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: okText, wert: true, klasse: 'knopf primaer' },
  ]);
  return ok ? f.lesen() : null;
}

export async function klasseAusAndererDateiUebernehmen() {
  const d = await dateiOeffnen();
  if (!d) return;
  let buch;
  try {
    const pw = istVerschluesselt(d.text) ? await passwortFrage('Passwort eingeben', { hinweis: `Die Datei „${d.name}“ ist passwortgeschützt.` }) : '';
    if (pw === null) return;
    buch = await ausDateitext(d.text, pw);
  } catch (e) {
    await meldung('Öffnen nicht möglich', e.message);
    return;
  }
  if (buch.klassen.length === 0) return meldung('Keine Klasse', 'Diese Notendatei enthält keine Klassen.');
  const wahl = h(
    'select',
    { 'aria-label': 'Klasse auswählen' },
    buch.klassen.map((k, i) => h('option', { value: i }, [k.kopf.klasse || 'Ohne Namen', fachZeile(k.kopf), k.kopf.schuljahr].filter(Boolean).join(' · '))),
  );
  const ok = await inhaltDialog('Klasse übernehmen', [h('label', {}, 'Welche Klasse soll übernommen werden?', wahl)], [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: 'Übernehmen', wert: true, klasse: 'knopf primaer' },
  ]);
  if (!ok) return;
  const neu = pruefeKlasse(JSON.parse(JSON.stringify(buch.klassen[Number(wahl.value)])));
  neu.id = neueId();
  if (!K.passwort && neu.schueler.some((s) => s.foto)) {
    await meldung('Passwort nötig', 'Die Klasse enthält Fotos. Das Notenbuch braucht dafür ein Passwort.');
  }
  K.buch.klassen.push(neu);
  K.aenderung();
  K.neuZeichnen();
  toast('Klasse übernommen.');
}

/** Kopfbilder für den Ausdruck wählen, ansehen und entfernen. */
function kopfbilderReihe(buch) {
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
        K.neuZeichnen();
      } }, dr[schluessel] ? 'Bild ersetzen' : 'Bild wählen'),
      dr[schluessel] && h('button', { type: 'button', class: 'knopf klein gefahr', onclick: () => { dr[schluessel] = ''; K.aenderung(); K.neuZeichnen(); } }, 'Entfernen'));
  };
  return h('div', {}, feld('kopfLinks', 'Links'), feld('kopfRechts', 'Rechts'));
}

export function zeigeBuch() {
  const buch = K.buch;
  const wurzel = h('section', { class: 'seite' });
  const kacheln = h('div', { class: 'kacheln' });

  function kachelnZeichnen() {
    kacheln.replaceChildren();
    for (const k of buch.klassen) {
      const titel = k.kopf.klasse || 'Ohne Namen';
      kacheln.append(
        h(
          'div',
          { class: 'kachel' },
          h(
            'a',
            { href: k.fachtyp === 'sport' ? '#/nachstunde' : '#/gesamt', class: 'kachel-link', onclick: () => { K.klasseId = k.id; } },
            h('strong', {}, titel, k.fachtyp === 'sport' && h('span', { class: 'abzeichen' }, 'Sport')),
            h('div', {}, fachZeile(k.kopf, { leer: 'Kein Fach angegeben' })),
            h('div', { class: 'klein' }, `Schuljahr ${k.kopf.schuljahr || '–'} · ${aktiveSchueler(k).length} Schüler:innen`),
          ),
          h(
            'div',
            { class: 'kachel-knoepfe' },
            h('button', { type: 'button', class: 'knopf klein', onclick: async () => {
              const neu = await klasseFragen('Klasse umbenennen', k, 'Speichern');
              if (!neu) return;
              Object.assign(k.kopf, neu);
              K.aenderung();
              K.neuZeichnen();
            } }, 'Umbenennen'),
            h('button', { type: 'button', class: 'knopf klein', onclick: async () => {
              // Eigene Listen werden auf Wunsch mitkopiert (nur die Listen, nie die Einträge)
              let mitListen = true;
              if (k.listen.length > 0) {
                const wahl = await auswahl('Klasse kopieren', `Die Klasse hat ${k.listen.length} eigene Liste(n). Sollen die Listen (ohne Einträge) mit in die Kopie übernommen werden?`, [
                  { text: 'Abbrechen', wert: 'abbruch', abbruch: true },
                  { text: 'Ohne Listen', wert: 'ohne' },
                  { text: 'Mit Listen', wert: 'mit', klasse: 'knopf primaer' },
                ]);
                if (wahl === 'abbruch') return;
                mitListen = wahl === 'mit';
              }
              const kopie = klasseKopieren(k, { listenMitnehmen: mitListen });
              buch.klassen.push(kopie);
              K.aenderung();
              K.neuZeichnen();
              toast('Klasse kopiert (ohne Noten, Fehlzeiten und Dalton-Einträge).');
            } }, 'Kopieren'),
            h('button', { type: 'button', class: 'knopf klein gefahr', onclick: async () => {
              const ja = await bestaetigen('Klasse löschen', `Die Klasse „${titel}“ wird mit allen Schüler:innen, Noten, Fehlzeiten und Einträgen aus dem Notenbuch gelöscht.`, 'Löschen', true);
              if (!ja) return;
              buch.klassen.splice(buch.klassen.indexOf(k), 1);
              if (K.klasseId === k.id) K.klasseId = null;
              K.aenderung();
              K.neuZeichnen();
            } }, 'Löschen'),
          ),
        ),
      );
    }
    if (buch.klassen.length === 0) kacheln.append(h('p', { class: 'hinweis' }, 'Dieses Notenbuch hat noch keine Klasse.'));
  }
  kachelnZeichnen();

  const passwortZeile = h('p', {}, K.passwort ? 'Passwortschutz: an' : 'Passwortschutz: aus (Arbeitskopie im Browser ungeschützt)');

  fuege(
    wurzel,
    jetztLeiste(),
    h('h1', {}, 'Notenbuch'),
    h('p', { class: 'klein' }, K.dateiname || 'noch nicht gespeichert'),
    h('div', { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf primaer', onclick: async () => {
        const vorgabeJahr = buch.schuljahr || buch.klassen.at(-1)?.kopf.schuljahr || '';
        const f = await klasseFragen('Neue Klasse', { kopf: { klasse: '', lernfeldNr: '', lernfeldBez: '', schuljahr: vorgabeJahr }, fachtyp: null }, 'Anlegen');
        if (!f) return;
        const k = neueKlasse(f);
        buch.klassen.push(k);
        K.klasseId = k.id;
        K.aenderung();
        K.navigiere('grunddaten');
        K.neuZeichnen();
      } }, '+ Neue Klasse'),
      h('button', { type: 'button', class: 'knopf', onclick: excelImportieren }, 'Excel-Vorlage als neue Klasse importieren'),
      h('button', { type: 'button', class: 'knopf', onclick: klasseAusAndererDateiUebernehmen }, 'Klasse aus anderer Notendatei übernehmen'),
    ),
    kacheln,
    h('h2', {}, 'Speichern und Sicherung'),
    h('div', { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf primaer', onclick: () => speichern() }, 'Speichern'),
      h('button', { type: 'button', class: 'knopf', onclick: () => speichern({ neuWaehlen: true }) }, 'Speichern unter …'),
      h('button', { type: 'button', class: 'knopf', onclick: sicherungExportieren }, 'Sicherung exportieren'),
      h('button', { type: 'button', class: 'knopf', onclick: sicherungImportieren }, 'Sicherung importieren'),
      h('button', { type: 'button', class: 'knopf', onclick: () => {
        herunterladen(alleAlsExcel(buch), `${(K.dateiname || 'Notenbuch').replace(/\.noten$/, '')}_komplett.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } }, 'Alles als Excel exportieren'),
    ),
    h('p', { class: 'klein' }, 'Excel-Export enthält keine Fotos. Die Sicherung ist eine vollständige Notendatei.'),
    h('h2', {}, 'Kopfbilder für den Ausdruck'),
    h('p', { class: 'klein' }, 'Diese Bilder stehen oben auf dem Protokoll zur Klassenarbeit, links und rechts. Nutzen Sie dafür Ihr Schullogo oder ein Foto. Die Bilder werden auf höchstens 600 × 180 Punkte verkleinert und in der Notendatei gespeichert.'),
    kopfbilderReihe(buch),
    h('h2', {}, 'Passwort'),
    passwortZeile,
    h('div', { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf', onclick: async () => { await passwortSetzen(); K.neuZeichnen(); } }, K.passwort ? 'Passwort ändern' : 'Passwort setzen'),
      K.passwort && h('button', { type: 'button', class: 'knopf', onclick: async () => { await passwortEntfernen(); K.neuZeichnen(); } }, 'Passwort entfernen'),
    ),
    h('p', { class: 'warnung' }, 'Ein vergessenes Passwort kann nicht wiederhergestellt werden. Ohne Passwort ist die Datei nicht lesbar.'),
    buchHatFotos(buch) && h('p', { class: 'klein' }, 'Das Notenbuch enthält Fotos: Speichern und Sicherung sind nur mit Passwort möglich.'),
    h('div', { class: 'knopfreihe' }, h('button', { type: 'button', class: 'knopf', onclick: dateiSchliessen }, 'Notendatei schließen')),
  );
  return { el: wurzel };
}
