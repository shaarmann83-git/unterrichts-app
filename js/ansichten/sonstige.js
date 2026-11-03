import { K } from '../kontext.js';
import { h, leeren, bestaetigen, meldung, fuege, avatar } from '../ui.js';
import { neuerTermin, heuteIso, datumDeutsch, aktiveSchueler, anzeigename } from '../modell.js';
import { prozentSL, gesamtPerson, formatZahl, zahlLesen } from '../rechnen.js';
import { FZ_STATUS } from '../fehlzeiten.js';
import { sichtbareListen, strichHinzu, strichZurueck, strichSumme, abhakSetzen, abhakErledigt } from '../listen.js';
import { neueId } from '../modell.js';
import { eintraegeAm } from '../stundenplan.js';

let aktuellerTermin = null; // ID des Termins in der Schnelleingabe
const SCHNELLNOTEN = [1, 2, 3, 4, 5];

function eintragHolen(t, s) {
  return (t.eintraege[s.id] ||= { note: null, notiz: '' });
}

function noteText(n) {
  return n === null || n === undefined ? '' : formatZahl(n, 1);
}

/** Fehlzeit der Stunde (manuell) und Tipp-Felder der Strich- und Abhaklisten. */
function extras(d, termin, s) {
  const datum = termin.datum || heuteIso();
  const fz = d.fehlzeiten.find((f) => f.schuelerId === s.id && f.quelle === 'manuell' && f.datum === datum && f.stundeEintrag);
  const std = h('input', { type: 'text', inputmode: 'decimal', class: 'gewicht', 'aria-label': `${anzeigename(s)}: Fehlstunden`, placeholder: '0', value: fz?.std ? String(fz.std).replace('.', ',') : '',
    oninput: (e) => {
      const z = zahlLesen(e.target.value);
      const ok = z === null || (!Number.isNaN(z) && z >= 0);
      e.target.classList.toggle('fehler', !ok);
      if (!ok) return;
      let f = d.fehlzeiten.find((x) => x.schuelerId === s.id && x.quelle === 'manuell' && x.datum === datum && x.stundeEintrag);
      if (!z) {
        if (f) d.fehlzeiten.splice(d.fehlzeiten.indexOf(f), 1);
      } else if (f) f.std = z;
      else d.fehlzeiten.push({ id: neueId(), schuelerId: s.id, datum, datumBis: '', zeitVon: '', zeitBis: '', stunde: null, std: z, min: 0, fach: '', status: statusWahl.value, grund: '', quelle: 'manuell', notiz: '', zaehltNicht: false, stundeEintrag: true });
      K.aenderung();
    } });
  const statusWahl = h('select', { 'aria-label': `${anzeigename(s)}: Status der Fehlzeit`, onchange: (e) => {
    const f = d.fehlzeiten.find((x) => x.schuelerId === s.id && x.quelle === 'manuell' && x.datum === datum && x.stundeEintrag);
    if (f) { f.status = e.target.value; K.aenderung(); }
  } }, Object.entries(FZ_STATUS).map(([w, t]) => h('option', { value: w, selected: (fz?.status || 'offen') === w }, t)));
  const teile = [h('label', { class: 'inline klein' }, 'Fehlstd.: ', std, ' ', statusWahl)];
  for (const l of sichtbareListen(d)) {
    if (l.art === 'strich') {
      const zahl = h('span', { class: 'summe-klein' }, String(strichSumme(l, s.id)));
      teile.push(h('span', { class: 'inline klein' }, `${l.name}: `, zahl,
        h('button', { type: 'button', class: 'knopf taste', 'aria-label': `${l.name}: ${anzeigename(s)} +1`, onclick: () => { strichHinzu(l, s.id, datum); zahl.textContent = String(strichSumme(l, s.id)); K.aenderung(); } }, '+1'),
        h('button', { type: 'button', class: 'knopf taste', 'aria-label': `${l.name}: ${anzeigename(s)} −1`, onclick: () => { if (strichZurueck(l, s.id)) { zahl.textContent = String(strichSumme(l, s.id)); K.aenderung(); } } }, '−1')));
    } else if (l.art === 'abhak') {
      teile.push(h('label', { class: 'inline klein' }, h('input', { type: 'checkbox', 'aria-label': `${l.name}: ${anzeigename(s)}`, checked: abhakErledigt(l, s.id), onchange: (e) => { abhakSetzen(l, s.id, e.target.checked, datum); K.aenderung(); } }), ` ${l.name}`));
    }
  }
  return h('div', { class: 'schnell-extra' }, teile);
}

