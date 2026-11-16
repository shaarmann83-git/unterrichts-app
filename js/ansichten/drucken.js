import { K } from '../kontext.js';
import { h, leeren, bestaetigen, fuege } from '../ui.js';
import { standText } from '../excel.js';
import { zeigeSportDruck } from './sport-druck.js';
import { aktiveSchueler, anzeigename, kurzname, datumDeutsch, fachZeile, zweiteUnterschrift, UNTERSCHRIFT_LEHRKRAFT, spaltenName } from '../modell.js';
import { teilnahmeStatus, fehlzeitenAmTermin } from '../nachschreiben.js';
import { anwesenheitsSeiten } from './anwesenheit-druck.js';
import { schriftStil, protokollEinstellungen } from './protokoll-einstellungen.js';

/** Schriftarten für das Protokoll. „Calibri“ nutzt die Schrift des Geräts, sonst die mitgelieferte Ersatzschrift Carlito (gleiche Maße). */
import { ergebnisKA, gesamtpunkte, notenspiegel, gesamtPerson, formatKurz, formatZahl, NOTEN_WORTE, istPunktsystem } from '../rechnen.js';

let art = 'protokoll';
/** Vorauswahl, wenn man aus dem Reiter Klassenarbeiten direkt zum Drucken der Protokolle kommt. */
export function druckVorwahl(nr) { art = 'protokoll'; kaNr = nr; personId = 'alle'; }
let kaNr = 1;
let personId = 'alle';

function klassenWahl() {
  const wurzel = h('section', { class: 'seite' });
  fuege(wurzel, h('h1', {}, 'Drucken'), h('p', {}, 'Für welche Klasse möchten Sie drucken?'),
    h('div', { class: 'knopfreihe' }, K.buch.klassen.map((k) => h('button', { type: 'button', class: 'knopf gross', 'data-klasse': k.id, onclick: () => { K.klasseId = k.id; K.neuZeichnen(); } },
      [k.kopf.klasse || 'Ohne Namen', k.kopf.lernfeldNr && `LF ${k.kopf.lernfeldNr}`].filter(Boolean).join(' · ')))));
  return { el: wurzel };
}

