// Anwesenheitsliste für Lernfeld-, Fach-, Kurs- und Lerngebietsklassen (SPEC 12.3).
// Aufbau wie im Sport: Termine als Spalten, Personen als Zeilen, ein Klick je Zelle.
// Gespeichert wird in den Fehlzeiten; Einträge aus Untis bleiben unangetastet und werden nur angezeigt.
import { h, leeren, fuege, toast, bestaetigen } from '../ui.js';
import { aktiveSchueler, anzeigename, datumDeutsch, heuteIso, neueId, neuerTermin } from '../modell.js';
import { FZ_STATUS, FZ_QUELLE } from '../fehlzeiten.js';
import { ansichtRegistrieren } from '../registry.js';
import { K } from '../kontext.js';

/** Zeichen der Liste. „.“ bedeutet anwesend und wird nicht gespeichert. */
export const ANWESENHEIT_ZEICHEN = {
  '.': { text: 'anwesend', status: null },
  E: { text: 'entschuldigt', status: 'entschuldigt' },
  A: { text: 'entschuldigt mit Attest', status: 'attest' },
  U: { text: 'nicht entschuldigt', status: 'nicht' },
  O: { text: 'offen', status: 'offen' },
};

const istLernfeld = () => K.daten && K.daten.fachtyp !== 'sport';

/** Von Hand gesetzte Fehlzeit dieser Person an diesem Datum (aus der Anwesenheitsliste). */
export function handEintrag(klasse, schuelerId, datum) {
  return klasse.fehlzeiten.find((f) => f.schuelerId === schuelerId && f.quelle === 'manuell'
    && f.datum === datum && f.stundeEintrag) || null;
}

/** Fehlzeiten anderer Herkunft (Untis) an diesem Datum. */
export function fremdEintraege(klasse, schuelerId, datum) {
  return klasse.fehlzeiten.filter((f) => f.schuelerId === schuelerId && f.datum === datum && !f.stundeEintrag);
}

/** Zeichen einer Zelle: eigener Eintrag vor Untis-Eintrag, sonst leer. */
export function zeichenVon(klasse, schuelerId, datum) {
  const eigen = handEintrag(klasse, schuelerId, datum);
  if (eigen) {
    const z = Object.entries(ANWESENHEIT_ZEICHEN).find(([, v]) => v.status === eigen.status);
    return { zeichen: z ? z[0] : 'O', eigen: true, fremd: false };
  }
  const fremd = fremdEintraege(klasse, schuelerId, datum);
  if (fremd.length > 0) {
    const z = Object.entries(ANWESENHEIT_ZEICHEN).find(([, v]) => v.status === fremd[0].status);
    return { zeichen: z ? z[0] : 'O', eigen: false, fremd: true };
  }
  return { zeichen: '', eigen: false, fremd: false };
}

/** Zeichen setzen. „.“ oder leer entfernt den eigenen Eintrag wieder. */
export function zeichenSetzen(klasse, schuelerId, datum, zeichen) {
  const vorhanden = handEintrag(klasse, schuelerId, datum);
  const ziel = ANWESENHEIT_ZEICHEN[zeichen];
  if (!ziel || ziel.status === null) {
    if (vorhanden) klasse.fehlzeiten.splice(klasse.fehlzeiten.indexOf(vorhanden), 1);
    return;
  }
  if (vorhanden) {
    vorhanden.status = ziel.status;
    return;
  }
  klasse.fehlzeiten.push({
    id: neueId(), schuelerId, datum, datumBis: '', zeitVon: '', zeitBis: '', stunde: null,
    std: 1, min: 0, fach: '', status: ziel.status, grund: '', quelle: 'manuell', notiz: '',
    zaehltNicht: false, stundeEintrag: true,
  });
}

/**
 * Spalten der Liste: alle Unterrichtstage der Klasse, nach Datum sortiert.
 * Quellen sind der Stundenplan (wie im Sport) und die angelegten Stunden der sonstigen Leistung.
 * Mehrere Stunden am selben Tag ergeben eine Spalte, weil Fehlzeiten tagesweise geführt werden.
 */
export function termineVon(klasse) {
  const tage = new Map();
  for (const e of klasse.stundenplan || []) {
    if (e.status === 'ok' && e.datum) tage.set(e.datum, { datum: e.datum, quelle: 'stundenplan' });
  }
  for (const t of klasse.sonstige || []) {
    if (t.datum) tage.set(t.datum, { datum: t.datum, quelle: 'stunde', name: t.name || '' });
  }
  return [...tage.values()].sort((a, b) => a.datum.localeCompare(b.datum));
}

