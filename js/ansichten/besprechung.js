// Besprechungsmodus (SPEC 9.10): zeigt nur eine Person, keine Namensliste. Wechsel nur über bewusste Auswahl per Suche.
import { K } from '../kontext.js';
import { h, leeren, fuege, avatar } from '../ui.js';
import { aktiveSchueler, anzeigename, datumDeutsch } from '../modell.js';
import { gesamtPerson, ergebnisKA, gesamtpunkte, formatZahl, formatKurz, NOTEN_WORTE, prozentSL } from '../rechnen.js';
import { daltonNote, daltonProzent, DALTON_STATUS, DALTON_QUALITAET } from '../dalton.js';
import { fehlzeitenSummen, fehlzeitenVon, FZ_STATUS } from '../fehlzeiten.js';
import { TEILNAHME } from '../nachschreiben.js';
import { ansichtRegistrieren } from '../registry.js';
import { sportPersonAbschnitt } from './sport-person.js';

let gewaehlt = null; // Personen-ID, nur im Arbeitsspeicher
let ohneNotizen = false;
const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();

function lernfeldInhalt(d, s, notizen) {
  const g = gesamtPerson(d, s.id);
  const fz = fehlzeitenSummen(d, s.id);
  const kaZeilen = d.klassenarbeiten.map((ka, i) => ({ ka, i, e: ergebnisKA(ka, s.id) })).filter(({ e, ka }) => e.summe !== null || e.attest || ka.teilnahme?.[s.id]);
  const sl = d.sonstige.map((t) => ({ t, e: t.eintraege[s.id] })).filter(({ e }) => e && (e.note !== null && e.note !== undefined || (notizen && e.notiz)));
  return h('div', {},
    h('h2', {}, 'Noten'),
    h('p', { class: 'summe-zeile' }, `Ø Klassenarbeiten ${g.oKA === null ? '–' : formatZahl(g.oKA, 2) + ' %'} · Ø sonstige Leistung ${g.oSL === null ? '–' : formatZahl(g.oSL, 2) + ' %'} (${g.anzahlSL} Noten) · Gesamt `, h('strong', {}, g.gesamtProzent === null ? '–' : `${formatZahl(g.gesamtProzent, 2)} % (Note ${g.gesamtNote}, ${NOTEN_WORTE[g.gesamtNote]})`), d.stichtag && ` · Zwischenstand zum ${datumDeutsch(d.stichtag)}`),
    kaZeilen.length > 0 && h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle klein-tabelle' },
      h('thead', {}, h('tr', {}, ['Klassenarbeit', 'Datum', 'Punkte', '%', 'Note', 'Teilnahme', ...(notizen ? ['Sonstiges'] : [])].map((t) => h('th', {}, t)))),
      h('tbody', {}, kaZeilen.map(({ ka, i, e }) => h('tr', {}, h('td', {}, `KA ${i + 1}`), h('td', {}, datumDeutsch(ka.datum)), h('td', { class: 'zahl' }, e.summe === null ? '' : `${formatKurz(e.summe)}/${formatKurz(gesamtpunkte(ka))}`), h('td', { class: 'zahl' }, e.prozent === null ? '' : formatZahl(e.prozent, 1)), h('td', { class: 'mitte' }, e.attest ? 'Attest' : e.note ?? ''), h('td', { class: 'links' }, TEILNAHME[ka.teilnahme?.[s.id]?.status] || ''), notizen && h('td', { class: 'links' }, ka.ergebnisse[s.id]?.sonstiges || '')))))),
    h('h2', {}, 'Sonstige Leistung'),
    sl.length ? h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle klein-tabelle' },
      h('thead', {}, h('tr', {}, ['Datum', 'Stichwort', 'Note', ...(notizen ? ['Notiz'] : [])].map((t) => h('th', {}, t)))),
      h('tbody', {}, sl.map(({ t, e }) => h('tr', {}, h('td', {}, datumDeutsch(t.datum)), h('td', { class: 'links' }, t.stichwort || ''), h('td', { class: 'zahl' }, e.note === null || e.note === undefined ? '' : formatZahl(e.note, 1)), notizen && h('td', { class: 'links' }, e.notiz || ''))))))
      : h('p', { class: 'hinweis' }, 'Keine Einträge.'),
    d.dalton.modus !== 'aus' && d.dalton.aufgaben.length > 0 && h('div', {}, h('h2', {}, 'Dalton'), h('ul', {}, d.dalton.aufgaben.map((a) => { const e = a.eintraege[s.id]; const n = daltonNote(e, d.dalton.zuordnung); return h('li', {}, `${a.titel || 'Aufgabe'}: ${DALTON_STATUS[e?.status] || '–'}${e?.qualitaet ? ', ' + DALTON_QUALITAET[e.qualitaet] : ''}${n === null ? '' : ` (Note ${formatZahl(n, 1)})`}${notizen && e?.notiz ? ' · ' + e.notiz : ''}`); }))),
    h('h2', {}, 'Fehlzeiten'),
    h('p', { class: 'summe-zeile' }, `Fehlstunden gesamt ${formatKurz(fz.gesamt)} (entschuldigt ${formatKurz(fz.entschuldigt)}, davon mit Attest ${formatKurz(fz.attest)}, nicht entschuldigt ${formatKurz(fz.nicht)}, offen ${formatKurz(fz.offen)}) · Verspätungen ${fz.verspaetungen}`));
}

