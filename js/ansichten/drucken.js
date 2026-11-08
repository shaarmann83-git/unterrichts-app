import { K } from '../kontext.js';
import { h, leeren, bestaetigen } from '../ui.js';
import { standText } from '../excel.js';
import { zeigeSportDruck } from './sport-druck.js';
import { aktiveSchueler, anzeigename, kurzname, datumDeutsch, fachZeile, unterschriftenFuer, spaltenName } from '../modell.js';
import { teilnahmeStatus } from '../nachschreiben.js';
import { anwesenheitsSeiten } from './anwesenheit-druck.js';
import { kopfbilderReihe } from './kopfbilder.js';
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
        ['blanko', 'Korrekturliste blanko (mit Höchstpunkten)'],
        ['korrektur', 'Korrekturliste ausgefüllt'],
        ['anwesenheit', 'Anwesenheitsliste (ausgefüllt)'],
        ['gesamt', 'Gesamtübersicht'],
        ['spiegel', 'Notenspiegel'],
        ...(d.dalton.modus !== 'aus' ? [['dalton', 'Bewertungskriterien Dalton']] : []),
      ].map(([w, t]) => h('option', { value: w, selected: art === w }, t)),
    );
    steuerung.append(h('label', {}, 'Ausdruck', artWahl));
    if (art === 'protokoll' || art === 'spiegel' || art === 'blanko' || art === 'korrektur') {
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
    if (art === 'protokoll') {
      steuerung.append(h('details', { class: 'kopfbilder' },
        h('summary', {}, 'Kopfbilder für das Protokoll'),
        h('p', { class: 'klein' }, 'Diese Bilder stehen oben auf dem Protokoll und gelten für das ganze Notenbuch. Haben Sie den Kopf als ein einziges Bild, genügt das erste Feld; es wird dann über die ganze Breite gezeigt.'),
        kopfbilderReihe(K.buch, () => { steuerungZeichnen(); vorschauZeichnen(); })));
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
    const dr = K.buch?.einstellungen?.druck || {};
    const band = (text, stark = false) => h('div', { class: `protokoll-band${stark ? ' stark' : ''}` }, text);
    const kasten = (text, hoch, mittig = false) => h('div', { class: `protokoll-kasten${mittig ? ' mittig' : ''}`, style: `min-height:${hoch}` }, text || '');
    // „Sonstiges“: zuerst, was die App weiß (Fehlen, Attest, Nachschreibtermin), danach der eigene Text der Lehrkraft
    const datumOderLeer = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? datumDeutsch(iso) : '');
    const tn = ka.teilnahme?.[s.id] || {};
    const wirksam = teilnahmeStatus(d, ka, s.id).status;
    const auto = [];
    if (wirksam === 'attest-offen') auto.push(`Gefehlt mit Attest.${datumOderLeer(tn.nachschreibtermin) ? ` Nachschreibtermin: ${datumOderLeer(tn.nachschreibtermin)}.` : ' Nachschreibtermin folgt.'}`);
    else if (wirksam === 'nachgeschrieben') auto.push(`Nachgeschrieben${datumOderLeer(tn.nachschreibtermin) ? ` am ${datumOderLeer(tn.nachschreibtermin)}` : ''}.`);
    else if (wirksam === 'ohne-attest') auto.push('Gefehlt ohne Attest.');
    else if (wirksam === 'entschuldigung-offen') auto.push('Gefehlt, Entschuldigung noch offen.');
    const sonstigesText = [...auto, (roh?.sonstiges || '').trim()].filter(Boolean).join('\n');
    const werte = e.attest
      ? [['Bewertung', 'Attest vorgelegt, keine Bewertung.']]
      : [
          ['erreichte Punktzahl:', e.summe === null ? '' : `${formatKurz(e.summe)}/${formatKurz(gesamt)}`],
          ['Prozentzahl:', e.prozent === null ? '' : `${formatZahl(e.prozent, 1)} %`],
          [istPunktsystem(d) ? 'Notenpunkte:' : 'Note:', e.note === null ? '' : (istPunktsystem(d) ? String(e.note).padStart(2, '0') : NOTEN_WORTE[e.note])],
        ];
    // Zusatzzeile nur bei schlechter als ausreichend: Note über 4,0, bei Punkten unter 4
    const schlecht = !e.attest && e.note !== null && (istPunktsystem(d) ? e.note < 4 : e.note > 4);
    const zeilen = unterschriftenFuer(d, s, { schlechter: schlecht, stichtag: ka.datum });
    return h(
      'article',
      { class: 'druckseite protokoll' },
      // Ein einzelnes Bild wird über die ganze Breite gezeigt, zwei Bilder links und rechts.
      (dr.kopfLinks || dr.kopfRechts) && (dr.kopfLinks && dr.kopfRechts
        ? h('div', { class: 'protokoll-kopfbilder' },
          h('div', {}, h('img', { src: dr.kopfLinks, alt: '' })),
          h('div', { class: 'rechts' }, h('img', { src: dr.kopfRechts, alt: '' })))
        : h('div', { class: 'protokoll-kopfbild-voll' }, h('img', { src: dr.kopfLinks || dr.kopfRechts, alt: '' }))),
      h('table', { class: 'protokoll-tabelle kopf' }, h('colgroup', {}, h('col', { style: 'width:40%' }), h('col', { style: 'width:30%' }), h('col', { style: 'width:30%' })), h('tbody', {},
        h('tr', {},
          h('td', {}, h('strong', {}, 'Name: '), anzeigename(s)),
          h('td', {}, h('strong', {}, 'Klasse: '), d.kopf.klasse || ''),
          h('td', {}, h('strong', {}, 'Datum: '), datumDeutsch(ka.datum))))),
      band(fachZeile(d.kopf) || `${d.kopf.fachLabel || 'Lernfeld'}:`, true),
      band(`Thematische Schwerpunkte der Klassenarbeit Nr. ${nr}:`),
      kasten(ka.schwerpunkte, '16rem', true),
      band('Sonstiges'),
      kasten(sonstigesText, '7rem'),
      h('table', { class: 'protokoll-tabelle ergebnis' }, h('tbody', {},
        h('tr', {}, werte.map(([t]) => h('td', {}, h('strong', {}, t)))),
        h('tr', {}, werte.map(([, v]) => h('td', { class: 'mitte' }, v))))),
      // Unterschriften: links das Feld der Lehrkraft mit dem Korrekturdatum, rechts die
      // Zeile je nach Ausbildung über die volle Höhe, genau wie in der Vorlage der Schule.
      h('table', { class: 'protokoll-tabelle unterschrift' },
        h('colgroup', {}, zeilen.map((_, i) => h('col', { style: `width:${i === 0 ? 61 : Math.round(39 / Math.max(1, zeilen.length - 1))}%` }))),
        h('tbody', {},
          h('tr', {}, zeilen.map((t, i) => h('td', { class: i === 0 ? '' : 'hoch', rowspan: i === 0 ? 1 : 2 },
            t.split('\n').map((teil, k) => h('div', { class: k === 0 ? 'stark' : 'klein' }, teil))))),
          h('tr', {}, h('td', { class: 'feld' }, ka.korrekturdatum ? datumDeutsch(ka.korrekturdatum) : ' ')))),
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
