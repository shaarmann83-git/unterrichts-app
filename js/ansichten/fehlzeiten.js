// Fehlzeiten einer Klasse (SPEC 8.6): Summen, Liste, manuelle Eingabe, Untis-Import. Gesundheitsangaben nur hier und in der Personenübersicht.
import { K } from '../kontext.js';
import { h, leeren, bestaetigen, inhaltDialog, fuege } from '../ui.js';
import { neueId, aktiveSchueler, anzeigename, datumDeutsch, heuteIso } from '../modell.js';
import { FZ_STATUS, FZ_QUELLE, fehlzeitenSummen, fehlzeitenVon } from '../fehlzeiten.js';
import { zahlLesen, formatKurz } from '../rechnen.js';
import { dateienAlsBytes } from '../speicher.js';
import { untisAbgleichStarten } from './untis-dialog.js';
import { ansichtRegistrieren } from '../registry.js';
import { personAbschnittRegistrieren } from './person.js';

export async function untisListeLaden(klasse) {
  const dateien = await dateienAlsBytes('.xls,.xlsx,.csv');
  if (dateien.length === 0) return;
  await untisAbgleichStarten(dateien.map((d) => ({ bytes: d.text, name: d.name })), { klasse });
}

/** Dialog „Fehlzeit manuell erfassen“. */
export async function fehlzeitManuell(klasse, vorgabePerson = null) {
  const personen = aktiveSchueler(klasse);
  if (personen.length === 0) return false;
  const p = h('select', { 'aria-label': 'Person' }, personen.map((s) => h('option', { value: s.id, selected: s.id === vorgabePerson }, `${s.name}, ${s.vorname}`)));
  const datum = h('input', { type: 'date', value: heuteIso() });
  const stunde = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'optional' });
  const std = h('input', { type: 'text', inputmode: 'decimal', value: '1' });
  const min = h('input', { type: 'text', inputmode: 'numeric', value: '0' });
  const fach = h('input', { type: 'text', placeholder: 'optional' });
  const status = h('select', { 'aria-label': 'Status' }, Object.entries(FZ_STATUS).map(([w, t]) => h('option', { value: w, selected: w === 'offen' }, t)));
  const grund = h('input', { type: 'text', placeholder: 'z. B. krank (Gesundheitsangabe)' });
  const notiz = h('input', { type: 'text' });
  const ok = await inhaltDialog('Fehlzeit erfassen', [
    h('label', {}, 'Person', p), h('label', {}, 'Datum', datum), h('label', {}, 'Stundennummer', stunde),
    h('label', {}, 'Fehlstunden', std), h('label', {}, 'Fehlminuten', min), h('label', {}, 'Fach', fach),
    h('label', {}, 'Status', status), h('label', {}, 'Abwesenheitsgrund', grund), h('label', {}, 'Notiz', notiz),
  ], [{ text: 'Abbrechen', wert: false, abbruch: true }, { text: 'Speichern', wert: true, klasse: 'knopf primaer' }]);
  if (!ok) return false;
  klasse.fehlzeiten.push({
    id: neueId(), schuelerId: p.value, datum: datum.value || heuteIso(), datumBis: '', zeitVon: '', zeitBis: '',
    stunde: zahlLesen(stunde.value) || null, std: zahlLesen(std.value) || 0, min: zahlLesen(min.value) || 0,
    fach: fach.value.trim(), status: status.value, grund: grund.value.trim(), quelle: 'manuell', notiz: notiz.value.trim(), zaehltNicht: false,
  });
  K.aenderung();
  return true;
}

function eintragZeile(klasse, f, mitName) {
  const s = klasse.schueler.find((x) => x.id === f.schuelerId);
  const zeitraum = `${datumDeutsch(f.datum)}${f.datumBis ? ` – ${datumDeutsch(f.datumBis)}` : ''}${f.zeitVon ? ` (${f.zeitVon}–${f.zeitBis})` : ''}`;
  const umfang = f.quelle === 'untis-b' ? 'Zeitraum' : `${formatKurz(f.std || 0)} Std.${f.min ? ` ${f.min} Min.` : ''}${f.stunde ? ` (${f.stunde}. Std.)` : ''}`;
  return h('tr', { class: f.zaehltNicht ? 'zeile-grau' : '' },
    mitName && h('td', { class: 'links name' }, s ? [s.name, s.vorname].filter(Boolean).join(', ') : '?'),
    h('td', {}, zeitraum), h('td', {}, umfang), h('td', {}, f.fach || ''),
    h('td', {}, h('select', { 'aria-label': 'Status', onchange: (e) => { f.status = e.target.value; K.aenderung(); K.neuZeichnen(); } }, Object.entries(FZ_STATUS).map(([w, t]) => h('option', { value: w, selected: f.status === w }, t)))),
    h('td', { class: 'links' }, f.grund || ''), h('td', { class: 'links' }, FZ_QUELLE[f.quelle] || ''),
    h('td', {}, f.zaehltNicht ? 'zählt nicht' : ''),
    h('td', { class: 'links' }, f.notiz || ''),
    h('td', {}, h('button', { type: 'button', class: 'knopf klein gefahr', 'aria-label': 'Fehlzeit löschen', onclick: async () => {
      if (!(await bestaetigen('Fehlzeit löschen', 'Diesen Eintrag löschen?', 'Löschen', true))) return;
      klasse.fehlzeiten.splice(klasse.fehlzeiten.indexOf(f), 1);
      K.aenderung();
      K.neuZeichnen();
    } }, '✕')));
}