function zeigeAnwesenheitLf() {
  const d = K.daten;
  const wurzel = h('section', { class: 'seite' });
  const inhalt = h('div');
  // „Anwesend“ wird nicht gespeichert, es ist dasselbe wie „keine Fehlzeit“.
  // Deshalb beginnt die Reihe bei leer und läuft über die Fehlzeit-Arten zurück.
  const reihenfolge = ['', 'E', 'A', 'U', 'O'];

  function render() {
    leeren(inhalt);
    const personen = aktiveSchueler(d);
    const termine = termineVon(d);

    fuege(inhalt, h('div', { class: 'knopfreihe' },
      h('button', {
        type: 'button', class: 'knopf primaer', id: 'anw-neu',
        onclick: () => {
          const t = neuerTermin(heuteIso());
          d.sonstige.push(t);
          K.aenderung();
          render();
          toast('Stunde für heute angelegt.');
        },
      }, '+ Stunde (heute)'),
      h('span', { class: 'klein' }, `${termine.length} Unterrichtstag(e). Ein Klick wechselt der Reihe nach: anwesend, entschuldigt, mit Attest, nicht entschuldigt, offen.`)));

    if (personen.length === 0) {
      return inhalt.append(h('p', { class: 'hinweis' }, 'Bitte zuerst unter „Grunddaten“ Schüler:innen eintragen.'));
    }
    if (termine.length === 0) {
      return inhalt.append(h('p', { class: 'hinweis' }, 'Noch keine Unterrichtstage. Laden Sie unter „Stundenplan“ den Plan aus Untis, dann erscheinen alle Termine dieser Klasse. Oder legen Sie oben eine einzelne Stunde an.'));
    }

    const kopf = h('tr', {}, h('th', { class: 'links' }, 'Name'),
      termine.map((t) => h('th', { title: t.name || '' },
        h('div', {}, datumDeutsch(t.datum).slice(0, 6)),
        h('button', {
          type: 'button', class: 'knopf klein', title: 'Alle an diesem Tag auf anwesend setzen',
          onclick: async () => {
            if (!(await bestaetigen('Alle anwesend', `Am ${datumDeutsch(t.datum)} werden alle ${personen.length} Personen auf anwesend gesetzt. Eigene Einträge dieses Tages werden entfernt.`, 'Alle anwesend'))) return;
            for (const s of personen) zeichenSetzen(d, s.id, t.datum, '.');
            K.aenderung();
            render();
          },
        }, '✓'))),
      h('th', {}, 'Fehlt'));

    const zeilen = personen.map((s) => {
      const zellen = termine.map((t) => {
        const feld = h('button', { type: 'button', class: 'knopf zelle' });
        const zeichnen = () => {
          const z = zeichenVon(d, s.id, t.datum);
          feld.textContent = z.zeichen || '·';
          feld.classList.toggle('leer', !z.zeichen);
          feld.classList.toggle('fremd', z.fremd);
          feld.classList.toggle('punkt', z.zeichen === '.');
          feld.title = `${anzeigename(s)}, ${datumDeutsch(t.datum)}: ${z.zeichen ? ANWESENHEIT_ZEICHEN[z.zeichen]?.text : 'nichts eingetragen'}`
            + (z.fremd ? ` (aus ${FZ_QUELLE[fremdEintraege(d, s.id, t.datum)[0]?.quelle] || 'Import'}, nicht änderbar)` : '');
          feld.setAttribute('aria-label', feld.title);
        };
        feld.addEventListener('click', () => {
          const jetzt = zeichenVon(d, s.id, t.datum);
          if (jetzt.fremd && !jetzt.eigen) {
            toast('Dieser Eintrag stammt aus einem Import. Ändern Sie ihn unter „Fehlzeiten“.');
            return;
          }
          const i = reihenfolge.indexOf(jetzt.zeichen === '.' ? '' : jetzt.zeichen);
          zeichenSetzen(d, s.id, t.datum, reihenfolge[(i + 1) % reihenfolge.length]);
          K.aenderung();
          zeichnen();
          summeZeichnen();
        });
        zeichnen();
        return h('td', { class: 'mitte' }, feld);
      });
      const summe = h('td', { class: 'zahl' });
      const summeZeichnen = () => {
        const n = termine.filter((t) => {
          const z = zeichenVon(d, s.id, t.datum);
          return z.zeichen && z.zeichen !== '.';
        }).length;
        summe.textContent = n === 0 ? '' : String(n);
      };
      summeZeichnen();
      return h('tr', {}, h('td', { class: 'links' }, anzeigename(s)), zellen, summe);
    });

    fuege(inhalt,
      h('div', { class: 'tabelle-rahmen' },
        h('table', { class: 'tabelle eingabe anwesenheit-lf' }, h('thead', {}, kopf), h('tbody', {}, zeilen))),
      h('p', { class: 'klein' }, '· anwesend (nichts eingetragen) · E entschuldigt · A mit Attest · U nicht entschuldigt · O offen. Grau hinterlegte Zeichen stammen aus einem Import und werden unter „Fehlzeiten“ geändert. Die Spalte „Fehlt“ zählt die Tage mit Fehlzeit.'));
  }

  fuege(wurzel, h('h1', {}, 'Anwesenheit'), inhalt);
  render();
  return { el: wurzel, update: () => {} };
}

ansichtRegistrieren('anwesenheit-lf', {
  text: 'Anwesenheit',
  bauen: zeigeAnwesenheitLf,
  klasse: true,
  nurWenn: istLernfeld,
  reihe: 2.05,
});
