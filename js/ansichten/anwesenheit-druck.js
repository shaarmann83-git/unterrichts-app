// Druck der ausgefüllten Anwesenheitsliste (Sport und Lernfeld/Fach/Kurs/Lerngebiet), Querformat, mehrere Seiten bei vielen Terminen.
import { h } from '../ui.js';
import { aktiveSchueler, anzeigename, datumDeutsch, fachZeile } from '../modell.js';
import { ZEICHEN, termineGeordnet, anwesenheitZeichen } from '../sport.js';
import { pausenSpalten } from '../rhythmus.js';
import { termineVon, zeichenVon, ANWESENHEIT_ZEICHEN } from './anwesenheit-lf.js';

const SPALTEN_JE_SEITE = 20;
const kurz = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const zeigeZeichen = (z, min) => (z === '.' ? '●' : z === 'V' && min ? `V${min}` : z);

/** Seiten (article-Elemente) mit der ausgefüllten Anwesenheitsliste der Klasse. */
export function anwesenheitsSeiten(d) {
  const personen = aktiveSchueler(d);
  const sport = d.fachtyp === 'sport';
  const termine = sport ? termineGeordnet(d) : termineVon(d);
  if (termine.length === 0) return [h('p', { class: 'hinweis' }, 'Noch keine Unterrichtstage. Laden Sie zuerst den Stundenplan.')];
  const datumVon = (t) => t.datum;
  const pausen = pausenSpalten(d, termine.map(datumVon));
  const spalten = [];
  termine.forEach((t, i) => {
    for (const p of pausen.get(i) || []) spalten.push({ pause: p });
    spalten.push({ t });
  });
  const inhalt = (p, t) => {
    if (sport) {
      const z = anwesenheitZeichen(d, t.id, p.id);
      return zeigeZeichen(z, d.sport.anwesenheit[t.id]?.[p.id]?.min);
    }
    const z = zeichenVon(d, p.id, t.datum);
    return zeigeZeichen(z.zeichen, z.min);
  };
  const seiten = [];
  for (let von = 0; von < spalten.length; von += SPALTEN_JE_SEITE) {
    const teil = spalten.slice(von, von + SPALTEN_JE_SEITE);
    seiten.push(h('article', { class: 'druckseite quer' },
      h('h2', {}, 'Anwesenheitsliste'),
      h('p', {}, `Klasse ${d.kopf.klasse || ''} · ${sport ? 'Sport' : fachZeile(d.kopf)} · Schuljahr ${d.kopf.schuljahr || ''}`),
      h('table', { class: 'tabelle druck-tabelle anwesenheit-druck' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Nr.'), h('th', { class: 'links' }, 'Name'),
          teil.map((sp) => (sp.pause ? h('th', { class: 'pause-druck', title: sp.pause.text }, '') : h('th', {}, kurz(sp.t.datum)))))),
        h('tbody', {}, personen.map((p, i) => h('tr', {},
          h('td', { class: 'zahl' }, String(i + 1)),
          h('td', { class: 'links' }, anzeigename(p)),
          teil.map((sp) => (sp.pause ? h('td', { class: 'pause-druck' }) : h('td', { class: 'mitte' }, inhalt(p, sp.t)))))))),
      h('p', { class: 'klein' }, `● anwesend · ${Object.entries(sport ? ZEICHEN : ANWESENHEIT_ZEICHEN).filter(([z]) => z !== '.').map(([z, v]) => `${z} ${v.text}`).join(' · ')} · graue Spalten: ${[...new Set([...pausen.values()].flat().map((x) => x.text))].join(', ') || 'Ferien, Feiertage, Ausfälle'}`),
      h('p', { class: 'klein' }, `Stand ${datumDeutsch(new Date().toISOString().slice(0, 10))}`)));
  }
  return seiten;
}
