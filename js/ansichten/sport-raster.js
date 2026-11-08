// Anwesenheit und Mitarbeit als Raster (SPEC 9.2, 9.3): Spalten = Termine, oben die Reihe als Balken.
import { pausenSpalten, rhythmusAuffuellen } from '../rhythmus.js';
import { K } from '../kontext.js';
import { h, leeren, fuege, inhaltDialog, meldung, toast, personLink, tabelleFixieren } from '../ui.js';
import { anzeigename, datumDeutsch } from '../modell.js';
import {
  ZEICHEN, termineGeordnet, spsNummern, mitarbeitZelle, mitarbeitReihe, anwesenheitZeichen, istPruefungstag, ausgabe,
} from '../sport.js';
import { ansichtRegistrieren } from '../registry.js';
import {
  sportKlasse, sportKontext, reiheById, datumKurz, zeichenFarbe, mitarbeitFarbe, zelleSetzen, zeichenPalette, terminDialog,
} from './sport-gemeinsam.js';

// Tastenkürzel in der Anwesenheit: einzelne Buchstaben oder kurze Folgen (k, ke, ka, ku, sps)
const KURZ = { '.': '.', v: 'V', e: 'E', a: 'A', b: 'B', p: 'P', u: 'U', '|': '|' };
const FOLGEN = ['sps', 'ke', 'ka', 'ku'];

function gruppen(termine, d) {
  const out = [];
  for (const t of termine) {
    const letzte = out.at(-1);
    if (letzte && letzte.reihe === t.reihe) letzte.termine.push(t);
    else out.push({ reihe: t.reihe, termine: [t] });
  }
  return out.map((g) => ({ ...g, name: reiheById(d, g.reihe)?.name || (g.reihe ? 'ohne Namen' : 'keiner Reihe') }));
}

// ---------- Anwesenheit ----------

