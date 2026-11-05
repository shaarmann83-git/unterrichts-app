// Personenübersicht (SPEC 8.4, 8.5 und Abschnitte der weiteren Bereiche): alles zu einer Person.
import { K } from '../kontext.js';
import { h, bestaetigen, avatar, meldung, toast, leeren } from '../ui.js';
import { aktiveSchueler, anzeigename, datumDeutsch, heuteIso } from '../modell.js';
import { ergebnisKA, gesamtpunkte, gesamtPerson, formatZahl, formatKurz, NOTEN_WORTE, prozentSL, bewertungText } from '../rechnen.js';
import { fotoErstellen, fotoAusLetztem, letztesBildVorhanden } from '../foto.js';
import { passwortSetzen } from '../aktionen.js';
import { ansichtRegistrieren } from '../registry.js';
import { sportPersonAbschnitt } from './sport-person.js';

// Weitere Bereiche (Dalton, Fehlzeiten, Listen) hängen ihren Abschnitt hier ein: fn(klasse, person) -> Node | null
const abschnitte = [];
export function personAbschnittRegistrieren(reihe, fn) {
  abschnitte.push({ reihe, fn });
  abschnitte.sort((a, b) => a.reihe - b.reihe);
}

function feld(beschriftung, objekt, schluessel, typ = 'text') {
  return h('label', {}, beschriftung, h('input', { type: typ, value: objekt[schluessel] ?? '', oninput: (e) => { objekt[schluessel] = e.target.value; K.aenderung(); } }));
}

function fotoAbschnitt(d, s) {
  const bereich = h('div', { class: 'foto-block' });
  function zeichnen() {
    leeren(bereich);
    const einw = h('input', {
      type: 'checkbox',
      id: 'foto-einwilligung',
      checked: !!s.fotoEinwilligung,
      onchange: async (e) => {
        if (e.target.checked) {
          s.fotoEinwilligung = { datum: heuteIso() };
        } else {
          if (s.foto) {
            const ja = await bestaetigen('Einwilligung entfernen', 'Ohne Einwilligung darf kein Foto gespeichert sein. Das Foto wird gelöscht.', 'Foto löschen', true);
            if (!ja) {
              e.target.checked = true;
              return;
            }
            s.foto = null;
          }
          s.fotoEinwilligung = null;
        }
        K.aenderung();
        zeichnen();
      },
    });
    const wahl = (kamera) => {
      const eingabe = h('input', { type: 'file', accept: 'image/*', hidden: true });
      if (kamera) eingabe.setAttribute('capture', 'user');
      eingabe.addEventListener('change', async () => {
        const datei = eingabe.files[0];
        if (!datei) return;
        if (!K.passwort) {
          await meldung('Passwort nötig', 'Fotos dürfen nur in einer passwortgeschützten Notendatei gespeichert werden. Bitte setzen Sie jetzt ein Passwort.');
          await passwortSetzen();
          if (!K.passwort) return;
        }
        const url = await fotoErstellen(datei);
        if (!url) return;
        s.foto = { daten: url };
        K.aenderung();
        K.neuZeichnen();
      });
      return eingabe;
    };
    const dateiEingabe = wahl(false);
    const kameraEingabe = wahl(true);
    bereich.append(
      h('label', { class: 'schalter' }, einw, ` Einwilligung liegt vor${s.fotoEinwilligung ? ` (seit ${datumDeutsch(s.fotoEinwilligung.datum)})` : ''}`),
      h('div', { class: 'knopfreihe' },
        h('button', { type: 'button', class: 'knopf', disabled: !s.fotoEinwilligung, id: 'foto-kamera', onclick: () => kameraEingabe.click() }, 'Foto aufnehmen'),
        h('button', { type: 'button', class: 'knopf', disabled: !s.fotoEinwilligung, id: 'foto-datei', onclick: () => dateiEingabe.click() }, 'Datei wählen'),
        letztesBildVorhanden() && h('button', { type: 'button', class: 'knopf', disabled: !s.fotoEinwilligung, id: 'foto-wieder',
          title: 'Dasselbe Bild wie zuletzt, nur ein anderer Ausschnitt. Praktisch bei Gruppenfotos.',
          onclick: async () => {
            const url = await fotoAusLetztem();
            if (!url) return;
            s.foto = { daten: url };
            K.aenderung();
            K.neuZeichnen();
          } }, 'Gleiches Bild, anderer Ausschnitt'),
        s.foto && h('button', { type: 'button', class: 'knopf gefahr', id: 'foto-loeschen', onclick: async () => {
          if (await bestaetigen('Foto löschen', 'Das Foto wird aus dem Notenbuch gelöscht.', 'Löschen', true)) {
            s.foto = null;
            K.aenderung();
            K.neuZeichnen();
          }
        } }, 'Foto löschen'),
        dateiEingabe,
        kameraEingabe,
      ),
      !s.fotoEinwilligung && h('p', { class: 'klein' }, 'Ohne Einwilligung kann kein Foto gespeichert werden.'),
    );
  }
  zeichnen();
  return h('div', {}, h('h2', {}, 'Foto'), bereich, h('p', { class: 'klein' }, 'Das Foto steht nur in der Notendatei, nie in Excel-Export oder Druck.'));
}

