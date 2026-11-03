// Druck Sport (SPEC 9.6): Kriterienblatt je Reihe, Erfassungsbogen Prüfung, leere Anwesenheits-/Mitarbeitsliste, Notenliste.
import { K } from '../kontext.js';
import { h, leeren, fuege } from '../ui.js';
import { aktiveSchueler, anzeigename, kurzname, datumDeutsch, STUFEN_STANDARD } from '../modell.js';
import { einstellungenAus, teilHoechstwert, endnotenKlasse, reihenErgebnis, punkte, ZEICHEN } from '../sport.js';
import { standText } from '../excel.js';

let art = 'kriterien';
let reiheId = null;
const f1 = (x) => String(Math.round(x * 100) / 100).replace('.', ',');

function kriterienblatt(d, reihe, ein) {
  const g = reihe.gewichte;
  const stufen = (t) => t.stufen || STUFEN_STANDARD;
  const ab = ['1', '2', '3', '4', '5'];
  const schluessel = ein.pruefschluessel;
  const tab = ein.mitarbeitsTabelle;
  const direkte = reihe.direkte.map((x) => `${x.name} ${f1(x.gewicht ?? 1)}`);
  return h('article', { class: 'druckseite kriterien' },
    h('h2', {}, `Bewertungskriterien Sport: ${reihe.name}`),
    h('p', {}, `Klasse ${d.kopf.klasse || ''} · Schuljahr ${d.kopf.schuljahr || ''}`),
    h('h3', {}, 'Gewichtung der Reihe'),
    h('p', {}, `Prüfung ${f1(g.pruefung)} · Mitarbeit ${f1(g.mitarbeit)}${(g.verhalten ?? 0) > 0 ? ` · Verhalten ${f1(g.verhalten)}` : ''}${direkte.length ? ' · ' + direkte.join(' · ') : ''}. Fehlt eine Teilleistung, verteilt sich ihr Gewicht auf die übrigen.`),
    h('h3', {}, 'Prüfung'),
    reihe.teile.length === 0 ? h('p', {}, 'Keine Prüfungsteile eingetragen.') :
    h('table', { class: 'tabelle druck-tabelle' },
      h('thead', {}, h('tr', {}, ['Teil', 'Versuche', 'Höchstwert', 'Gewicht', 'Zielzone / Bedingung', 'Drei Merkmale'].map((t) => h('th', {}, t)))),
      h('tbody', {}, reihe.teile.map((t) => h('tr', {}, h('td', { class: 'links' }, h('strong', {}, t.name)), h('td', {}, String(t.versuche)), h('td', {}, String(teilHoechstwert(t))), h('td', {}, f1(t.gewicht ?? 1)), h('td', { class: 'links' }, t.zone || ''), h('td', { class: 'links' }, t.merkmale.filter(Boolean).join('; ')))))),
    h('p', {}, h('strong', {}, 'Bewertung je Versuch (0–3 Punkte): '), '0 = ', STUFEN_STANDARD[0], '; 1 = ', STUFEN_STANDARD[1], '; 2 = ', STUFEN_STANDARD[2], '; 3 = ', STUFEN_STANDARD[3], '.'),
    reihe.teile.filter((t) => t.stufen).map((t) => h('p', { class: 'klein' }, h('strong', {}, `${t.name}: `), t.stufen.map((x, i) => `${i} = ${x}`).join('; '))),
    h('p', {}, `Prüfungsnote aus dem Anteil der erreichten Punkte: ab ${schluessel.map((x, i) => `${f1(x)} % → Note ${i + 1}`).join('; ab ')}; darunter Note 6.`),
    h('h3', {}, 'Mitarbeit'),
    h('p', {}, `Jede zählende Stunde zählt automatisch ${f1(ein.standardwert)}; Abweichungen: 3 = durchgehend aktiv, 1 = überwiegend passiv, 0 = anwesend ohne Beteiligung. Mindestens ${ein.mindestTermine} zählende Termine sind nötig, sonst entscheidet die Prüfung allein.`),
    h('table', { class: 'tabelle druck-tabelle' }, h('thead', {}, h('tr', {}, h('th', {}, 'Durchschnitt'), ab.map((n, i) => h('th', {}, `ab ${f1(tab[i])} → ${n}`)), h('th', {}, `darunter → 6`)))),
    reihe.merkmaleTexte.some(Boolean) && h('div', {}, h('p', {}, `Aufwertungsmerkmale: Ein Merkmal gilt, wenn es in mindestens 2 Terminen gezeigt wurde. Je gezeigtem Merkmal wird die Mitarbeitsnote um ${f1(ein.schritt)} Note besser, insgesamt höchstens um eine ganze Note.`),
      h('ul', {}, reihe.merkmaleTexte.map((x, i) => x && h('li', {}, h('strong', {}, `M${i + 1}: `), x)))),
    h('h3', {}, 'Regeln'),
    h('ul', {},
      h('li', {}, 'sps (Sportsachen vergessen): Das erste Mal im Halbjahr zählt wie anwesend, ab dem zweiten Mal zählt die Stunde als 0. Häkchen für Merkmale aus diesen Stunden zählen nicht.'),
      h('li', {}, 'Fehlen: entschuldigt oder mit Attest zählt nicht; unentschuldigt (U, ku) zählt als 0. Offene Einträge (k, Strich) zählen zunächst ' + (ein.offenZaehltNull ? 'als 0.' : 'nicht.')),
      h('li', {}, `Prüfungstag (Kennzeichen ${ein.pruefungstagKennzeichen.join(' oder ')}): Fehlt jemand an allen Prüfungstagen unentschuldigt und hat keinen Prüfungswert, ist die Prüfungsnote 6. Bei entschuldigtem Fehlen gibt es eine Nachprüfung.`),
      reihe.ersatzTeile.length > 0 || reihe.ersatzHinweis ? h('li', {}, `Ersatzleistung bei langfristig fehlender Sporttauglichkeit: ${reihe.ersatzHinweis || reihe.ersatzTeile.map((t) => t.name).join(', ')}.`) : null),
    h('p', { class: 'klein' }, 'Reihenwert = gewichteter Mittelwert der Teilleistungen; Reihennote: halbe Werte zur besseren Note.'));
}

