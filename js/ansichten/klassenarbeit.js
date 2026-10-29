import { K } from '../kontext.js';
import { h, leeren, bestaetigen, enterNachUnten } from '../ui.js';
import { neueKlassenarbeit, aktiveSchueler, anzeigename } from '../modell.js';
import { ergebnisKA, gesamtpunkte, notenspiegel, formatZahl, formatKurz, zahlLesen, NOTEN_WORTE } from '../rechnen.js';

let modus = null; // 'tabelle' | 'einzel'
let einzelPosition = 0;

function ergebnisHolen(ka, s) {
  return (ka.ergebnisse[s.id] ||= { punkte: [], attest: false, sonstiges: '' });
}

export function zeigeKlassenarbeit(params) {
  const d = K.daten;
  const wurzel = h('section', { class: 'seite' });
  if (modus === null) modus = window.innerWidth < 700 ? 'einzel' : 'tabelle';

  const nr = Math.min(Math.max(parseInt(params[0] || '1', 10) || 1, 1), Math.max(d.klassenarbeiten.length, 1));
  const ka = d.klassenarbeiten[nr - 1];

  const tabs = h(
    'div',
    { class: 'reiter', role: 'tablist' },
    d.klassenarbeiten.map((_, i) =>
      h('a', { href: `#/ka/${i + 1}`, class: `reiter-punkt${i + 1 === nr ? ' aktiv' : ''}`, role: 'tab' }, `KA ${i + 1}`),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'knopf',
        onclick: () => {
          d.klassenarbeiten.push(neueKlassenarbeit());
          K.aenderung();
          K.navigiere(`ka/${d.klassenarbeiten.length}`);
        },
      },
      '+ Neue Klassenarbeit',
    ),
  );
  wurzel.append(h('h1', {}, 'Klassenarbeiten'), tabs);

  if (!ka) {
    wurzel.append(h('p', {}, 'Noch keine Klassenarbeit angelegt.'));
    return { el: wurzel };
  }

  const updater = [];
  const update = () => updater.forEach((f) => f());

  // ----- Kopf der Arbeit -----
  const gesamtAnzeige = h('strong', {});
  updater.push(() => {
    gesamtAnzeige.textContent = formatKurz(gesamtpunkte(ka));
  });

  const aufgabenAnzahl = h('span', {}, String(ka.aufgaben.length));
  const kopfFormular = h(
    'div',
    { class: 'formular' },
    h('label', {}, 'Datum', h('input', { type: 'date', value: ka.datum || '', onchange: (e) => { ka.datum = e.target.value; K.aenderung(); } })),
    h(
      'label',
      {},
      'Gewicht (Standard 1)',
      h('input', {
        type: 'text',
        inputmode: 'decimal',
        value: String(ka.gewicht).replace('.', ','),
        oninput: (e) => {
          const z = zahlLesen(e.target.value);
          const ok = z !== null && !Number.isNaN(z) && z >= 0;
          e.target.classList.toggle('fehler', !ok);
          if (ok) {
            ka.gewicht = z;
            K.aenderung();
          }
        },
      }),
    ),
    h(
      'label',
      { class: 'breit' },
      'Thematische Schwerpunkte',
      h('textarea', { rows: 2, oninput: (e) => { ka.schwerpunkte = e.target.value; K.aenderung(); } }, ka.schwerpunkte || ''),
    ),
  );

  const aufgabenKnoepfe = h(
    'div',
    { class: 'knopfreihe' },
    h('span', {}, 'Aufgaben: ', aufgabenAnzahl, ' · Gesamtpunktzahl: ', gesamtAnzeige),
    h('button', { type: 'button', class: 'knopf', onclick: () => { ka.aufgaben.push(null); K.aenderung(); render(); } }, '+ Aufgabe'),
    h(
      'button',
      {
        type: 'button',
        class: 'knopf',
        disabled: ka.aufgaben.length === 0,
        onclick: async () => {
          const letzte = ka.aufgaben.length - 1;
          const belegt = Object.values(ka.ergebnisse).some((e) => e.punkte?.[letzte] !== null && e.punkte?.[letzte] !== undefined && e.punkte?.[letzte] !== '');
          if (belegt && !(await bestaetigen('Aufgabe entfernen', `Zu Aufgabe ${letzte + 1} sind schon Punkte eingetragen. Sie werden gelöscht.`, 'Entfernen', true))) return;
          ka.aufgaben.pop();
          for (const e of Object.values(ka.ergebnisse)) e.punkte.length = Math.min(e.punkte.length, ka.aufgaben.length);
          K.aenderung();
          render();
        },
      },
      '− Letzte Aufgabe',
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'knopf gefahr',
        onclick: async () => {
          if (!(await bestaetigen('Klassenarbeit löschen', `KA ${nr} wird mit allen Punkten gelöscht.`, 'Löschen', true))) return;
          d.klassenarbeiten.splice(nr - 1, 1);
          K.aenderung();
          K.navigiere(`ka/${Math.max(nr - 1, 1)}`);
          K.neuZeichnen();
        },
      },
      'Klassenarbeit löschen',
    ),
    h(
      'button',
      { type: 'button', class: 'knopf', onclick: () => { modus = modus === 'tabelle' ? 'einzel' : 'tabelle'; render(); } },
      'Ansicht wechseln: Tabelle / Schüler:in für Schüler:in',
    ),
  );

  const arbeitsflaeche = h('div', { class: 'arbeitsflaeche' });
  const spiegel = h('div', { class: 'notenspiegel' });
  wurzel.append(kopfFormular, aufgabenKnoepfe, arbeitsflaeche, h('h2', {}, 'Notenspiegel'), spiegel);

  // ----- Zeilen-Steuerelemente (für Tabelle und Einzelansicht gleich) -----
  function steuerelemente(s) {
    const e = ergebnisHolen(ka, s);
    const summe = h('span', {});
    const prozent = h('span', {});
    const note = h('span', { class: 'note' });
    const punkteFelder = ka.aufgaben.map((max, i) => {
      const feld = h('input', {
        type: 'text',
        inputmode: 'decimal',
        autocomplete: 'off',
        value: e.punkte[i] === null || e.punkte[i] === undefined ? '' : String(e.punkte[i]).replace('.', ','),
        'aria-label': `${anzeigename(s)} Aufgabe ${i + 1}`,
        'data-sp': `a${i}`,
        class: 'punkte',
        oninput: (ev) => {
          const z = zahlLesen(ev.target.value);
          if (Number.isNaN(z)) {
            ev.target.classList.add('fehler');
            return;
          }
          e.punkte[i] = z;
          K.aenderung();
        },
      });
      return feld;
    });
    const attest = h('input', {
      type: 'checkbox',
      'aria-label': `${anzeigename(s)} Attest`,
      checked: e.attest,
      onchange: (ev) => {
        e.attest = ev.target.checked;
        K.aenderung();
      },
    });
    const sonstiges = h('input', {
      type: 'text',
      value: e.sonstiges || '',
      'aria-label': `${anzeigename(s)} Sonstiges`,
      class: 'sonstiges',
      oninput: (ev) => {
        e.sonstiges = ev.target.value;
        K.aenderung();
      },
    });
    updater.push(() => {
      const erg = ergebnisKA(ka, s.id);
      summe.textContent = erg.summe === null ? '' : formatKurz(erg.summe);
      prozent.textContent = erg.prozent === null ? '' : formatZahl(erg.prozent, 1);
      note.textContent = erg.attest ? 'Attest' : erg.note === null ? '' : String(erg.note);
      punkteFelder.forEach((feld, i) => {
        feld.disabled = e.attest;
        const wert = e.punkte[i];
        const max = ka.aufgaben[i];
        const zuHoch = wert !== null && wert !== undefined && wert !== '' && (wert < 0 || (max !== null && wert > max));
        feld.classList.toggle('fehler', !!zuHoch);
        feld.title = zuHoch ? `Erlaubt: 0 bis ${String(max).replace('.', ',')}` : '';
      });
    });
    return { summe, prozent, note, punkteFelder, attest, sonstiges };
  }

  function tabelleBauen(personen) {
    const kopf1 = h(
      'tr',
      {},
      h('th', {}, 'Nr.'),
      h('th', { class: 'links' }, 'Name'),
      ka.aufgaben.map((_, i) => h('th', {}, `Aufg. ${i + 1}`)),
      ['∑', '%', 'Note', 'Attest', 'Sonstiges'].map((t) => h('th', {}, t)),
    );
    const hoechst = ka.aufgaben.map((max, i) =>
      h('input', {
        type: 'text',
        inputmode: 'decimal',
        class: 'punkte hoechst',
        'aria-label': `Höchstpunktzahl Aufgabe ${i + 1}`,
        'data-sp': `a${i}`,
        value: max === null || max === undefined ? '' : String(max).replace('.', ','),
        oninput: (ev) => {
          const z = zahlLesen(ev.target.value);
          const ok = !Number.isNaN(z) && (z === null || z >= 0);
          ev.target.classList.toggle('fehler', !ok);
          if (ok) {
            ka.aufgaben[i] = z;
            K.aenderung();
          }
        },
      }),
    );
    const kopf2 = h(
      'tr',
      { class: 'hoechstzeile' },
      h('td', {}),
      h('td', { class: 'links' }, 'Höchstpunkte'),
      hoechst.map((f) => h('td', {}, f)),
      h('td', {}, gesamtAnzeige2()),
      h('td', { colspan: 4 }),
    );
    function gesamtAnzeige2() {
      const el = h('strong', {});
      updater.push(() => {
        el.textContent = formatKurz(gesamtpunkte(ka));
      });
      return el;
    }
    const tbody = h('tbody');
    personen.forEach((s, i) => {
      const c = steuerelemente(s);
      tbody.append(
        h(
          'tr',
          {},
          h('td', { class: 'zahl' }, String(i + 1)),
          h('td', { class: 'links name' }, [s.name, s.vorname].filter(Boolean).join(', ')),
          c.punkteFelder.map((f) => h('td', {}, f)),
          h('td', { class: 'zahl' }, c.summe),
          h('td', { class: 'zahl' }, c.prozent),
          h('td', { class: 'mitte' }, c.note),
          h('td', { class: 'mitte' }, c.attest),
          h('td', {}, c.sonstiges),
        ),
      );
    });
    const tabelle = h('table', { class: 'tabelle eingabe' }, h('thead', {}, kopf1, kopf2), tbody);
    enterNachUnten(tabelle);
    return h('div', { class: 'tabelle-rahmen' }, tabelle);
  }

  function einzelBauen(personen) {
    if (personen.length === 0) return h('p', {}, 'Bitte zuerst unter „Grunddaten“ Schüler:innen eintragen.');
    einzelPosition = Math.min(einzelPosition, personen.length - 1);
    const s = personen[einzelPosition];
    const c = steuerelemente(s);
    const wechsel = (delta) => {
      einzelPosition = (einzelPosition + delta + personen.length) % personen.length;
      render();
    };
    return h(
      'div',
      { class: 'einzel' },
      h(
        'div',
        { class: 'einzel-kopf' },
        h('button', { type: 'button', class: 'knopf gross', onclick: () => wechsel(-1) }, '‹ Zurück'),
        h('div', {}, h('strong', {}, anzeigename(s)), h('div', { class: 'klein' }, `${einzelPosition + 1} von ${personen.length}`)),
        h('button', { type: 'button', class: 'knopf gross', onclick: () => wechsel(1) }, 'Weiter ›'),
      ),
      h(
        'div',
        { class: 'einzel-aufgaben' },
        ka.aufgaben.map((max, i) =>
          h('label', {}, `Aufgabe ${i + 1} (max. ${max === null ? '?' : String(max).replace('.', ',')})`, c.punkteFelder[i]),
        ),
      ),
      h(
        'div',
        { class: 'einzel-summe' },
        h('span', {}, 'Summe: ', c.summe),
        h('span', {}, 'Prozent: ', c.prozent),
        h('span', {}, 'Note: ', c.note),
      ),
      h('label', { class: 'schalter' }, c.attest, ' Attest'),
      h('label', {}, 'Sonstiges (für das Protokoll)', c.sonstiges),
    );
  }

  function spiegelZeichnen() {
    leeren(spiegel);
    const sp = notenspiegel(ka, d.schueler);
    spiegel.append(
      h(
        'table',
        { class: 'tabelle klein-tabelle' },
        h('thead', {}, h('tr', {}, [1, 2, 3, 4, 5, 6].map((n) => h('th', { title: NOTEN_WORTE[n] }, `Note ${n}`)), h('th', {}, 'Anzahl'), h('th', {}, 'Durchschnitt'))),
        h('tbody', {}, h('tr', {}, sp.anzahl.map((a) => h('td', { class: 'zahl' }, String(a))), h('td', { class: 'zahl' }, String(sp.gesamt)), h('td', { class: 'zahl' }, sp.durchschnitt === null ? '' : formatZahl(sp.durchschnitt, 2)))),
      ),
    );
  }
  updater.push(spiegelZeichnen);

  function render() {
    updater.length = 0;
    updater.push(() => { gesamtAnzeige.textContent = formatKurz(gesamtpunkte(ka)); });
    updater.push(spiegelZeichnen);
    aufgabenAnzahl.textContent = String(ka.aufgaben.length);
    leeren(arbeitsflaeche);
    const personen = aktiveSchueler(d);
    if (personen.length === 0) {
      arbeitsflaeche.append(h('p', { class: 'hinweis' }, 'Bitte zuerst unter „Grunddaten“ Schüler:innen eintragen.'));
    } else {
      arbeitsflaeche.append(modus === 'tabelle' ? tabelleBauen(personen) : einzelBauen(personen));
    }
    update();
  }

  render();
  return { el: wurzel, update };
}
