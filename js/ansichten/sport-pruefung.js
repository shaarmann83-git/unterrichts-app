// Prüfung erfassen (SPEC 9.4): Einzelversuche 0–3 als Tipp-Reihe, jede Person nacheinander, Summe wird gebildet.
import { K } from '../kontext.js';
import { h, leeren, fuege, avatar, personLink } from '../ui.js';
import { anzeigename } from '../modell.js';
import { teilRohwert, teilHoechstwert, pruefungReihe } from '../sport.js';
import { ansichtRegistrieren } from '../registry.js';
import { sportKlasse, sportKontext } from './sport-gemeinsam.js';
import { STUFEN_STANDARD } from '../modell.js';
import { zahlLesen } from '../rechnen.js';

let aktReihe = null;
let aktTeil = null;
let cursor = { p: 0, v: 0 };
let ersatzModus = false;

const werteVon = (reihe, sid) => (reihe.werte[sid] ||= {});

export function zeigePruefung() {
  const { d, ein, personen } = sportKontext();
  const wurzel = h('section', { class: 'seite' });
  const inhalt = h('div', {});
  if (!d.sport.reihen.some((r) => r.id === aktReihe)) aktReihe = d.sport.reihen[0]?.id || null;

  function render() {
    leeren(inhalt);
    const reihe = d.sport.reihen.find((r) => r.id === aktReihe);
    const reihenWahl = h('select', { id: 'pr-reihe', 'aria-label': 'Reihe', onchange: (e) => { aktReihe = e.target.value; aktTeil = null; cursor = { p: 0, v: 0 }; render(); } },
      d.sport.reihen.map((r) => h('option', { value: r.id, selected: r.id === aktReihe }, r.name || 'ohne Namen')));
    fuege(inhalt, h('div', { class: 'knopfreihe' }, d.sport.reihen.length > 0 && h('label', { class: 'inline' }, 'Reihe: ', reihenWahl)));
    if (!reihe) return inhalt.append(h('p', { class: 'hinweis' }, 'Noch keine Reihe. Legen Sie unter „Reihen“ eine Reihe aus einer Vorlage an.'));
    const teile = ersatzModus ? reihe.ersatzTeile : reihe.teile;
    if (!teile.some((t) => t.id === aktTeil)) aktTeil = teile[0]?.id || null;
    const teil = teile.find((t) => t.id === aktTeil);
    fuege(inhalt, h('div', { class: 'reiter' },
      h('button', { type: 'button', class: `reiter-punkt${!ersatzModus ? ' aktiv' : ''}`, onclick: () => { ersatzModus = false; aktTeil = null; cursor = { p: 0, v: 0 }; render(); } }, 'Prüfung'),
      h('button', { type: 'button', class: `reiter-punkt${ersatzModus ? ' aktiv' : ''}`, id: 'pr-ersatz', onclick: () => { ersatzModus = true; aktTeil = null; cursor = { p: 0, v: 0 }; render(); } }, 'Ersatzprüfung')));
    if (!teil) return inhalt.append(h('p', { class: 'hinweis' }, ersatzModus ? 'Diese Reihe hat keine Ersatzprüfungsteile (unter „Reihen“ bearbeiten).' : 'Diese Reihe hat noch keine Prüfungsteile (unter „Reihen“ bearbeiten).'));
    if (ersatzModus) {
      return fuege(inhalt, h('p', { class: 'klein' }, 'Ersatzprüfung: eigene Teile, gleicher Schlüssel; je Person Summe pro Teil oder direkte Note. Aktivieren und beschreiben Sie die Ersatzprüfung unter „Reihen“.'), ersatzTabelle(reihe, teile));
    }
    const teileWahl = h('div', { class: 'reiter' }, teile.map((t) => h('button', { type: 'button', 'data-teil': t.id, class: `reiter-punkt${t.id === aktTeil ? ' aktiv' : ''}`, onclick: () => { aktTeil = t.id; cursor = { p: 0, v: 0 }; render(); } }, t.name || 'Teil')));
    const versuche = teil.versuche || 0;
    const hoechst = teilHoechstwert(teil);
    const stufen = teil.stufen || STUFEN_STANDARD;
    cursor.p = Math.min(cursor.p, Math.max(0, personen.length - 1));
    cursor.v = Math.min(cursor.v, Math.max(0, versuche - 1));

    function eintragen(wert) {
      const p = personen[cursor.p];
      if (!p) return;
      const w = werteVon(reihe, p.id);
      w.versuche ||= {};
      const a = (w.versuche[teil.id] ||= Array.from({ length: versuche }, () => null));
      while (a.length < versuche) a.push(null);
      a[cursor.v] = wert;
      if (wert === null && a.every((x) => x === null)) delete w.versuche[teil.id];
      K.aenderung();
      // weiter zum nächsten Versuch; nach dem letzten zur nächsten Person
      if (wert !== null) {
        if (cursor.v + 1 < versuche) cursor.v += 1;
        else if (cursor.p + 1 < personen.length) { cursor.p += 1; cursor.v = 0; }
      }
      render();
    }

    const gitter = h('table', { class: 'tabelle pruef-gitter' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Nr.'), h('th', { class: 'links' }, 'Name'), Array.from({ length: versuche }, (_, i) => h('th', {}, String(i + 1))), h('th', {}, `Summe (max. ${hoechst})`), h('th', {}, 'Prüfung %'), h('th', {}, 'Note'))),
      h('tbody', {}, personen.map((p, pi) => {
        const w = reihe.werte[p.id] || {};
        const a = w.versuche?.[teil.id] || [];
        const roh = teilRohwert(w, teil);
        const pr = pruefungReihe(d, reihe, p.id, ein);
        return h('tr', { class: pi === cursor.p ? 'aktiv-zeile' : '' },
          h('td', { class: 'zahl' }, String(pi + 1)),
          h('td', { class: 'links name' }, avatar(d, p), ' ', personLink(p, anzeigename(p))),
          Array.from({ length: versuche }, (_, vi) => h('td', { class: 'zellen-td' }, h('button', { type: 'button', class: `zelle ${pi === cursor.p && vi === cursor.v ? 'cursor' : ''} ${a[vi] === 0 ? 'z-rot' : a[vi] === 3 ? 'm-gruen' : a[vi] === 1 ? 'm-blau' : a[vi] === 2 ? 'z-normal' : 'z-grau'}`, 'data-p': pi, 'data-v': vi, 'aria-label': `${anzeigename(p)} Versuch ${vi + 1}: ${a[vi] ?? 'leer'}`, onclick: () => { cursor = { p: pi, v: vi }; render(); } }, a[vi] === null || a[vi] === undefined ? '' : String(a[vi])))),
          h('td', { class: 'zahl' }, h('input', { type: 'text', inputmode: 'numeric', class: 'summe-feld', 'aria-label': `${anzeigename(p)} Summe`, value: roh === null ? '' : String(roh), disabled: a.some((x) => typeof x === 'number'), title: a.some((x) => typeof x === 'number') ? 'Die Summe wird aus den Einzelversuchen gebildet' : 'Summe direkt eingeben (z. B. aus einer Papier-Strichliste)',
            onchange: (e) => {
              const z = zahlLesen(e.target.value);
              const ww = werteVon(reihe, p.id);
              ww.summen ||= {};
              if (z === null) delete ww.summen[teil.id];
              else if (!Number.isNaN(z) && z >= 0 && z <= hoechst) ww.summen[teil.id] = z;
              else { e.target.classList.add('fehler'); return; }
              K.aenderung();
              render();
            } })),
          h('td', { class: 'zahl', 'data-prozent': p.id, title: `Prüfung gesamt über ${pr.geprueft} von ${pr.teile} Teil(en); Prozent nur hier, nicht in den Noten-Übersichten` }, pr.prozent === null ? '' : `${(Math.round(pr.prozent * 10) / 10).toString().replace('.', ',')} %`),
          h('td', { class: `mitte ${pr.status === 'auto6' ? 'z-rot' : ''}` }, pr.note === null ? '' : String(pr.note)));
      })));

    const p = personen[cursor.p];
    const tasten = h('div', { class: 'grosse-tasten' }, [0, 1, 2, 3].map((n) => h('button', { type: 'button', class: `knopf gross grosse-taste ${n === 0 ? 'z-rot' : n === 3 ? 'm-gruen' : n === 1 ? 'm-blau' : 'z-normal'}`, 'data-versuch': n, 'aria-label': `Versuch ${n}: ${stufen[n]}`, onclick: () => eintragen(n) }, h('strong', {}, String(n)), h('span', { class: 'klein' }, stufen[n]))),
      h('button', { type: 'button', class: 'knopf gross', id: 'versuch-zurueck', onclick: () => {
        if (cursor.v > 0) cursor.v -= 1; else if (cursor.p > 0) { cursor.p -= 1; cursor.v = versuche - 1; }
        render();
      } }, '‹ Zurück'),
      h('button', { type: 'button', class: 'knopf gross', id: 'person-weiter', onclick: () => { if (cursor.p + 1 < personen.length) { cursor.p += 1; cursor.v = 0; } render(); } }, 'Nächste Person ›'));

    fuege(inhalt, teileWahl,
      h('div', { class: 'pruef-kopf' },
        p && h('h2', {}, avatar(d, p), ' ', anzeigename(p), h('span', { class: 'klein' }, ` · Versuch ${cursor.v + 1} von ${versuche}`)),
        teil.zone && h('p', { class: 'klein' }, `Zielzone/Bedingung: ${teil.zone}`),
        teil.merkmale.some(Boolean) && h('p', { class: 'klein' }, `Merkmale: ${teil.merkmale.filter(Boolean).join(' · ')}`)),
      tasten,
      h('p', { class: 'klein' }, 'Tastatur: 0–3 trägt den Versuch ein und springt weiter, Rücktaste geht zurück, Entf löscht den Versuch. Jeder Versuch wird gespeichert, die Summe bildet die App.'),
      h('div', { class: 'tabelle-rahmen' }, gitter));
    inhalt.dataset.bereit = '1';
  }

  const taste = (ev) => {
    if (ev.target.matches('input, textarea, select') || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const reihe = d.sport.reihen.find((r) => r.id === aktReihe);
    if (!reihe || ersatzModus || !document.body.contains(wurzel)) return;
    if (/^[0-3]$/.test(ev.key)) {
      ev.preventDefault();
      inhalt.querySelector(`button[data-versuch="${ev.key}"]`)?.click();
    } else if (ev.key === 'Backspace') {
      ev.preventDefault();
      inhalt.querySelector('#versuch-zurueck')?.click();
    } else if (ev.key === 'Delete') {
      ev.preventDefault();
      const teil = reihe.teile.find((t) => t.id === aktTeil);
      const p = personen[cursor.p];
      const a = p && reihe.werte[p.id]?.versuche?.[teil?.id];
      if (a) { a[cursor.v] = null; if (a.every((x) => x === null)) delete reihe.werte[p.id].versuche[teil.id]; K.aenderung(); render(); }
    }
  };
  document.addEventListener('keydown', taste);
  const beobachter = new MutationObserver(() => { if (!document.body.contains(wurzel)) { document.removeEventListener('keydown', taste); beobachter.disconnect(); } });
  beobachter.observe(document.getElementById('ansicht'), { childList: true });

  function ersatzTabelle(reihe, teile) {
    return h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Nr.'), h('th', { class: 'links' }, 'Name'), teile.map((t) => h('th', {}, `${t.name} (max. ${teilHoechstwert(t)})`)), h('th', {}, 'Direkte Note'), h('th', {}, 'Note'))),
      h('tbody', {}, personen.filter((p) => reihe.werte[p.id]?.ersatz).map((p, i) => {
        const e = reihe.werte[p.id].ersatz;
        const pr = pruefungReihe(d, reihe, p.id, ein);
        return h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links name' }, personLink(p, anzeigename(p))),
          teile.map((t) => h('td', {}, h('input', { type: 'text', inputmode: 'decimal', class: 'summe-feld', 'aria-label': `${anzeigename(p)} ${t.name}`, value: typeof e.summen?.[t.id] === 'number' ? String(e.summen[t.id]).replace('.', ',') : '', onchange: (ev) => {
            const z = zahlLesen(ev.target.value);
            e.summen ||= {};
            if (z === null) delete e.summen[t.id]; else if (!Number.isNaN(z) && z >= 0 && z <= teilHoechstwert(t)) e.summen[t.id] = z; else { ev.target.classList.add('fehler'); return; }
            K.aenderung(); render();
          } }))),
          h('td', {}, h('input', { type: 'text', inputmode: 'decimal', class: 'summe-feld', 'aria-label': `${anzeigename(p)} direkte Note`, value: typeof e.note === 'number' ? String(e.note).replace('.', ',') : '', onchange: (ev) => {
            const z = zahlLesen(ev.target.value);
            if (z === null) delete e.note; else if (!Number.isNaN(z) && z >= 1 && z <= 6) e.note = z; else { ev.target.classList.add('fehler'); return; }
            K.aenderung(); render();
          } })),
          h('td', { class: 'mitte' }, pr.note === null ? '' : String(pr.note)));
      })), personen.every((p) => !reihe.werte[p.id]?.ersatz) && h('tfoot', {}, h('tr', {}, h('td', { colspan: teile.length + 4 }, 'Noch niemand hat eine Ersatzprüfung (unter „Reihen“ je Person aktivieren).')))));
  }

  fuege(wurzel, h('h1', {}, 'Prüfung erfassen'), inhalt);
  render();
  return { el: wurzel, update: () => {} };
}

ansichtRegistrieren('pruefung', { text: 'Prüfung', bauen: zeigePruefung, klasse: true, nurWenn: sportKlasse, reihe: 2.4 });