function erfassungsbogen(d, reihe, personen) {
  return h('article', { class: 'druckseite quer' },
    h('h2', {}, `Erfassungsbogen Prüfung: ${reihe.name}`),
    h('p', {}, `Klasse ${d.kopf.klasse || ''} · Datum: ______________ · Je Versuch 0–3 eintragen (0 = ${STUFEN_STANDARD[0]}, 3 = ${STUFEN_STANDARD[3]})`),
    h('table', { class: 'tabelle druck-tabelle blanko' },
      h('thead', {},
        h('tr', {}, h('th', { rowspan: 2 }, 'Nr.'), h('th', { rowspan: 2, class: 'links' }, 'Name'), reihe.teile.map((t) => h('th', { colspan: (t.versuche || 0) + 1 }, t.name))),
        h('tr', {}, reihe.teile.flatMap((t) => [...Array.from({ length: t.versuche || 0 }, (_, i) => h('th', {}, String(i + 1))), h('th', {}, '∑')]))),
      h('tbody', {}, (personen.length ? personen : Array.from({ length: 32 }, () => ({ name: '', vorname: '' }))).map((p, i) => h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links' }, kurzname(p)), reihe.teile.flatMap((t) => [...Array.from({ length: t.versuche || 0 }, () => h('td', {}, ' ')), h('td', {}, ' ')]))))));
}

function leereListe(d, personen, ueberschrift) {
  return h('article', { class: 'druckseite quer' },
    h('h2', {}, ueberschrift),
    h('p', {}, `Klasse ${d.kopf.klasse || ''} · Schuljahr ${d.kopf.schuljahr || ''}`),
    h('table', { class: 'tabelle druck-tabelle blanko' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Nr.'), h('th', { class: 'links' }, 'Name'), Array.from({ length: 20 }, () => h('th', {}, ' ')))),
      h('tbody', {}, (personen.length ? personen : Array.from({ length: 32 }, () => ({ name: '', vorname: '' }))).map((p, i) => h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links' }, kurzname(p)), Array.from({ length: 20 }, () => h('td', {}, ' ')))))),
    h('p', { class: 'klein' }, `Zeichen: ${Object.entries(ZEICHEN).map(([z, v]) => `${z} = ${v.text}`).join(' · ')}`));
}

function notenliste(d, personen, ein) {
  const punkteAn = d.sport.notensystem === 'punkte';
  const { ergebnis } = endnotenKlasse(d, personen, ein);
  return h('article', { class: 'druckseite quer' },
    h('h2', {}, 'Notenliste Sport'),
    h('p', {}, `Klasse ${d.kopf.klasse || ''} · Schuljahr ${d.kopf.schuljahr || ''} · ${punkteAn ? 'Punkte 0–15' : 'Noten'}`),
    h('table', { class: 'tabelle druck-tabelle' },
      h('thead', {}, h('tr', {}, ['Nr.', 'Name', 'Vorname', ...d.sport.reihen.map((r) => r.name), 'Endnote', ...(punkteAn ? ['Vorschlag (Punkte)'] : [])].map((t) => h('th', {}, t)))),
      h('tbody', {}, personen.map((p, i) => {
        const e = ergebnis.get(p.id);
        return h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links' }, p.name), h('td', { class: 'links' }, p.vorname),
          d.sport.reihen.map((r) => { const n = reihenErgebnis(d, r, p.id, ein).note; return h('td', { class: 'mitte' }, n === null ? '' : String(n)); }),
          h('td', { class: 'mitte' }, h('strong', {}, e.endnote ?? ''), e.festgesetzt && '*'),
          punkteAn && h('td', { class: 'mitte' }, e.gesamt.oWert === null ? '' : String(punkte(e.gesamt.oWert, ein))));
      }))),
    h('p', { class: 'klein' }, '* festgesetzt. Rundung: halbe Werte zur besseren Note.'));
}

export function zeigeSportDruck() {
  const d = K.daten;
  const ein = einstellungenAus(K.buch);
  const personen = aktiveSchueler(d);
  const wurzel = h('section', { class: 'seite druck-seite' });
  const vorschau = h('div', { class: 'druck-vorschau' });
  const steuerung = h('div', { class: 'druck-steuerung' });
  if (!d.sport.reihen.some((r) => r.id === reiheId)) reiheId = d.sport.reihen[0]?.id || null;

  function vorschauZeichnen() {
    leeren(vorschau);
    const reihe = d.sport.reihen.find((r) => r.id === reiheId);
    if (art === 'notenliste') return vorschau.append(notenliste(d, personen, ein));
    if (art === 'anwesenheit') return vorschau.append(leereListe(d, personen, 'Anwesenheitsliste'), leereListe(d, personen, 'Mitarbeit (0–3)'));
    if (!reihe) return vorschau.append(h('p', { class: 'hinweis' }, 'Noch keine Reihe.'));
    vorschau.append(art === 'bogen' ? erfassungsbogen(d, reihe, personen) : kriterienblatt(d, reihe, ein));
  }
  function steuerungZeichnen() {
    leeren(steuerung);
    fuege(steuerung,
      h('label', {}, 'Ausdruck', h('select', { id: 'druck-art', 'aria-label': 'Was soll gedruckt werden?', onchange: (e) => { art = e.target.value; steuerungZeichnen(); vorschauZeichnen(); } },
        [['kriterien', 'Kriterienblatt je Reihe'], ['bogen', 'Erfassungsbogen Prüfung'], ['anwesenheit', 'Leere Anwesenheits-/Mitarbeitsliste'], ['notenliste', 'Notenliste']].map(([w, t]) => h('option', { value: w, selected: art === w }, t)))),
      (art === 'kriterien' || art === 'bogen') && h('label', {}, 'Reihe', h('select', { id: 'druck-reihe', 'aria-label': 'Reihe', onchange: (e) => { reiheId = e.target.value; vorschauZeichnen(); } }, d.sport.reihen.map((r) => h('option', { value: r.id, selected: r.id === reiheId }, r.name)))),
      h('button', { type: 'button', class: 'knopf primaer', onclick: () => window.print() }, 'Drucken / PDF speichern'));
  }
  fuege(wurzel, h('h1', {}, 'Drucken'), steuerung, h('p', { class: 'klein' }, 'Die Vorschau unten wird gedruckt. Im Druckdialog „Als PDF speichern“ wählen, um ein PDF zu erhalten. Fotos erscheinen nie im Druck.'), vorschau);
  steuerungZeichnen();
  vorschauZeichnen();
  return { el: wurzel };
}