export function zeigeSonstige(params) {
  const d = K.daten;
  const bereich = params[0] || 'heute';
  const wurzel = h('section', { class: 'seite' });
  const reiter = h(
    'div',
    { class: 'reiter' },
    [
      ['heute', '#/sl', 'Heutige Stunde'],
      ['termin', '#/sl/termin', 'Übersicht nach Termin'],
      ['person', '#/sl/person', 'Übersicht nach Person'],
    ].map(([id, href, text]) => h('a', { href, class: `reiter-punkt${bereich === id ? ' aktiv' : ''}` }, text)),
  );
  wurzel.append(h('h1', {}, 'Sonstige Leistung'), reiter);
  let ansicht;
  if (bereich === 'termin') ansicht = nachTermin(d);
  else if (bereich === 'person') ansicht = nachPerson(d, params[1]);
  else ansicht = heute(d);
  wurzel.append(ansicht.el);
  return { el: wurzel, update: ansicht.update };
}

// ---------- Schnelleingabe ----------

function heute(d) {
  const wurzel = h('div', {});
  const personen = aktiveSchueler(d);
  const inhalt = h('div', {});
  const updater = [];

  if (!aktuellerTermin || !d.sonstige.some((t) => t.id === aktuellerTermin)) {
    const heuteTermin = d.sonstige.find((t) => t.datum === heuteIso());
    aktuellerTermin = heuteTermin ? heuteTermin.id : d.sonstige.at(-1)?.id || null;
  }

  function stichworte() {
    const zaehler = new Map();
    for (const t of d.sonstige) if (t.stichwort) zaehler.set(t.stichwort, t.datum);
    return [...zaehler.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1)).map(([w]) => w).slice(0, 6);
  }

  function neuerTerminAnlegen() {
    const t = neuerTermin(heuteIso());
    d.sonstige.push(t);
    aktuellerTermin = t.id;
    K.aenderung();
    render();
  }

  function render() {
    leeren(inhalt);
    updater.length = 0;
    const t = d.sonstige.find((x) => x.id === aktuellerTermin);

    const auswahl = h(
      'select',
      {
        'aria-label': 'Termin wählen',
        onchange: (e) => {
          aktuellerTermin = e.target.value;
          render();
        },
      },
      d.sonstige.map((x, i) =>
        h('option', { value: x.id, selected: x.id === aktuellerTermin }, `${i + 1}. ${datumDeutsch(x.datum) || 'ohne Datum'}${x.stichwort ? ` – ${x.stichwort}` : ''}`),
      ),
    );
    inhalt.append(
      h(
        'div',
        { class: 'knopfreihe' },
        h('button', { type: 'button', class: 'knopf primaer gross', onclick: neuerTerminAnlegen }, '+ Neue Stunde (heute)'),
        d.sonstige.length > 0 && h('label', { class: 'inline' }, 'Termin: ', auswahl),
      ),
    );
    const plan = eintraegeAm(d, heuteIso());
    if (plan.length) inhalt.append(h('p', { class: 'klein', id: 'stundenplan-heute' }, `Laut Stundenplan heute: ${plan.map((x) => `${x.uhrzeit}${x.ende ? '–' + x.ende : ''} Uhr`).join(', ')}`));
    if (!t) {
      inhalt.append(h('p', { class: 'hinweis' }, 'Noch kein Termin. Mit „Neue Stunde“ legen Sie den heutigen Termin an.'));
      return;
    }

    const liste = h('datalist', { id: 'stichwort-liste' }, stichworte().map((w) => h('option', { value: w })));
    const stichwortFeld = h('input', {
      type: 'text',
      list: 'stichwort-liste',
      value: t.stichwort || '',
      placeholder: 'z. B. Gruppenarbeit Inventur',
      oninput: (e) => {
        t.stichwort = e.target.value;
        K.aenderung();
      },
    });
    fuege(
      inhalt,
      h(
        'div',
        { class: 'formular' },
        h('label', {}, 'Datum', h('input', { type: 'date', value: t.datum || '', onchange: (e) => { t.datum = e.target.value; K.aenderung(); } })),
        h('label', { class: 'breit' }, 'Stichwort (optional)', stichwortFeld, liste),
        h(
          'label',
          {},
          'Gewicht',
          h('input', {
            type: 'text',
            inputmode: 'decimal',
            value: String(t.gewicht).replace('.', ','),
            oninput: (e) => {
              const z = zahlLesen(e.target.value);
              const ok = z !== null && !Number.isNaN(z) && z >= 0;
              e.target.classList.toggle('fehler', !ok);
              if (ok) {
                t.gewicht = z;
                K.aenderung();
              }
            },
          }),
        ),
      ),
      stichworte().length > 0 &&
        h(
          'div',
          { class: 'chips' },
          h('span', { class: 'klein' }, 'Zuletzt benutzt: '),
          stichworte().map((w) =>
            h('button', { type: 'button', class: 'chip', onclick: () => { t.stichwort = w; stichwortFeld.value = w; K.aenderung(); } }, w),
          ),
        ),
    );

    if (personen.length === 0) {
      inhalt.append(h('p', { class: 'hinweis' }, 'Bitte zuerst unter „Grunddaten“ Schüler:innen eintragen.'));
      return;
    }

    const zeilen = h('div', { class: 'schnell-liste' });
    for (const s of personen) {
      const e = eintragHolen(t, s);
      const prozent = h('span', { class: 'klein prozent' });
      const noteFeld = h('input', {
        type: 'text',
        inputmode: 'decimal',
        autocomplete: 'off',
        class: 'notenfeld',
        'aria-label': `Note ${anzeigename(s)}`,
        value: noteText(e.note),
        placeholder: 'Note',
        oninput: (ev) => {
          const z = zahlLesen(ev.target.value);
          const ok = z === null || (!Number.isNaN(z) && z >= 1 && z <= 6);
          ev.target.classList.toggle('fehler', !ok);
          if (ok) {
            e.note = z;
            K.aenderung();
          }
        },
      });
      const tasten = SCHNELLNOTEN.map((n) =>
        h(
          'button',
          {
            type: 'button',
            class: 'knopf taste',
            'aria-label': `${anzeigename(s)}: Note ${n},0`,
            onclick: () => {
              e.note = e.note === n ? null : n;
              noteFeld.value = noteText(e.note);
              noteFeld.classList.remove('fehler');
              K.aenderung();
            },
          },
          String(n),
        ),
      );
      const notiz = h('input', {
        type: 'text',
        class: 'notizfeld',
        'aria-label': `Notiz ${anzeigename(s)}`,
        placeholder: 'Notiz',
        value: e.notiz || '',
        oninput: (ev) => {
          e.notiz = ev.target.value;
          K.aenderung();
        },
      });
      updater.push(() => {
        const p = e.note === null || e.note === undefined ? null : prozentSL(e.note);
        prozent.textContent = p === null ? '' : `= ${formatZahl(p, 2)} %`;
      });
      zeilen.append(
        h(
          'div',
          { class: 'schnell-zeile' },
          h('div', { class: 'schnell-name' }, avatar(d, s), ' ', anzeigename(s)),
          h('div', { class: 'schnell-note' }, noteFeld, prozent),
          h('div', { class: 'tasten' }, tasten),
          notiz,
          extras(d, t, s),
        ),
      );
    }
    inhalt.append(zeilen);
    updater.forEach((f) => f());
  }

  render();
  wurzel.append(inhalt);
  return { el: wurzel, update: () => updater.forEach((f) => f()) };
}