export function zeigeAnwesenheit() {
  const { d, ein, personen } = sportKontext();
  const wurzel = h('section', { class: 'seite' });
  const rahmen = h('div', { class: 'tabelle-rahmen raster' });
  let fokus = null;
  let puffer = '';
  let pufferZeit = 0;

  async function neuerTermin() {
    const t = await terminDialog(d);
    if (t && !t.loeschen) fokus = { t: t.id, s: personen[0]?.id };
    zeichnen();
  }

  function zellenInhalt(btn, t, s, sps) {
    const e = d.sport.anwesenheit[t.id]?.[s.id];
    const z = e?.z || '';
    btn.className = `zelle ${zeichenFarbe(z, sps.get(t.id) || 0)}${z === '.' ? ' punkt' : ''}${z === '|' ? ' strich' : ''}`;
    btn.textContent = z ? `${z}${z === 'V' && e.min ? e.min : ''}${e.stern ? '*' : ''}` : '';
    btn.title = [z && `${ZEICHEN[z]?.text || ''}`, e?.text].filter(Boolean).join(' · ');
    btn.setAttribute('aria-label', `${anzeigename(s)} ${datumDeutsch(t.datum)}: ${z || 'leer'}`);
  }

  async function palette(t, s, btn) {
    const erg = await zeichenPalette(d, t, s, d.sport.anwesenheit[t.id]?.[s.id] || {});
    if (erg === null || erg === undefined) return;
    fokus = { t: t.id, s: s.id };
    zelleSetzen(d, t.id, s.id, erg.z === '' ? null : erg);
    zeichnen();
  }

  function taste(ev, t, s) {
    const k = ev.key;
    const spalten = termine.map((x) => x.id);
    const i = personen.findIndex((p) => p.id === s.id);
    const j = spalten.indexOf(t.id);
    const gehe = (di, dj) => {
      const ziel = rahmen.querySelector(`button.zelle[data-t="${spalten[j + dj]}"][data-s="${personen[i + di]?.id}"]`);
      if (ziel) { ev.preventDefault(); ziel.focus(); }
    };
    if (k === 'ArrowDown' || k === 'Enter') return gehe(1, 0);
    if (k === 'ArrowUp') return gehe(-1, 0);
    if (k === 'ArrowLeft') return gehe(0, -1);
    if (k === 'ArrowRight') return gehe(0, 1);
    if (k === 'Backspace' || k === 'Delete') { ev.preventDefault(); fokus = { t: t.id, s: s.id }; zelleSetzen(d, t.id, s.id, null); return zeichnen(); }
    if (k === ' ') { ev.preventDefault(); return palette(t, s); }
    if (ev.ctrlKey || ev.metaKey || ev.altKey || k.length !== 1) return;
    // Folgen wie „ke“ oder „sps“ innerhalb von 700 ms
    const jetzt = Date.now();
    puffer = jetzt - pufferZeit < 700 ? puffer + k.toLowerCase() : k.toLowerCase();
    pufferZeit = jetzt;
    let z = null;
    if (FOLGEN.includes(puffer)) z = puffer;
    else if (puffer === 'k') z = 'k';
    else if (puffer.length === 1 && KURZ[puffer]) z = KURZ[puffer];
    else if (puffer === 's' || puffer === 'sp') return ev.preventDefault();
    if (!z) return;
    ev.preventDefault();
    fokus = { t: t.id, s: s.id };
    const alt = d.sport.anwesenheit[t.id]?.[s.id] || {};
    zelleSetzen(d, t.id, s.id, { z, min: z === 'V' ? alt.min : undefined, stern: alt.stern, text: alt.text });
    zeichnen();
    if (!['k', 's', 'sp'].includes(puffer)) {
      // nach einem vollständigen Zeichen eine Zeile weiter
      const ziel = rahmen.querySelector(`button.zelle[data-t="${t.id}"][data-s="${personen[i + 1]?.id}"]`);
      if (ziel) ziel.focus();
    } else rahmen.querySelector(`button.zelle[data-t="${t.id}"][data-s="${s.id}"]`)?.focus();
  }

  let termine = [];
  function zeichnen() {
    termine = termineGeordnet(d);
    leeren(rahmen);
    if (termine.length === 0) {
      rahmen.append(h('p', { class: 'hinweis' }, 'Noch keine Termine. Mit „+ Termin“ legen Sie den ersten an.'));
      return;
    }
    const sps = new Map(personen.map((p) => [p.id, spsNummern(d, p.id)]));
    const g = gruppen(termine, d);
    // Ferien, Feiertage und ausgefallene Stunden als graue Spalten zwischen den Terminen
    const pausen = pausenSpalten(d, termine.map((t) => t.datum));
    const pauseTitel = (p) => `${p.text}${p.bis !== p.datum ? ` (${datumKurz(p.datum)} bis ${datumKurz(p.bis)})` : ` (${datumKurz(p.datum)})`}`;
    let pos = 0;
    const kopf1 = h('tr', {}, h('th', { rowspan: 3 }, 'Nr.'), h('th', { rowspan: 3, class: 'links name-spalte' }, 'Name'),
      g.map((x) => {
        const von = pos;
        pos += x.termine.length;
        let zusatz = 0;
        for (let k = von + 1; k <= pos; k += 1) zusatz += (pausen.get(k) || []).length;
        return h('th', { class: 'reihe-balken', colspan: x.termine.length + zusatz, title: x.name }, x.name);
      }),
      h('th', { rowspan: 3 }, 'sps'), h('th', { rowspan: 3 }, 'offen'));
    const kopf2 = h('tr', {}, termine.flatMap((t, i) => [...(pausen.get(i) || []).map((p) => h('th', { rowspan: 2, class: `pause-kopf pause-${p.art}`, title: pauseTitel(p) }, p.text)), h('th', { class: istPruefungstag(t, ein) ? 'pruef-tag' : 'pruef-leer', title: t.vermerk || '' }, istPruefungstag(t, ein) ? (t.vermerk && t.vermerk.length <= 3 ? t.vermerk : 'T') : '')]));
    const kopf3 = h('tr', {}, termine.map((t) => h('th', { class: 'datum-kopf' },
      h('button', { type: 'button', class: 'datum-knopf', 'data-termin': t.id, title: `Termin bearbeiten${t.vermerk ? ': ' + t.vermerk : ''}`, onclick: async () => { await terminDialog(d, t); zeichnen(); } }, datumKurz(t.datum)),
      h('button', { type: 'button', class: 'alle-da', 'data-termin': t.id, title: 'Alle noch leeren Zellen dieses Tages auf anwesend setzen', 'aria-label': `Alle übrigen anwesend am ${datumDeutsch(t.datum)}`, onclick: () => {
        let n = 0;
        for (const p of personen) if (!anwesenheitZeichen(d, t.id, p.id)) { (d.sport.anwesenheit[t.id] ||= {})[p.id] = { z: '.', quelle: 'hand' }; n += 1; }
        if (n) K.aenderung();
        zeichnen();
        toast(n ? `${n} Zelle(n) auf „.“ gesetzt.` : 'Keine leeren Zellen.');
      } }, 'Alle da'))));
    const tbody = h('tbody');
    personen.forEach((p, i) => {
      let offen = 0;
      let spsGesamt = 0;
      const zellen = termine.flatMap((t, ti) => {
        const z = anwesenheitZeichen(d, t.id, p.id);
        if (ZEICHEN[z]?.art === 'offen') offen += 1;
        if (z === 'sps') spsGesamt += 1;
        const btn = h('button', { type: 'button', 'data-t': t.id, 'data-s': p.id, onclick: () => palette(t, p, btn), onkeydown: (ev) => taste(ev, t, p) });
        zellenInhalt(btn, t, p, sps.get(p.id));
        return [...(pausen.get(ti) || []).map((pa) => h('td', { class: `pause-zelle pause-${pa.art}`, title: pauseTitel(pa) })), h('td', { class: 'zellen-td' }, btn)];
      });
      tbody.append(h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links name name-spalte' }, personLink(p, anzeigename(p))), zellen,
        h('td', { class: `zahl ${spsGesamt >= 2 ? 'z-orange' : ''}` }, String(spsGesamt)), h('td', { class: `zahl ${offen ? 'z-violett' : ''}`, 'data-offen': p.id }, String(offen))));
    });
    { const tab = h('table', { class: 'tabelle sport-raster' }, h('thead', {}, kopf1, kopf2, kopf3), tbody); rahmen.append(tab); tabelleFixieren(tab); }
    if (fokus) {
      rahmen.querySelector(`button.zelle[data-t="${fokus.t}"][data-s="${fokus.s}"]`)?.focus();
      fokus = null;
    }
  }

  fuege(wurzel,
    h('h1', {}, 'Anwesenheit'),
    h('div', { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf primaer', id: 'termin-neu', onclick: neuerTermin }, '+ Termin'),
      h('button', { type: 'button', class: 'knopf', id: 'anw-auffuellen', title: 'Ergänzt die Unterrichtstage des Schuljahres, die Untis nicht liefert (ohne Ferien und Feiertage in Niedersachsen)', onclick: () => {
        const r = rhythmusAuffuellen(d);
        K.aenderung();
        K.neuZeichnen();
        toast(r.grund || `${r.neu} Unterrichtstag(e) ergänzt${r.entfernt ? `, ${r.entfernt} frühere Ergänzung(en) neu berechnet` : ''}.`);
      } }, 'Schuljahr auffüllen'),
      h('span', { class: 'klein' }, 'Zelle antippen für die Zeichen-Auswahl, oder mit der Tastatur tippen: . V sps k ke ka ku | E A B P U, Entf leert, Pfeiltasten und Enter bewegen.')),
    h('div', { class: 'legende' },
      [['z-normal', '. V sps (1. Mal) anwesend'], ['z-rot', 'U, ku: 0'], ['z-orange', 'sps ab dem 2. Mal: 0'], ['z-violett', 'k, |: offen'], ['z-grau', 'E A B P ke ka, leer: zählt nicht']].map(([c, t]) => h('span', { class: `legende-punkt ${c}` }, t))),
    personen.length === 0 ? h('p', { class: 'hinweis' }, 'Bitte zuerst unter „Grunddaten“ Schüler:innen eintragen.') : rahmen);
  zeichnen();
  return { el: wurzel, update: () => {} };
}