export function zeigeBesprechung() {
  const d = K.daten;
  const wurzel = h('section', { class: 'seite besprechung' });
  const personen = aktiveSchueler(d);
  const inhalt = h('div', {});

  function waehlen() {
    leeren(inhalt);
    const treffer = h('div', { class: 'knopfreihe', id: 'besprechung-treffer' });
    const suche = h('input', { type: 'text', id: 'besprechung-suche', autocomplete: 'off', placeholder: 'Name oder Vorname tippen …', 'aria-label': 'Person suchen',
      oninput: () => {
        leeren(treffer);
        const q = norm(suche.value);
        if (q.length < 2) return;
        const gefunden = personen.filter((p) => norm(`${p.vorname} ${p.name}`).includes(q) || norm(`${p.name} ${p.vorname}`).includes(q)).slice(0, 4);
        if (gefunden.length === 0) return treffer.append(h('span', { class: 'klein' }, 'Kein Treffer.'));
        for (const p of gefunden) treffer.append(h('button', { type: 'button', class: 'knopf gross', 'data-person': p.id, onclick: () => { gewaehlt = p.id; zeigen(); } }, anzeigename(p)));
      } });
    fuege(inhalt,
      h('p', {}, 'Für Gespräche: Es wird nur eine Person angezeigt, ohne Klassenliste. Geben Sie den Namen ein und wählen Sie die Person aus.'),
      h('label', {}, 'Person suchen', suche), treffer);
    suche.focus();
  }

  function zeigen() {
    leeren(inhalt);
    const s = d.schueler.find((x) => x.id === gewaehlt);
    if (!s) return waehlen();
    fuege(inhalt,
      h('div', { class: 'besprechung-kopf' },
        avatar(d, s, 'gross'), h('h1', { id: 'besprechung-name' }, anzeigename(s)),
        h('label', { class: 'schalter' }, h('input', { type: 'checkbox', id: 'notizen-aus', checked: ohneNotizen, onchange: (e) => { ohneNotizen = e.target.checked; zeigen(); } }), ' Notizen ausblenden'),
        h('button', { type: 'button', class: 'knopf', id: 'andere-person', onclick: () => { gewaehlt = null; waehlen(); } }, 'Andere Person wählen'),
        h('a', { class: 'knopf', href: d.fachtyp === 'sport' ? '#/nachstunde' : '#/gesamt', id: 'besprechung-ende', onclick: () => { gewaehlt = null; } }, 'Besprechung beenden')),
      d.fachtyp === 'sport' ? sportPersonAbschnitt(d, s, { notizen: !ohneNotizen }) : lernfeldInhalt(d, s, !ohneNotizen));
  }

  fuege(wurzel, inhalt);
  gewaehlt && d.schueler.some((x) => x.id === gewaehlt) ? zeigen() : waehlen();
  return { el: wurzel, update: () => {} };
}

ansichtRegistrieren('besprechung', { text: 'Besprechung', bauen: zeigeBesprechung, klasse: true, reihe: 10.5 });