export function zeigeDruck() {
  if (!K.daten) return klassenWahl();
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
        ['protokoll-blanko', 'Protokoll blanko (zum Ausfüllen von Hand)'],
        ['blanko', 'Korrekturliste blanko (mit Höchstpunkten)'],
        ['korrektur', 'Korrekturliste ausgefüllt'],
        ['anwesenheit', 'Anwesenheitsliste (ausgefüllt)'],
        ['gesamt', 'Gesamtübersicht'],
        ['spiegel', 'Notenspiegel'],
        ...(d.dalton.modus !== 'aus' ? [['dalton', 'Bewertungskriterien Dalton']] : []),
      ].map(([w, t]) => h('option', { value: w, selected: art === w }, t)),
    );
    steuerung.append(h('label', {}, 'Ausdruck', artWahl));
    if (art === 'protokoll' || art === 'protokoll-blanko' || art === 'spiegel' || art === 'blanko' || art === 'korrektur') {
      const kaWahl = h(
        'select',
        { 'aria-label': 'Klassenarbeit', onchange: (e) => { kaNr = Number(e.target.value); vorschauZeichnen(); } },
        d.klassenarbeiten.map((_, i) => h('option', { value: i + 1, selected: kaNr === i + 1 }, `Klassenarbeit ${i + 1}`)),
      );
      steuerung.append(h('label', {}, 'Klassenarbeit', kaWahl));
      if (art === 'protokoll') {
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
    if (art === 'protokoll' || art === 'protokoll-blanko') {
      steuerung.append(protokollEinstellungen(d, () => { steuerungZeichnen(); vorschauZeichnen(); }));
    }
    steuerung.append(h('button', { type: 'button', class: 'knopf primaer', onclick: async () => {
      if (art === 'protokoll' && ka && !ka.korrekturdatum
        && !(await bestaetigen('Korrekturdatum fehlt', 'Für diese Klassenarbeit ist kein Korrekturdatum eingetragen. Trotzdem drucken?', 'Trotzdem drucken'))) return;
      window.print();
    } }, 'Drucken / PDF speichern'));
  }

  // Protokoll nach der Vorlage der Schule (11/2026). `blanko`: ohne Person und Ergebnis zum Ausfüllen von Hand.
  function protokollSeite(ka, nr, s, blanko = false) {
    const e = blanko ? { summe: null, prozent: null, note: null, attest: false } : ergebnisKA(ka, s.id, d);
    const roh = blanko ? null : ka.ergebnisse[s.id];
    const gesamt = gesamtpunkte(ka);
    const dr = K.buch?.einstellungen?.druck || {};
    const band = (text, stark = false) => h('div', { class: `protokoll-band${stark ? ' stark' : ''}` }, text);
    const datumOderLeer = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? datumDeutsch(iso) : '');
    // Schwerpunkte: jede Zeile ein Aufzählungspunkt, im Kasten vertikal mittig, Text linksbündig
    const punkte = String(ka.schwerpunkte || '').split('\n').map((z) => z.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
    const schwerpunkte = h('div', { class: 'protokoll-kasten schwerpunkte' }, punkte.length ? h('ul', {}, punkte.map((z) => h('li', {}, z))) : null);
    // „Sonstiges“: zuerst, was die App weiß (Nachschreibtermin, unentschuldigtes Fehlen, kein Attest), danach der eigene Text
    const auto = [];
    if (blanko) auto.push('Nachschreibtermin: xx.xx.xxxx', 'Unentschuldigtes Fehlen', 'Kein Attest');
    else {
      const tn = ka.teilnahme?.[s.id] || {};
      const wirksam = teilnahmeStatus(d, ka, s.id).status;
      if (wirksam === 'attest-offen') auto.push(`Nachschreibtermin: ${datumOderLeer(tn.nachschreibtermin) || 'folgt'}`);
      else if (wirksam === 'nachgeschrieben') auto.push(`Nachschreibtermin: ${datumOderLeer(tn.nachgeschriebenAm) || datumOderLeer(tn.nachschreibtermin) || 'nachgeschrieben'}`);
      else if (wirksam === 'ohne-attest') {
        if (fehlzeitenAmTermin(d, ka, s.id).some((f) => f.status === 'nicht')) auto.push('Unentschuldigtes Fehlen');
        auto.push('Kein Attest');
      } else if (wirksam === 'entschuldigung-offen') auto.push('Entschuldigung noch offen');
    }
    const eigeneZeilen = String(roh?.sonstiges || '').split('\n').map((z) => z.trim()).filter(Boolean);
    const sonstiges = h('div', { class: 'protokoll-kasten sonstiges' }, [...auto, ...eigeneZeilen].map((z) => h('div', {}, z)));
    const werte = e.attest
      ? [['Bewertung', 'Attest vorgelegt, keine Bewertung.']]
      : [
          ['erreichte Punktzahl:', e.summe === null ? '' : `${formatKurz(e.summe)}/${formatKurz(gesamt)}`],
          ['Prozent:', e.prozent === null ? '' : `${formatZahl(e.prozent, 1)} %`],
          [istPunktsystem(d) ? 'Notenpunkte:' : 'Note:', e.note === null ? '' : (istPunktsystem(d) ? String(e.note).padStart(2, '0') : NOTEN_WORTE[e.note])],
        ];
    // Unterschriften: links fest die Lehrkraft, rechts je nach Einstellung der Klasse ausbildende oder erziehungsberechtigte Person oder nichts
    const hauptZeilen = [UNTERSCHRIFT_LEHRKRAFT, zweiteUnterschrift(d)].filter(Boolean);
    const textBlock = (t) => t.split('\n').map((teil, k) => h('div', { class: k === 0 ? 'stark' : 'klein' }, teil));
    const mitte = dr.kopfText && h('div', { class: 'kopf-text' }, dr.kopfText);
    return h(
      'article',
      { class: 'druckseite protokoll', style: schriftStil(dr.schrift) },
      // Ein einzelnes Bild wird über die ganze Breite gezeigt, zwei Bilder links und rechts, optional mit Text dazwischen.
      (dr.kopfLinks || dr.kopfRechts) && (dr.kopfLinks && dr.kopfRechts
        ? h('div', { class: 'protokoll-kopfbilder' },
          h('div', {}, h('img', { src: dr.kopfLinks, alt: '' })),
          mitte,
          h('div', { class: 'rechts' }, h('img', { src: dr.kopfRechts, alt: '' })))
        : h('div', { class: 'protokoll-kopfbild-voll' }, h('img', { src: dr.kopfLinks || dr.kopfRechts, alt: '' }))),
      // Alles unter dem Kopf steht als Block, der auf dem Blatt zwischen den Seitenrändern zentriert wird (wie in der Word-Vorlage)
      h('div', { class: 'protokoll-block' },
        h('table', { class: 'protokoll-tabelle kopf' }, h('colgroup', {}, h('col', { style: 'width:33.33%' }), h('col', { style: 'width:33.33%' }), h('col', { style: 'width:33.33%' })), h('tbody', {},
          h('tr', {}, ['Name:', 'Klasse:', 'Datum:'].map((t) => h('td', { class: 'etikett' }, h('strong', {}, t)))),
          h('tr', {}, [blanko ? '' : anzeigename(s), d.kopf.klasse || '', datumDeutsch(ka.datum)].map((t) => h('td', { class: 'wert' }, t))))),
        band(fachZeile(d.kopf) || `${d.kopf.fachLabel || 'Lernfeld'}:`, true),
        band(`Thematische Schwerpunkte der Klassenarbeit Nr. ${nr}`),
        schwerpunkte,
        band('Sonstiges'),
        sonstiges,
        h('table', { class: 'protokoll-tabelle ergebnis' }, h('tbody', {},
          h('tr', {}, werte.map(([t]) => h('td', {}, h('strong', {}, t)))),
          h('tr', {}, werte.map(([, v]) => h('td', { class: 'mitte' }, v))))),
        // Unterschriften: links das Feld der Lehrkraft mit dem Korrekturdatum, rechts die Zeile für die ausbildende Person
        h('table', { class: 'protokoll-tabelle unterschrift' },
          h('colgroup', {}, hauptZeilen.map((_, i) => h('col', { style: `width:${i === 0 ? 50 : (50 / Math.max(1, hauptZeilen.length - 1)).toFixed(1)}%` }))),
          h('tbody', {},
            h('tr', {}, hauptZeilen.map((t, i) => h('td', { class: i === 0 ? '' : 'hoch', rowspan: i === 0 ? 1 : 2 }, textBlock(t)))),
            h('tr', {}, h('td', { class: 'feld' }, ka.korrekturdatum && !blanko ? datumDeutsch(ka.korrekturdatum) : ' ')))),
      ),
    );
  }

  // Korrekturliste: leer (mit den Höchstpunkten, falls schon eingetragen) oder mit allen Punkten und Ergebnissen
  function korrekturListe(ka, nr, gefuellt) {
    const personen = aktiveSchueler(d);
    const zeilen = personen.length ? personen : Array.from({ length: 32 }, () => ({ name: '', vorname: '' }));
    const anzahl = ka?.aufgaben?.length || 16;
    const hoechst = ka ? ka.aufgaben : [];
    const hatHoechst = hoechst.some((x) => x !== null && x !== undefined && x !== '');
    const nummer = ka ? String(nr) : '______';
    const feld = (x) => (x === null || x === undefined || x === '' ? '' : formatKurz(Number(x)));
    return h(
      'article',
      { class: 'druckseite quer' },
      h('h2', {}, 'Korrekturliste'),
      h('p', {}, `Klasse: ${d.kopf.klasse || ''}   ·   ${fachZeile(d.kopf)}   ·   Klassenarbeit Nr.: ${nummer}${ka?.datum ? `   ·   ${datumDeutsch(ka.datum)}` : ''}`),
      h(
        'table',
        { class: 'tabelle druck-tabelle blanko' },
        h('thead', {},
          h('tr', {}, h('th', {}, 'Nr.'), h('th', { class: 'links' }, 'Name'),
            Array.from({ length: anzahl }, (_, i) => h('th', {}, ka?.aufgaben?.length ? spaltenName(ka, i) : String(i + 1))),
            ['∑', '%', 'Note', 'Attest'].map((t) => h('th', {}, t))),
          hatHoechst && h('tr', { class: 'hoechst-druck' }, h('td', {}), h('td', { class: 'links' }, 'Höchstpunkte'),
            Array.from({ length: anzahl }, (_, i) => h('td', { class: 'mitte' }, feld(hoechst[i]))),
            h('td', { class: 'mitte' }, formatKurz(gesamtpunkte(ka))), h('td', {}), h('td', {}), h('td', {}))),
        h('tbody', {}, zeilen.map((s, i) => {
          const e = gefuellt && s.id ? ergebnisKA(ka, s.id, d) : null;
          const punkte = (gefuellt && s.id && ka?.ergebnisse?.[s.id]?.punkte) || [];
          return h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links' }, kurzname(s)),
            Array.from({ length: anzahl }, (_, k) => h('td', { class: 'mitte' }, gefuellt ? feld(punkte[k]) : '')),
            h('td', { class: 'mitte' }, e && e.summe !== null ? formatKurz(e.summe) : ''),
            h('td', { class: 'mitte' }, e && e.prozent !== null ? formatZahl(e.prozent, 1) : ''),
            h('td', { class: 'mitte' }, e && e.note !== null ? (istPunktsystem(d) ? String(e.note).padStart(2, '0') : String(e.note)) : ''),
            h('td', { class: 'mitte' }, e?.attest ? 'x' : ''));
        })),
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
    else if (art === 'blanko' || art === 'korrektur') {
      const ka = d.klassenarbeiten[kaNr - 1] || d.klassenarbeiten[0];
      if (!ka && art === 'korrektur') return vorschau.append(h('p', { class: 'hinweis' }, 'Noch keine Klassenarbeit angelegt.'));
      vorschau.append(korrekturListe(ka, d.klassenarbeiten.indexOf(ka) + 1, art === 'korrektur'));
    } else if (art === 'anwesenheit') vorschau.append(...anwesenheitsSeiten(d));
    else if (art === 'gesamt') vorschau.append(gesamtDruck());
    else {
      const ka = d.klassenarbeiten[kaNr - 1] || d.klassenarbeiten[0];
      if (!ka) return vorschau.append(h('p', { class: 'hinweis' }, 'Noch keine Klassenarbeit angelegt.'));
      const nr = d.klassenarbeiten.indexOf(ka) + 1;
      if (art === 'spiegel') return vorschau.append(spiegelDruck(ka, nr));
      if (art === 'protokoll-blanko') return vorschau.append(protokollSeite(ka, nr, null, true));
      let personen = aktiveSchueler(d);
      if (personId !== 'alle') personen = personen.filter((s) => s.id === personId);
      else personen = personen.filter((s) => ergebnisKA(ka, s.id, d).note !== null || ergebnisKA(ka, s.id, d).attest || teilnahmeStatus(d, ka, s.id).status === 'ohne-attest');
      if (personen.length === 0) vorschau.append(h('p', { class: 'hinweis' }, 'Für diese Klassenarbeit sind noch keine Ergebnisse eingetragen.'));
      for (const s of personen) vorschau.append(protokollSeite(ka, nr, s));
    }
  }

  wurzel.append(h('h1', {}, 'Drucken'), steuerung, h('p', { class: 'klein' }, 'Die Vorschau unten wird gedruckt. Im Druckdialog „Als PDF speichern“ wählen, um ein PDF zu erhalten.'), vorschau);
  steuerungZeichnen();
  vorschauZeichnen();
  return { el: wurzel };
}