// ---------- Übersicht nach Termin ----------

function nachTermin(d) {
  const personen = aktiveSchueler(d);
  if (d.sonstige.length === 0) return { el: h('p', { class: 'hinweis' }, 'Noch keine Termine. Legen Sie unter „Heutige Stunde“ den ersten an.') };
  const kopf = h(
    'tr',
    {},
    h('th', {}, 'Nr.'),
    h('th', { class: 'links' }, 'Name'),
    d.sonstige.map((t, i) =>
      h(
        'th',
        {},
        h('div', {}, `${i + 1}. ${datumDeutsch(t.datum) || '–'}`),
        t.stichwort && h('div', { class: 'klein' }, t.stichwort),
        h('div', { class: 'klein' }, `Gewicht ${String(t.gewicht).replace('.', ',')}`),
        h(
          'div',
          { class: 'kopf-knoepfe' },
          h('button', { type: 'button', class: 'knopf klein', onclick: () => { aktuellerTermin = t.id; K.navigiere('sl'); } }, 'Bearbeiten'),
          h(
            'button',
            {
              type: 'button',
              class: 'knopf klein gefahr',
              onclick: async () => {
                if (await bestaetigen('Termin löschen', `Der Termin vom ${datumDeutsch(t.datum) || '(ohne Datum)'}${t.stichwort ? ` („${t.stichwort}“)` : ''} wird mit allen Noten und Notizen gelöscht.`, 'Löschen', true)) {
                  d.sonstige.splice(d.sonstige.indexOf(t), 1);
                  K.aenderung();
                  K.neuZeichnen();
                }
              },
            },
            'Löschen',
          ),
        ),
      ),
    ),
  );
  const tbody = h('tbody');
  personen.forEach((s, i) => {
    tbody.append(
      h(
        'tr',
        {},
        h('td', { class: 'zahl' }, String(i + 1)),
        h(
          'td',
          { class: 'links name' },
          h('a', { href: `#/sl/person/${s.id}` }, [s.name, s.vorname].filter(Boolean).join(', ')),
        ),
        d.sonstige.map((t) => {
          const e = t.eintraege[s.id];
          const note = e?.note ?? null;
          const zelle = h('td', { class: 'mitte' });
          if (note !== null) {
            zelle.append(h('strong', {}, formatZahl(note, 1)), h('div', { class: 'klein' }, `${formatZahl(prozentSL(note), 2)} %`));
          }
          if (e?.notiz) {
            zelle.append(
              h(
                'button',
                {
                  type: 'button',
                  class: 'notiz-symbol',
                  title: e.notiz,
                  'aria-label': `Notiz anzeigen: ${e.notiz}`,
                  onclick: () => meldung(`${anzeigename(s)} · ${datumDeutsch(t.datum)}`, e.notiz),
                },
                '📝',
              ),
            );
          }
          return zelle;
        }),
      ),
    );
  });
  return {
    el: h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle' }, h('thead', {}, kopf), tbody)),
  };
}

