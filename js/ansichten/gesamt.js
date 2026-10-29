import { K } from '../kontext.js';
import { h } from '../ui.js';
import { aktiveSchueler } from '../modell.js';
import { gesamtPerson, formatZahl, zahlLesen, NOTEN_WORTE } from '../rechnen.js';
import { gesamtXlsx, gesamtCsv } from '../excel.js';
import { herunterladen } from '../speicher.js';

export function zeigeGesamt() {
  const d = K.daten;
  const personen = aktiveSchueler(d);
  const wurzel = h('section', { class: 'seite' });
  const updater = [];
  const kopf = d.kopf;

  const exportName = `${(kopf.klasse || 'Klasse').replace(/[^\wäöüÄÖÜß-]+/g, '-')}_Gesamtuebersicht`;
  wurzel.append(
    h('h1', {}, 'Gesamtübersicht'),
    h(
      'p',
      { class: 'kopfzeile-info' },
      `Klasse ${kopf.klasse || '–'} · Lernfeld ${[kopf.lernfeldNr, kopf.lernfeldBez].filter(Boolean).join(' ') || '–'} · Schuljahr ${kopf.schuljahr || '–'} · Gewichtung schriftlich ${String(d.gewichtSchriftlich).replace('.', ',')} % / sonstige ${String(100 - d.gewichtSchriftlich).replace('.', ',')} %`,
    ),
    h(
      'div',
      { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf', onclick: () => herunterladen(gesamtXlsx(d), `${exportName}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') }, 'Export als .xlsx'),
      h('button', { type: 'button', class: 'knopf', onclick: () => herunterladen('﻿' + gesamtCsv(d), `${exportName}.csv`, 'text/csv;charset=utf-8') }, 'Export als .csv'),
    ),
  );

  if (personen.length === 0) {
    wurzel.append(h('p', { class: 'hinweis' }, 'Bitte zuerst unter „Grunddaten“ Schüler:innen eintragen.'));
    return { el: wurzel };
  }

  const gewichtsFeld = (objekt, beschriftung) =>
    h('input', {
      type: 'text',
      inputmode: 'decimal',
      class: 'gewicht',
      'aria-label': beschriftung,
      value: String(objekt.gewicht ?? 1).replace('.', ','),
      oninput: (e) => {
        const z = zahlLesen(e.target.value);
        const ok = z !== null && !Number.isNaN(z) && z >= 0;
        e.target.classList.toggle('fehler', !ok);
        if (ok) {
          objekt.gewicht = z;
          K.aenderung();
        }
      },
    });

  const kopfZeile = h(
    'tr',
    {},
    ['Nr.', 'Name', 'Vorname', 'Gesamt %', 'Note'].map((t) => h('th', {}, t)),
    d.klassenarbeiten.map((_, i) => h('th', {}, `KA ${i + 1} %`)),
    ['Ø KA', 'Anz. sL', 'Ø sL'].map((t) => h('th', {}, t)),
  );
  const gewichtZeile = h(
    'tr',
    { class: 'hoechstzeile' },
    h('td', { colspan: 5, class: 'links' }, 'Gewicht der Klassenarbeiten'),
    d.klassenarbeiten.map((ka, i) => h('td', {}, gewichtsFeld(ka, `Gewicht KA ${i + 1}`))),
    h('td', { colspan: 3 }),
  );
  const tbody = h('tbody');
  personen.forEach((s, i) => {
    const zellen = { gesamt: h('td', { class: 'zahl' }), note: h('td', { class: 'mitte' }), ka: d.klassenarbeiten.map(() => h('td', { class: 'zahl' })), oKA: h('td', { class: 'zahl' }), anz: h('td', { class: 'zahl' }), oSL: h('td', { class: 'zahl' }) };
    updater.push(() => {
      const g = gesamtPerson(d, s.id);
      zellen.gesamt.textContent = g.gesamtProzent === null ? '' : formatZahl(g.gesamtProzent, 2);
      zellen.note.textContent = g.gesamtNote === null ? '' : String(g.gesamtNote);
      zellen.note.title = g.gesamtNote === null ? '' : NOTEN_WORTE[g.gesamtNote];
      g.kaProzente.forEach((p, j) => (zellen.ka[j].textContent = p === null ? '' : formatZahl(p, 1)));
      zellen.oKA.textContent = g.oKA === null ? '' : formatZahl(g.oKA, 2);
      zellen.anz.textContent = String(g.anzahlSL);
      zellen.oSL.textContent = g.oSL === null ? '' : formatZahl(g.oSL, 2);
    });
    tbody.append(
      h(
        'tr',
        { class: 'klickbar', tabindex: 0, onclick: () => K.navigiere(`sl/person/${s.id}`), onkeydown: (e) => e.key === 'Enter' && K.navigiere(`sl/person/${s.id}`) },
        h('td', { class: 'zahl' }, String(i + 1)),
        h('td', { class: 'links name' }, s.name),
        h('td', { class: 'links name' }, s.vorname),
        zellen.gesamt,
        zellen.note,
        zellen.ka,
        zellen.oKA,
        zellen.anz,
        zellen.oSL,
      ),
    );
  });
  wurzel.append(
    h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle gesamt' }, h('thead', {}, kopfZeile, gewichtZeile), tbody)),
    h('p', { class: 'klein' }, 'Antippen einer Zeile öffnet die Übersicht der sonstigen Leistungen dieser Person. Gewichte der sonstigen Leistungen pflegen Sie je Termin unter „Sonstige Leistung“. Angezeigt wird gerundet, gerechnet wird ohne Rundung.'),
  );
  const update = () => updater.forEach((f) => f());
  update();
  return { el: wurzel, update };
}
