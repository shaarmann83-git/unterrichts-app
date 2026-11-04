// Sport-Abschnitt für Personenübersicht und Besprechungsmodus: Reihen, Termine mit Farben, Gesamtnote.
import { K } from '../kontext.js';
import { h } from '../ui.js';
import { datumDeutsch } from '../modell.js';
import { reihenErgebnis, termineGeordnet, spsNummern, mitarbeitZelle, anwesenheitZeichen, einstellungenAus, endnotenKlasse, punkte, istPruefungstag, ZEICHEN } from '../sport.js';
import { aktiveSchueler } from '../modell.js';
import { zeichenFarbe, mitarbeitFarbe, datumKurz } from './sport-gemeinsam.js';

const f2 = (x) => (x === null || x === undefined ? '' : String(Math.round(x * 100) / 100).replace('.', ','));
const STATUS = { auto6: 'Prüfung 6 (unentschuldigt am Prüfungstag)', 'nachpruefung-offen': 'Nachprüfung offen', offen: 'Prüfung offen', ersatz: 'Ersatzprüfung' };

/** Termin-Chips einer Reihe in den Farben der Anwesenheit; darunter die Mitarbeitswerte. */
function terminChips(d, ein, reihe, s) {
  const sps = spsNummern(d, s.id);
  const termine = termineGeordnet(d).filter((t) => t.reihe === reihe.id);
  if (termine.length === 0) return h('p', { class: 'klein' }, 'Keine Termine in dieser Reihe.');
  return h('div', {},
    h('div', { class: 'termin-chips', 'data-chips': 'anwesenheit' }, termine.map((t) => {
      const z = anwesenheitZeichen(d, t.id, s.id);
      return h('span', { class: `termin-chip ${zeichenFarbe(z, sps.get(t.id) || 0)}`, title: `${datumDeutsch(t.datum)}${z ? ': ' + (ZEICHEN[z]?.text || z) : ''}${istPruefungstag(t, ein) ? ' (Prüfungstag)' : ''}` }, h('span', { class: 'klein' }, datumKurz(t.datum)), ' ', z || '–', istPruefungstag(t, ein) ? ' ★' : '');
    })),
    h('div', { class: 'termin-chips', 'data-chips': 'mitarbeit' }, termine.map((t) => {
      const c = mitarbeitZelle(d, t, s.id, ein, sps);
      return h('span', { class: `termin-chip ${c.zaehlt ? mitarbeitFarbe(c.wert, c.grund) : 'z-grau'}`, title: c.zaehlt ? `Mitarbeit ${c.wert}` : 'zählt nicht' }, c.zaehlt ? String(c.wert) : '–');
    })));
}

/** Abschnitt „Sport“ einer Person. `notizen`: false blendet Bemerkungen aus. */
export function sportPersonAbschnitt(d, s, { notizen = true } = {}) {
  const ein = einstellungenAus(K.buch);
  const punkteAn = d.sport.notensystem === 'punkte';
  const personen = aktiveSchueler(d);
  const { ergebnis } = endnotenKlasse(d, personen.some((p) => p.id === s.id) ? personen : [...personen, s], ein);
  const e = ergebnis.get(s.id);
  const reihen = d.sport.reihen.map((r) => ({ r, erg: reihenErgebnis(d, r, s.id, ein) }));
  return h('div', { class: 'sport-person' },
    h('h2', {}, 'Sport'),
    reihen.length === 0 ? h('p', { class: 'hinweis' }, 'Noch keine Reihen.') :
    h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle klein-tabelle' },
      h('thead', {}, h('tr', {}, ['Reihe', 'Prüfung', 'Mitarbeit', 'Verhalten', 'Reihenwert', 'Reihennote', ...(punkteAn ? ['Punkte'] : []), ...(notizen ? ['Bemerkung'] : [])].map((t) => h('th', {}, t)))),
      h('tbody', {}, reihen.map(({ r, erg }) => h('tr', { 'data-reihe': r.id },
        h('td', { class: 'links' }, r.name),
        h('td', { class: erg.pruefung.status === 'auto6' ? 'z-rot' : erg.pruefung.status === 'nachpruefung-offen' ? 'z-orange' : '', title: STATUS[erg.pruefung.status] || '' }, erg.pruefung.note ?? '', STATUS[erg.pruefung.status] && h('div', { class: 'klein' }, STATUS[erg.pruefung.status])),
        h('td', { class: 'zahl' }, f2(erg.mitarbeit.note)),
        h('td', { class: 'zahl' }, erg.verhalten ?? ''),
        h('td', { class: 'zahl' }, f2(erg.wert)),
        h('td', { class: 'mitte' }, erg.note ?? ''),
        punkteAn && h('td', { class: 'zahl' }, erg.note === null ? '' : String(punkte(erg.note, ein))),
        notizen && h('td', { class: 'links' }, erg.bemerkung)))))),
    reihen.map(({ r }) => h('div', { class: 'sport-termine' }, h('h3', {}, r.name), terminChips(d, ein, r, s))),
    h('p', { class: 'summe-zeile' }, `Ø Wert ${f2(e.gesamt.oWert) || '–'} · Ø Note ${f2(e.gesamt.oNote) || '–'} · Endnote `, h('strong', {}, e.endnote === null || e.endnote === undefined ? '–' : String(e.endnote)), e.festgesetzt ? ` (festgesetzt: ${e.festgesetzt.begruendung})` : ' (berechnet)', ` · sps ${e.gesamt.sps} · offen ${e.gesamt.offen}`));
}