// ---------- Übersicht nach Person ----------

function nachPerson(d, id) {
  const personen = aktiveSchueler(d);
  if (personen.length === 0) return { el: h('p', { class: 'hinweis' }, 'Keine Schüler:innen eingetragen.') };
  let position = Math.max(personen.findIndex((s) => s.id === id), 0);
  const wurzel = h('div', {});
  function render() {
    leeren(wurzel);
    const s = personen[position];
    const g = gesamtPerson(d, s.id);
    const auswahl = h(
      'select',
      { 'aria-label': 'Person wählen', onchange: (e) => { position = Number(e.target.value); render(); } },
      personen.map((p, i) => h('option', { value: i, selected: i === position }, [p.name, p.vorname].filter(Boolean).join(', '))),
    );
    wurzel.append(
      h(
        'div',
        { class: 'einzel-kopf' },
        h('button', { type: 'button', class: 'knopf gross', onclick: () => { position = (position - 1 + personen.length) % personen.length; render(); } }, '‹ Zurück'),
        auswahl,
        h('button', { type: 'button', class: 'knopf gross', onclick: () => { position = (position + 1) % personen.length; render(); } }, 'Weiter ›'),
      ),
      h('h2', {}, anzeigename(s)),
    );
    const zeilen = d.sonstige
      .map((t, i) => ({ t, i, e: t.eintraege[s.id] }))
      .filter((x) => x.e && (x.e.note !== null && x.e.note !== undefined || x.e.notiz));
    if (zeilen.length === 0) {
      wurzel.append(h('p', { class: 'hinweis' }, 'Für diese Person gibt es noch keine Einträge.'));
    } else {
      wurzel.append(
        h(
          'div',
          { class: 'tabelle-rahmen' },
          h(
            'table',
            { class: 'tabelle' },
            h('thead', {}, h('tr', {}, ['Datum', 'Stichwort', 'Note', 'Prozent', 'Gewicht', 'Notiz'].map((t) => h('th', {}, t)))),
            h(
              'tbody',
              {},
              zeilen.map(({ t, e }) =>
                h(
                  'tr',
                  {},
                  h('td', {}, datumDeutsch(t.datum)),
                  h('td', { class: 'links' }, t.stichwort || ''),
                  h('td', { class: 'zahl' }, noteText(e.note)),
                  h('td', { class: 'zahl' }, e.note === null || e.note === undefined ? '' : `${formatZahl(prozentSL(e.note), 2)} %`),
                  h('td', { class: 'zahl' }, String(t.gewicht).replace('.', ',')),
                  h('td', { class: 'links' }, e.notiz || ''),
                ),
              ),
            ),
          ),
        ),
      );
    }
    wurzel.append(
      h('p', { class: 'summe-zeile' }, `Anzahl Noten: ${g.anzahlSL} · Ø sonstige Leistung: `, h('strong', {}, g.oSL === null ? '–' : `${formatZahl(g.oSL, 2)} %`)),
    );
  }
  render();
  return { el: wurzel };
}
