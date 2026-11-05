import { K } from '../kontext.js';
import { h, leeren, bestaetigen } from '../ui.js';
import { standText } from '../excel.js';
import { zeigeSportDruck } from './sport-druck.js';
import { aktiveSchueler, anzeigename, kurzname, datumDeutsch, fachZeile } from '../modell.js';
import { ergebnisKA, gesamtpunkte, notenspiegel, gesamtPerson, formatKurz, formatZahl, NOTEN_WORTE, istPunktsystem } from '../rechnen.js';

let art = 'protokoll';
let kaNr = 1;
let personId = 'alle';

export function zeigeDruck() {
  if (K.daten.fachtyp === 'sport') return zeigeSportDruck();
  const d = K.daten;
  const wurzel = h('section', { class: 'seite druck-seite' });
  const vorschau = h('div', { class: 'druck-vorschau' });
  const steuerung = h('div', { class: 'druck-steuerung' });

  function steuerungZeichnen() {
    leeren(steuerung);
    const artWahl = h(
      'select',
      { 'aria-label': 'Was soll gedruckt werden?', onchange: (e) => { art = e.target.value; steuerungZeichnen(); vorschauZeichnen(); } },
      [
        ['protokoll', 'Protokoll je Klassenarbeit und Schüler:in'],
        ['blanko', 'Korrekturliste blanko'],
        ['gesamt', 'Gesamtübersicht'],
        ['spiegel', 'Notenspiegel'],
        ...(d.dalton.modus !== 'aus' ? [['dalton', 'Bewertungskriterien Dalton']] : []),
      ].map(([w, t]) => h('option', { value: w, selected: art === w }, t)),
    );
    steuerung.append(h('label', {}, 'Ausdruck', artWahl));
    if (art === 'protokoll' || art === 'spiegel') {
      const kaWahl = h(
        'select',
        { 'aria-label': 'Klassenarbeit', onchange: (e) => { kaNr = Number(e.target.value); vorschauZeichnen(); } },
        d.klassenarbeiten.map((_, i) => h('option', { value: i + 1, selected: kaNr === i + 1 }, `Klassenarbeit ${i + 1}`)),
      );
      if (art === 'protokoll') {
        steuerung.append(h('label', {}, 'Klassenarbeit', kaWahl));
        const pWahl = h(
          'select',
          { 'aria-label': 'Person', onchange: (e) => { personId = e.target.value; vorschauZeichnen(); } },
          h('option', { value: 'alle', selected: personId === 'alle' }, 'Alle (Sammeldruck)'),
          aktiveSchueler(d).map((s) => h('option', { value: s.id, selected: personId === s.id }, anzeigename(s))),
        );
        steuerung.append(h('label', {}, 'Person', pWahl));
      }
    }
    const ka = d.klassenarbeiten[kaNr - 1] || d.klassenarbeiten[0];
    if (art === 'protokoll' && ka && !ka.korrekturdatum) {
      steuerung.append(h('p', { class: 'warnung' }, 'Kein Korrekturdatum eingetragen. Es erscheint dann nicht im Protokoll. Sie können es oben bei der Klassenarbeit nachtragen.'));
    }
    steuerung.append(h('button', { type: 'button', class: 'knopf primaer', onclick: async () => {
      if (art === 'protokoll' && ka && !ka.korrekturdatum
        && !(await bestaetigen('Korrekturdatum fehlt', 'Für diese Klassenarbeit ist kein Korrekturdatum eingetragen. Trotzdem drucken?', 'Trotzdem drucken'))) return;
      window.print();
    } }, 'Drucken / PDF speichern'));
  }

  function protokollSeite(ka, nr, s) {
    const e = ergebnisKA(ka, s.id, d);
    const roh = ka.ergebnisse[s.id];
    const gesamt = gesamtpunkte(ka);
    const zeile = (text, wert) => h('p', { class: 'protokoll-zeile' }, h('strong', {}, `${text} `), wert);
    return h(
      'article',
      { class: 'druckseite protokoll' },
      h('h2', {}, anzeigename(s)),
      h('p', {}, `Klasse: ${d.kopf.klasse || ''}`),
      h('p', {}, `Datum der Arbeit: ${datumDeutsch(ka.datum)}`),
      h('p', {}, fachZeile(d.kopf)),
      h('p', { class: 'protokoll-zeile' }, h('strong', {}, `Thematische Schwerpunkte der Klassenarbeit Nr. ${nr}:`)),
      h('p', { class: 'freitext' }, ka.schwerpunkte || ''),
      h('p', { class: 'protokoll-zeile' }, h('strong', {}, 'Sonstiges:')),
      h('p', { class: 'freitext' }, roh?.sonstiges || ''),
      e.attest
        ? h('p', { class: 'protokoll-zeile' }, h('strong', {}, 'Attest vorgelegt, keine Bewertung.'))
        : [
            zeile('erreichte Punktzahl:', e.summe === null ? '' : `${formatKurz(e.summe)}/${formatKurz(gesamt)}`),
            zeile('Prozentzahl:', e.prozent === null ? '' : `${formatZahl(e.prozent, 1)} %`),
            zeile(istPunktsystem(d) ? 'Notenpunkte:' : 'Note:', e.note === null ? '' : (istPunktsystem(d) ? String(e.note).padStart(2, '0') : NOTEN_WORTE[e.note])),
          ],
      ka.korrekturdatum ? h('p', { class: 'protokoll-zeile' }, h('strong', {}, 'Korrekturdatum: '), datumDeutsch(ka.korrekturdatum)) : null,
      h('div', { class: 'unterschriften' },
        (d.unterschriften || []).filter((t) => String(t).trim()).map((t) => h('div', { class: 'linie' }, t)),
      ),
    );
  }

  function blanko() {
    const personen = aktiveSchueler(d);
    const zeilen = personen.length ? personen : Array.from({ length: 32 }, () => ({ name: '', vorname: '' }));
    return h(
      'article',
      { class: 'druckseite quer' },
      h('h2', {}, 'Korrekturliste'),
      h('p', {}, `Klasse: ${d.kopf.klasse || ''}   ·   ${fachZeile(d.kopf)}   ·   Klassenarbeit Nr.: ______`),
      h(
        'table',
        { class: 'tabelle druck-tabelle blanko' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Nr.'), h('th', { class: 'links' }, 'Name'), Array.from({ length: 16 }, (_, i) => h('th', {}, String(i + 1))), ['∑', '%', 'Note', 'Attest'].map((t) => h('th', {}, t)))),
        h('tbody', {}, zeilen.map((s, i) => h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links' }, kurzname(s)), Array.from({ length: 20 }, () => h('td', {}))))),
      ),
    );
  }

  function gesamtDruck() {
    const personen = aktiveSchueler(d);
    return h(
      'article',
      { class: 'druckseite quer' },
      h('h2', {}, 'Gesamtübersicht'),
      h('p', { class: 'stand' }, h('strong', {}, standText(d))),
      h('p', {}, `Klasse ${d.kopf.klasse || ''} · ${fachZeile(d.kopf)} · Schuljahr ${d.kopf.schuljahr || ''} · Gewichtung schriftlich ${String(d.gewichtSchriftlich).replace('.', ',')} % / sonstige ${String(100 - d.gewichtSchriftlich).replace('.', ',')} %`),
      h(
        'table',
        { class: 'tabelle druck-tabelle' },
        h('thead', {}, h('tr', {}, ['Nr.', 'Name', 'Vorname', 'Gesamt %', 'Note'].map((t) => h('th', {}, t)), d.klassenarbeiten.map((ka, i) => h('th', {}, `KA ${i + 1} % (×${String(ka.gewicht).replace('.', ',')})`)), ['Ø KA', 'Anz. sL', 'Ø sL'].map((t) => h('th', {}, t)))),
        h('tbody', {}, personen.map((s, i) => {
          const g = gesamtPerson(d, s.id);
          return h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links' }, s.name), h('td', { class: 'links' }, s.vorname), h('td', { class: 'zahl' }, formatZahl(g.gesamtProzent, 2)), h('td', { class: 'mitte' }, g.gesamtNote ?? ''), g.kaProzente.map((p) => h('td', { class: 'zahl' }, formatZahl(p, 1))), h('td', { class: 'zahl' }, formatZahl(g.oKA, 2)), h('td', { class: 'zahl' }, String(g.anzahlSL)), h('td', { class: 'zahl' }, formatZahl(g.oSL, 2)));
        })),
      ),
    );
  }

  function spiegelDruck(ka, nr) {
    const sp = notenspiegel(ka, aktiveSchueler(d), d);
    return h(
      'article',
      { class: 'druckseite' },
      h('h2', {}, `Notenspiegel Klassenarbeit ${nr}`),
      h('p', {}, `Klasse ${d.kopf.klasse || ''} · ${fachZeile(d.kopf)} · ${datumDeutsch(ka.datum)}`),
      h(
        'table',
        { class: 'tabelle druck-tabelle' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Note'), h('th', {}, 'Bezeichnung'), h('th', {}, 'Anzahl'))),
        h('tbody', {}, sp.anzahl.map((a, i) => h('tr', {}, h('td', { class: 'mitte' }, sp.punkte ? String(sp.stufen[i]).padStart(2, '0') : String(sp.stufen[i])), h('td', { class: 'links' }, sp.punkte ? 'Punkte' : NOTEN_WORTE[sp.stufen[i]]), h('td', { class: 'zahl' }, String(a)))),
          h('tr', {}, h('td', { colspan: 2, class: 'links' }, 'Teilnehmende mit Note'), h('td', { class: 'zahl' }, String(sp.gesamt))),
          h('tr', {}, h('td', { colspan: 2, class: 'links' }, 'Durchschnitt'), h('td', { class: 'zahl' }, sp.durchschnitt === null ? '' : formatZahl(sp.durchschnitt, 2)))),
      ),
    );
  }

  function daltonDruck() {
    const z = d.dalton.zuordnung;
    const t = d.dalton.texte;
    const zeilen = [['gut', 'abgegeben, gut'], ['mittel', 'abgegeben, mittel'], ['schlecht', 'abgegeben, schlecht'], ['nicht', 'nicht abgegeben'], ['taeuschung', 'Täuschung (abgeschrieben)']];
    return h(
      'article',
      { class: 'druckseite' },
      h('h2', {}, 'Bewertungskriterien Dalton'),
      h('p', {}, `Klasse ${d.kopf.klasse || ''} · ${fachZeile(d.kopf)} · Schuljahr ${d.kopf.schuljahr || ''}`),
      h('p', {}, d.dalton.modus === 'einrechnen' ? `Die Dalton-Aufgaben haben einen Anteil von ${String(d.dalton.anteil).replace('.', ',')} % an der sonstigen Leistung.` : 'Die Dalton-Aufgaben werden dokumentiert und fließen nicht in die Note ein.'),
      h('table', { class: 'tabelle druck-tabelle' },
        h('thead', {}, h('tr', {}, ['Stufe', 'Beschreibung', 'Note'].map((x) => h('th', {}, x)))),
        h('tbody', {}, zeilen.map(([k, text]) => h('tr', {}, h('td', { class: 'links' }, text), h('td', { class: 'links' }, t[k] || ''), h('td', { class: 'mitte' }, formatZahl(z[k], 1)))))),
      h('p', { class: 'klein' }, 'Entschuldigte Aufgaben zählen nicht.'),
    );
  }

  function vorschauZeichnen() {
    leeren(vorschau);
    if (art === 'dalton') vorschau.append(daltonDruck());
    else if (art === 'blanko') vorschau.append(blanko());
    else if (art === 'gesamt') vorschau.append(gesamtDruck());
    else {
      const ka = d.klassenarbeiten[kaNr - 1] || d.klassenarbeiten[0];
      if (!ka) return vorschau.append(h('p', { class: 'hinweis' }, 'Noch keine Klassenarbeit angelegt.'));
      const nr = d.klassenarbeiten.indexOf(ka) + 1;
      if (art === 'spiegel') return vorschau.append(spiegelDruck(ka, nr));
      let personen = aktiveSchueler(d);
      if (personId !== 'alle') personen = personen.filter((s) => s.id === personId);
      else personen = personen.filter((s) => ergebnisKA(ka, s.id, d).note !== null || ergebnisKA(ka, s.id, d).attest);
      if (personen.length === 0) vorschau.append(h('p', { class: 'hinweis' }, 'Für diese Klassenarbeit sind noch keine Ergebnisse eingetragen.'));
      for (const s of personen) vorschau.append(protokollSeite(ka, nr, s));
    }
  }

  wurzel.append(h('h1', {}, 'Drucken'), steuerung, h('p', { class: 'klein' }, 'Die Vorschau unten wird gedruckt. Im Druckdialog „Als PDF speichern“ wählen, um ein PDF zu erhalten.'), vorschau);
  steuerungZeichnen();
  vorschauZeichnen();
  return { el: wurzel };
}