export function zeigeFehlzeiten() {
  const d = K.daten;
  const wurzel = h('section', { class: 'seite' });
  const personen = aktiveSchueler(d);
  const summen = personen.map((s) => ({ s, z: fehlzeitenSummen(d, s.id) }));
  wurzel.append(
    h('h1', {}, 'Fehlzeiten'),
    h('div', { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf primaer', id: 'untis-laden', onclick: () => untisListeLaden(d) }, 'Untis-Liste laden'),
      h('button', { type: 'button', class: 'knopf', onclick: async () => { if (await fehlzeitManuell(d)) K.neuZeichnen(); } }, '+ Fehlzeit manuell')),
    h('p', { class: 'klein' }, 'Fehlzeiten fließen nicht in Noten ein. Abwesenheitsgründe (z. B. „krank“) sind Gesundheitsangaben und erscheinen nur hier und in der Personenübersicht, nicht im Excel der Gesamtübersicht und nicht im Druck.'),
    h('h2', {}, 'Summen je Person'),
    h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle' },
      h('thead', {}, h('tr', {}, ['Nr.', 'Name', 'Entschuldigt', 'davon mit Attest', 'Nicht entschuldigt', 'Offen', 'Gesamt', 'Fehltage', 'Verspätungen'].map((t) => h('th', {}, t)))),
      h('tbody', {}, summen.map(({ s, z }, i) => h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links name' }, h('a', { href: `#/person/${s.id}` }, [s.name, s.vorname].filter(Boolean).join(', ')))
        , [z.entschuldigt, z.attest, z.nicht, z.offen, z.gesamt, z.tage, z.verspaetungen].map((v) => h('td', { class: 'zahl' }, formatKurz(v))))))
    )),
    h('h2', {}, 'Alle Einträge'),
  );
  const alle = [...d.fehlzeiten].sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));
  wurzel.append(alle.length === 0 ? h('p', { class: 'hinweis' }, 'Noch keine Fehlzeiten. Laden Sie eine Untis-Liste oder erfassen Sie eine Fehlzeit manuell.') :
    h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle' },
      h('thead', {}, h('tr', {}, ['Name', 'Datum / Zeitraum', 'Umfang', 'Fach', 'Status', 'Grund', 'Quelle', '', 'Notiz', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, alle.slice(0, 500).map((f) => eintragZeile(d, f, true))))));
  return { el: wurzel };
}

personAbschnittRegistrieren(40, (d, s) => {
  const z = fehlzeitenSummen(d, s.id);
  const liste = fehlzeitenVon(d, s.id);
  return h('div', {}, h('h2', {}, 'Fehlzeiten'),
    h('p', { class: 'summe-zeile' }, `Fehlstunden gesamt ${formatKurz(z.gesamt)} (entschuldigt ${formatKurz(z.entschuldigt)}, davon mit Attest ${formatKurz(z.attest)}, nicht entschuldigt ${formatKurz(z.nicht)}, offen ${formatKurz(z.offen)}) · Fehltage ${formatKurz(z.tage)} · Verspätungen ${z.verspaetungen}`),
    h('div', { class: 'knopfreihe' }, h('button', { type: 'button', class: 'knopf', onclick: async () => { if (await fehlzeitManuell(d, s.id)) K.neuZeichnen(); } }, '+ Fehlzeit manuell')),
    liste.length ? h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle klein-tabelle' },
      h('thead', {}, h('tr', {}, ['Datum / Zeitraum', 'Umfang', 'Fach', 'Status', 'Grund', 'Quelle', '', 'Notiz', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, liste.slice(0, 100).map((f) => eintragZeile(d, f, false))))) : h('p', { class: 'hinweis' }, 'Keine Fehlzeiten erfasst.'));
});

ansichtRegistrieren('fehlzeiten', { text: 'Fehlzeiten', bauen: zeigeFehlzeiten, klasse: true, reihe: 6 });