// ---------- Mitarbeit ----------

let mitReihe = null;
let mitModus = 'mitarbeit'; // 'mitarbeit' | 0 | 1 | 2 (Merkmal)

export function zeigeMitarbeit() {
  const { d, ein, personen } = sportKontext();
  const wurzel = h('section', { class: 'seite' });
  const rahmen = h('div', { class: 'tabelle-rahmen raster' });
  if (mitReihe !== 'alle' && !d.sport.reihen.some((r) => r.id === mitReihe)) mitReihe = termineGeordnet(d).at(-1)?.reihe || d.sport.reihen.at(-1)?.id || 'alle';
  let fokus = null;

  const reiheWahl = h('select', { id: 'mit-reihe', 'aria-label': 'Reihe', onchange: (e) => { mitReihe = e.target.value; zeichnen(); } },
    d.sport.reihen.map((r) => h('option', { value: r.id, selected: mitReihe === r.id }, r.name || 'ohne Namen')),
    h('option', { value: 'alle', selected: mitReihe === 'alle' }, 'alle Reihen'));
  const modusWahl = h('select', { id: 'mit-modus', 'aria-label': 'Anzeige', onchange: (e) => { mitModus = e.target.value === 'mitarbeit' ? 'mitarbeit' : Number(e.target.value); zeichnen(); } },
    h('option', { value: 'mitarbeit', selected: mitModus === 'mitarbeit' }, 'Mitarbeit (0–3)'),
    [0, 1, 2].map((m) => h('option', { value: m, selected: mitModus === m }, `Merkmal M${m + 1}`)));

  function setzeMitarbeit(t, s, wert) {
    const m = (d.sport.mitarbeit[t.id] ||= {});
    if (wert === null || wert === ein.standardwert) delete m[s.id];
    else m[s.id] = wert;
    fokus = { t: t.id, s: s.id };
    K.aenderung();
    zeichnen();
  }
  function toggleMerkmal(t, s, i) {
    const m = (d.sport.merkmale[t.id] ||= {});
    const a = (m[s.id] ||= [false, false, false]);
    a[i] = !a[i];
    if (!a.some(Boolean)) delete m[s.id];
    fokus = { t: t.id, s: s.id };
    K.aenderung();
    zeichnen();
  }

  function zeichnen() {
    leeren(rahmen);
    let termine = termineGeordnet(d);
    if (mitReihe !== 'alle') termine = termine.filter((t) => t.reihe === mitReihe);
    if (termine.length === 0) {
      rahmen.append(h('p', { class: 'hinweis' }, 'Für diese Auswahl gibt es noch keine Termine (unter „Anwesenheit“ anlegen).'));
      return;
    }
    const reihe = mitReihe === 'alle' ? null : reiheById(d, mitReihe);
    const sps = new Map(personen.map((p) => [p.id, spsNummern(d, p.id)]));
    const kopf = h('tr', {}, h('th', {}, 'Nr.'), h('th', { class: 'links name-spalte' }, 'Name'),
      termine.map((t) => h('th', { class: `datum-kopf ${istPruefungstag(t, ein) ? 'pruef-tag' : ''}`, title: t.vermerk || '' }, h('span', { class: 'datum-knopf' }, datumKurz(t.datum)))),
      reihe && ['n', 'Ø', 'Grund', 'M1', 'M2', 'M3', 'Note', 'sps', 'offen', ''].map((x) => h('th', {}, x)));
    const tbody = h('tbody');
    personen.forEach((p, i) => {
      const zellen = termine.map((t) => {
        const z = anwesenheitZeichen(d, t.id, p.id);
        const c = mitarbeitZelle(d, t, p.id, ein, sps.get(p.id));
        const btn = h('button', { type: 'button', 'data-t': t.id, 'data-s': p.id });
        if (mitModus === 'mitarbeit') {
          const manuell = d.sport.mitarbeit[t.id]?.[p.id];
          btn.className = `zelle ${c.zaehlt ? mitarbeitFarbe(c.wert, c.grund) : 'z-grau'}`;
          btn.textContent = c.zaehlt ? String(c.wert) : z ? '–' : '';
          btn.title = !c.zaehlt ? (c.grund === 'offen' ? 'offen, zählt nicht' : `zählt nicht (${z || 'noch nicht erfasst'})`) : c.grund === 'auto0' ? `automatisch 0 (${z})` : c.grund === 'standard' ? 'Standardwert' : 'abweichend eingetragen';
          btn.disabled = !c.zaehlt || c.grund === 'auto0';
          btn.setAttribute('aria-label', `${anzeigename(p)} ${datumDeutsch(t.datum)} Mitarbeit ${btn.textContent || 'leer'}`);
          btn.addEventListener('click', () => {
            const reihenfolge = [ein.standardwert, 3, 1, 0].filter((v, k, a) => a.indexOf(v) === k);
            const jetzt = typeof manuell === 'number' ? manuell : ein.standardwert;
            const naechster = reihenfolge[(reihenfolge.indexOf(jetzt) + 1) % reihenfolge.length];
            setzeMitarbeit(t, p, naechster);
          });
          btn.addEventListener('keydown', (ev) => {
            if (/^[0-3]$/.test(ev.key) && !btn.disabled) { ev.preventDefault(); setzeMitarbeit(t, p, Number(ev.key)); }
            else if ((ev.key === 'Backspace' || ev.key === 'Delete') && !btn.disabled) { ev.preventDefault(); setzeMitarbeit(t, p, null); }
            else if (ev.key === 'Enter' || ev.key === 'ArrowDown') { ev.preventDefault(); rahmen.querySelector(`button.zelle[data-t="${t.id}"][data-s="${personen[i + 1]?.id}"]`)?.focus(); }
            else if (ev.key === 'ArrowUp') { ev.preventDefault(); rahmen.querySelector(`button.zelle[data-t="${t.id}"][data-s="${personen[i - 1]?.id}"]`)?.focus(); }
          });
        } else {
          const gilt = z !== 'sps' && z !== 'ku' && z !== 'U' && z !== '' && ZEICHEN[z]?.art !== 'ohne';
          const an = !!d.sport.merkmale[t.id]?.[p.id]?.[mitModus];
          btn.className = `zelle ${!gilt ? 'z-grau' : an ? 'm-gruen' : 'z-normal'}`;
          btn.textContent = an ? '✓' : '';
          btn.title = !gilt ? 'Häkchen aus Terminen mit sps, ku/U oder ohne Teilnahme zählen nicht' : '';
          btn.disabled = !gilt && !an;
          btn.setAttribute('aria-label', `${anzeigename(p)} ${datumDeutsch(t.datum)} M${mitModus + 1} ${an ? 'angehakt' : 'leer'}`);
          btn.addEventListener('click', () => toggleMerkmal(t, p, mitModus));
        }
        return h('td', { class: 'zellen-td' }, btn);
      });
      let summe = null;
      if (reihe) {
        const m = mitarbeitReihe(d, reihe, p.id, ein);
        const ueb = () => {
          let w = h('input', { type: 'text', inputmode: 'decimal', value: m.ueberschrieben ? String(m.ueberschrieben.wert).replace('.', ',') : '', 'aria-label': 'Mitarbeitsnote' });
          let b = h('input', { type: 'text', value: m.ueberschrieben?.begruendung || '', 'aria-label': 'Begründung' });
          return inhaltDialog(`Mitarbeitsnote überschreiben: ${anzeigename(p)}`, [h('p', { class: 'klein' }, `Berechnet: ${m.berechnet === null ? '–' : (Math.round(m.berechnet * 100) / 100).toString().replace('.', ',')}. Leer lassen und speichern, um die Überschreibung zu entfernen.`), h('label', {}, 'Note (Dezimalzahl)', w), h('label', {}, 'Begründung (Pflicht)', b)], [
            { text: 'Abbrechen', wert: false, abbruch: true },
            { text: 'Speichern', wert: true, klasse: 'knopf primaer', vorPruefung: () => {
              const z = Number(String(w.value).replace(',', '.'));
              if (w.value.trim() === '') return true;
              const ok = !Number.isNaN(z) && z >= 0 && z <= 6 && b.value.trim() !== '';
              b.classList.toggle('fehler', b.value.trim() === '');
              w.classList.toggle('fehler', Number.isNaN(z));
              return ok;
            } },
          ]).then((ok) => {
            if (!ok) return;
            const wert = (d.sport.reihen.find((r) => r.id === reihe.id).werte[p.id] ||= {});
            if (w.value.trim() === '') delete wert.mitarbeitNote;
            else wert.mitarbeitNote = { wert: Number(String(w.value).replace(',', '.')), begruendung: b.value.trim() };
            K.aenderung();
            zeichnen();
          });
        };
        summe = [
          h('td', { class: 'zahl', 'data-n': p.id }, String(m.n)),
          h('td', { class: 'zahl' }, m.mittel === null ? (m.n ? `<${ein.mindestTermine}` : '') : (Math.round(m.mittel * 100) / 100).toString().replace('.', ',')),
          h('td', { class: 'zahl' }, m.grundnote ?? ''),
          [0, 1, 2].map((i2) => h('td', { class: `mitte ${m.gezeigt[i2] ? 'm-gruen' : ''}`, title: `${m.merkmalAnzahl[i2]} Termin(e)` }, m.gezeigt[i2] ? '✓' : String(m.merkmalAnzahl[i2] || ''))),
          h('td', { class: 'zahl', 'data-note': p.id }, m.note === null ? '' : h('strong', {}, (Math.round(m.note * 100) / 100).toString().replace('.', ',')), m.ueberschrieben && h('span', { class: 'klein', title: m.ueberschrieben.begruendung }, ' (überschr.)')),
          h('td', { class: `zahl ${m.sps >= 2 ? 'z-orange' : ''}` }, String(m.sps)),
          h('td', { class: `zahl ${m.offen ? 'z-violett' : ''}` }, String(m.offen)),
          h('td', {}, h('button', { type: 'button', class: 'knopf klein', 'aria-label': `Mitarbeitsnote überschreiben ${anzeigename(p)}`, onclick: ueb }, '✎')),
        ];
      }
      tbody.append(h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links name name-spalte' }, personLink(p, anzeigename(p))), zellen, summe));
    });
    { const tab = h('table', { class: 'tabelle sport-raster' }, h('thead', {}, kopf), tbody); rahmen.append(tab); tabelleFixieren(tab); }
    if (fokus) { rahmen.querySelector(`button.zelle[data-t="${fokus.t}"][data-s="${fokus.s}"]`)?.focus(); fokus = null; }
  }

  fuege(wurzel,
    h('h1', {}, 'Mitarbeit'),
    h('div', { class: 'knopfreihe' }, h('label', { class: 'inline' }, 'Reihe: ', reiheWahl), h('label', { class: 'inline' }, 'Anzeige: ', modusWahl)),
    h('p', { class: 'klein' }, `Jede zählende Zelle ist automatisch ${String(ein.standardwert).replace('.', ',')}. Tippen Sie nur Abweichungen an (3, 1, 0); Tippen wechselt der Reihe nach, mit der Tastatur 0–3, Entf setzt zurück. Automatische Nullen aus der Anwesenheit haben Vorrang.`),
    h('div', { class: 'legende' }, [['m-gruen', '3 durchgehend aktiv'], ['m-blau', '1 überwiegend passiv'], ['z-rot', '0 anwesend ohne Beteiligung'], ['z-grau', 'zählt nicht']].map(([c, t]) => h('span', { class: `legende-punkt ${c}` }, t))),
    personen.length === 0 ? h('p', { class: 'hinweis' }, 'Bitte zuerst unter „Grunddaten“ Schüler:innen eintragen.') : rahmen);
  zeichnen();
  return { el: wurzel, update: () => {} };
}

const sport = (extra) => ({ klasse: true, nurWenn: sportKlasse, ...extra });
ansichtRegistrieren('anwesenheit', sport({ text: 'Anwesenheit', bauen: zeigeAnwesenheit, reihe: 2.1 }));
ansichtRegistrieren('mitarbeit', sport({ text: 'Mitarbeit', bauen: zeigeMitarbeit, reihe: 2.3 }));
