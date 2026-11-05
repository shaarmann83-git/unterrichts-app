import { K } from '../kontext.js';
import { h, avatar } from '../ui.js';
import { archivierteSchueler, fachZeile } from '../modell.js';
import { gesamtPerson, formatZahl, formatKurz, zahlLesen, NOTEN_WORTE, bewertungText } from '../rechnen.js';
import { fehlzeitenSummen } from '../fehlzeiten.js';
import { gesamtXlsx, gesamtCsv, standText } from '../excel.js';
import { herunterladen } from '../speicher.js';

// Anzeigeoptionen bleiben für die Sitzung erhalten
const optionen = { fehlzeiten: false, archiv: false };

export function zeigeGesamt() {
  const d = K.daten;
  const personen = d.schueler.filter((s) => (s.name || s.vorname) && (optionen.archiv || !s.archiviert));
  const wurzel = h('section', { class: 'seite' });
  const updater = [];
  const kopf = d.kopf;
  const daltonAn = d.dalton.modus !== 'aus';

  const exportName = `${(kopf.klasse || 'Klasse').replace(/[^\wäöüÄÖÜß-]+/g, '-')}_Gesamtuebersicht${d.stichtag ? `_Zwischenstand_${d.stichtag}` : ''}`;
  const exportOpt = () => ({ fehlzeiten: true, archiv: optionen.archiv });
  const stand = h('p', { class: `stand ${d.stichtag ? 'zwischenstand' : ''}`, id: 'stand-text' }, standText(d));
  const stichtagFeld = h('input', {
    type: 'date',
    id: 'stichtag',
    value: d.stichtag || '',
    'aria-label': 'Stichtag für den Zwischenstand',
    onchange: (e) => {
      d.stichtag = e.target.value;
      K.aenderung();
      K.neuZeichnen();
    },
  });
  wurzel.append(
    h('h1', {}, 'Gesamtübersicht'),
    h(
      'p',
      { class: 'kopfzeile-info' },
      `Klasse ${kopf.klasse || '–'} · ${fachZeile(kopf, { leer: '–' })} · Schuljahr ${kopf.schuljahr || '–'} · Gewichtung schriftlich ${String(d.gewichtSchriftlich).replace('.', ',')} % / sonstige ${String(100 - d.gewichtSchriftlich).replace('.', ',')} %`,
    ),
    stand,
    h('div', { class: 'formular' },
      h('label', {}, 'Zwischenstand zum Stichtag (leer = Ganzjahresnote)', stichtagFeld),
      d.stichtag && h('button', { type: 'button', class: 'knopf', onclick: () => { d.stichtag = ''; K.aenderung(); K.neuZeichnen(); } }, 'Stichtag entfernen')),
    d.stichtag && h('p', { class: 'klein' }, 'Beim Zwischenstand zählen nur Klassenarbeiten, sonstige Leistungen und Dalton-Aufgaben bis einschließlich Stichtag. Einträge ohne Datum zählen mit.'),
    h(
      'div',
      { class: 'knopfreihe' },
      h('label', { class: 'schalter' }, h('input', { type: 'checkbox', id: 'spalten-fehlzeiten', checked: optionen.fehlzeiten, onchange: (e) => { optionen.fehlzeiten = e.target.checked; K.neuZeichnen(); } }), ' Fehlzeiten-Spalten'),
      archivierteSchueler(d).length > 0 && h('label', { class: 'schalter' }, h('input', { type: 'checkbox', id: 'spalten-archiv', checked: optionen.archiv, onchange: (e) => { optionen.archiv = e.target.checked; K.neuZeichnen(); } }), ' Archivierte einblenden'),
      h('button', { type: 'button', class: 'knopf', onclick: () => herunterladen(gesamtXlsx(d, exportOpt()), `${exportName}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') }, 'Export als .xlsx'),
      h('button', { type: 'button', class: 'knopf', onclick: () => herunterladen('﻿' + gesamtCsv(d, exportOpt()), `${exportName}.csv`, 'text/csv;charset=utf-8') }, 'Export als .csv'),
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

  const fzKopf = ['Fehlstd.', 'entsch.', 'Attest', 'nicht entsch.', 'offen', 'Fehltage'];
  const kopfZeile = h(
    'tr',
    {},
    ['Nr.', 'Name', 'Vorname', 'Gesamt %', 'Note'].map((t) => h('th', {}, t)),
    d.klassenarbeiten.map((_, i) => h('th', {}, `KA ${i + 1} %`)),
    ['Ø KA', 'Anz. sL', 'Ø sL'].map((t) => h('th', {}, t)),
    daltonAn && h('th', {}, 'Ø Dalton'),
    optionen.fehlzeiten && fzKopf.map((t) => h('th', {}, t)),
  );
  const gewichtZeile = h(
    'tr',
    { class: 'hoechstzeile' },
    h('td', { colspan: 5, class: 'links' }, 'Gewicht der Klassenarbeiten'),
    d.klassenarbeiten.map((ka, i) => h('td', {}, gewichtsFeld(ka, `Gewicht KA ${i + 1}`))),
    h('td', { colspan: 3 + (daltonAn ? 1 : 0) + (optionen.fehlzeiten ? fzKopf.length : 0) }),
  );
  const tbody = h('tbody');
  personen.forEach((s, i) => {
    const zellen = {
      gesamt: h('td', { class: 'zahl' }), note: h('td', { class: 'mitte' }), ka: d.klassenarbeiten.map(() => h('td', { class: 'zahl' })),
      oKA: h('td', { class: 'zahl' }), anz: h('td', { class: 'zahl' }), oSL: h('td', { class: 'zahl' }), oDalton: h('td', { class: 'zahl' }),
      fz: fzKopf.map(() => h('td', { class: 'zahl' })),
    };
    updater.push(() => {
      const g = gesamtPerson(d, s.id);
      zellen.gesamt.textContent = g.gesamtProzent === null ? '' : formatZahl(g.gesamtProzent, 2);
      zellen.note.textContent = g.gesamtNote === null ? '' : String(g.gesamtNote);
      zellen.note.title = bewertungText(g.gesamtNote, d);
      g.kaProzente.forEach((p, j) => (zellen.ka[j].textContent = p === null ? '' : formatZahl(p, 1)));
      zellen.oKA.textContent = g.oKA === null ? '' : formatZahl(g.oKA, 2);
      zellen.anz.textContent = String(g.anzahlSL);
      zellen.oSL.textContent = g.oSL === null ? '' : formatZahl(g.oSL, 2);
      zellen.oDalton.textContent = g.oDalton === null ? '' : formatZahl(g.oDalton, 2);
      if (optionen.fehlzeiten) {
        const z = fehlzeitenSummen(d, s.id);
        [z.gesamt, z.entschuldigt, z.attest, z.nicht, z.offen, z.tage].forEach((v, j) => (zellen.fz[j].textContent = formatKurz(v)));
      }
    });
    tbody.append(
      h(
        'tr',
        { class: `klickbar${s.archiviert ? ' zeile-grau' : ''}`, tabindex: 0, onclick: () => K.navigiere(`person/${s.id}`), onkeydown: (e) => e.key === 'Enter' && K.navigiere(`person/${s.id}`) },
        h('td', { class: 'zahl' }, String(i + 1)),
        h('td', { class: 'links name' }, avatar(d, s), ' ', s.name, s.archiviert && h('span', { class: 'klein' }, ' (archiviert)')),
        h('td', { class: 'links name' }, s.vorname),
        zellen.gesamt,
        zellen.note,
        zellen.ka,
        zellen.oKA,
        zellen.anz,
        zellen.oSL,
        daltonAn && zellen.oDalton,
        optionen.fehlzeiten && zellen.fz,
      ),
    );
  });
  wurzel.append(
    h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle gesamt' }, h('thead', {}, kopfZeile, gewichtZeile), tbody)),
    h('p', { class: 'klein' }, 'Antippen einer Zeile öffnet die Personenübersicht. Gewichte der sonstigen Leistungen pflegen Sie je Termin unter „Sonstige Leistung“. Angezeigt wird gerundet, gerechnet wird ohne Rundung.'),
  );
  const update = () => updater.forEach((f) => f());
  update();
  return { el: wurzel, update };
}