function notenAbschnitt(d, s) {
  const g = gesamtPerson(d, s.id);
  const kaZeilen = d.klassenarbeiten.map((ka, i) => {
    const e = ergebnisKA(ka, s.id, d);
    const t = ka.teilnahme?.[s.id]?.status;
    return h('tr', {}, h('td', {}, `KA ${i + 1}`), h('td', {}, datumDeutsch(ka.datum)),
      h('td', { class: 'zahl' }, e.summe === null ? '' : `${formatKurz(e.summe)}/${formatKurz(gesamtpunkte(ka))}`),
      h('td', { class: 'zahl' }, e.prozent === null ? '' : formatZahl(e.prozent, 1)),
      h('td', { class: 'mitte' }, e.attest ? 'Attest' : e.note ?? ''),
      h('td', { class: 'links' }, t || ''));
  });
  return h('div', {},
    h('h2', {}, 'Noten'),
    h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle klein-tabelle' },
      h('thead', {}, h('tr', {}, ['Arbeit', 'Datum', 'Punkte', '%', 'Note', 'Teilnahme'].map((t) => h('th', {}, t)))), h('tbody', {}, kaZeilen))),
    h('p', { class: 'summe-zeile' },
      `Ø KA: ${g.oKA === null ? '–' : formatZahl(g.oKA, 2)} % · Ø sonstige Leistung: ${g.oSL === null ? '–' : formatZahl(g.oSL, 2)} % (${g.anzahlSL} Noten) · Gesamt: `,
      h('strong', {}, g.gesamtProzent === null ? '–' : `${formatZahl(g.gesamtProzent, 2)} % (${bewertungText(g.gesamtNote, d)})`)),
    h('a', { href: `#/sl/person/${s.id}`, class: 'knopf' }, 'Sonstige Leistung dieser Person'),
  );
}

export function zeigePerson(params) {
  const d = K.daten;
  const personen = aktiveSchueler(d);
  const wurzel = h('section', { class: 'seite' });
  if (personen.length === 0) {
    wurzel.append(h('h1', {}, 'Person'), h('p', { class: 'hinweis' }, 'Keine Schüler:innen eingetragen.'));
    return { el: wurzel };
  }
  let s = d.schueler.find((x) => x.id === params[0]);
  if (!s || s.archiviert) s = personen[0];
  const pos = personen.indexOf(s);
  const gehe = (delta) => K.navigiere(`person/${personen[(pos + delta + personen.length) % personen.length].id}`);
  wurzel.append(
    h('div', { class: 'einzel-kopf' },
      h('button', { type: 'button', class: 'knopf gross', onclick: () => gehe(-1) }, '‹ Zurück'),
      h('select', { 'aria-label': 'Person wählen', onchange: (e) => K.navigiere(`person/${e.target.value}`) },
        personen.map((p) => h('option', { value: p.id, selected: p.id === s.id }, [p.name, p.vorname].filter(Boolean).join(', ')))),
      h('button', { type: 'button', class: 'knopf gross', onclick: () => gehe(1) }, 'Weiter ›'),
    ),
    h('div', { class: 'person-kopf' }, avatar(d, s, 'gross'), h('h1', {}, anzeigename(s))),
    h('div', { class: 'formular' }, feld('Geburtstag', s, 'geburtstag', 'date'), feld('Untis-ID', s, 'untisId')),
  );
  wurzel.append(h('div', { class: 'knopfreihe' }, h('a', { class: 'knopf', href: '#/besprechung', onclick: () => { /* Person wird im Besprechungsmodus bewusst neu gewählt */ } }, 'Besprechungsmodus')));
  if (d.bereiche.duales) {
    wurzel.append(h('h2', {}, 'Ausbildungsbetrieb'),
      h('div', { class: 'formular' }, feld('Betrieb', s.betrieb, 'name'), feld('Ansprechperson', s.betrieb, 'ansprechperson'), feld('Telefon', s.betrieb, 'telefon', 'tel'), feld('E-Mail', s.betrieb, 'email', 'email'), feld('Notiz', s.betrieb, 'notiz')));
  }
  if (d.bereiche.fotos) wurzel.append(fotoAbschnitt(d, s));
  wurzel.append(d.fachtyp === 'sport' ? sportPersonAbschnitt(d, s) : notenAbschnitt(d, s));
  for (const a of abschnitte) {
    const el = a.fn(d, s);
    if (el) wurzel.append(el);
  }
  return { el: wurzel };
}

ansichtRegistrieren('person', { text: 'Person', bauen: zeigePerson, klasse: true, keinMenue: true });
