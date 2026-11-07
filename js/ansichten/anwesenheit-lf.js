// Anwesenheitsliste für Lernfeld-, Fach-, Kurs- und Lerngebietsklassen (SPEC 12.3).
// Aufbau und Bedienung wie im Sport (Sport ist die Grundlage): Termine als Spalten, Personen als Zeilen,
// Zelle antippen für die Zeichen-Auswahl, Tastatur, „Alle da“, Ferien/Feiertage/Ausfälle als graue Spalten.
// Die Zeichen liegen in `klasse.anwesenheitLf`. Fehlt jemand (E A B P U |), entsteht zusätzlich eine Fehlzeit,
// die in „Fehlzeiten“ und beim Nachschreiben wirkt. Einträge aus Untis bleiben unangetastet und werden nur angezeigt.
import { h, leeren, fuege, toast, personLink } from '../ui.js';
import { aktiveSchueler, anzeigename, datumDeutsch, heuteIso, neueId, neuerTermin } from '../modell.js';
import { FZ_QUELLE } from '../fehlzeiten.js';
import { ZEICHEN } from '../sport.js';
import { zeichenFarbe, zeichenPalette, datumKurz } from './sport-gemeinsam.js';
import { pausenSpalten } from '../rhythmus.js';
import { ansichtRegistrieren } from '../registry.js';
import { K } from '../kontext.js';

/** Zeichen der Liste: dieselben wie im Sport, soweit sie für den Unterricht ohne Sportbezug passen. */
export const ANWESENHEIT_ZEICHEN = {
  '.': { text: ZEICHEN['.'].text, status: null },
  V: { text: ZEICHEN.V.text, status: null },
  '|': { text: ZEICHEN['|'].text, status: 'offen' },
  E: { text: ZEICHEN.E.text, status: 'entschuldigt' },
  A: { text: ZEICHEN.A.text, status: 'attest' },
  B: { text: ZEICHEN.B.text, status: 'entschuldigt', grund: 'betrieblich befreit' },
  P: { text: ZEICHEN.P.text, status: 'entschuldigt', grund: 'privat befreit' },
  U: { text: ZEICHEN.U.text, status: 'nicht' },
};
const LISTE = Object.keys(ANWESENHEIT_ZEICHEN);
const KURZ = { '.': '.', v: 'V', e: 'E', a: 'A', b: 'B', p: 'P', u: 'U', '|': '|' };
/** Fehlzeit-Status auf das Zeichen (für Untis-Einträge und ältere Einträge). */
const ZEICHEN_ZU_STATUS = { entschuldigt: 'E', attest: 'A', nicht: 'U', offen: '|' };

const istLernfeld = () => K.daten && K.daten.fachtyp !== 'sport';

/** Von Hand gesetzte Fehlzeit dieser Person an diesem Datum (aus der Anwesenheitsliste). */
export function handEintrag(klasse, schuelerId, datum) {
  return klasse.fehlzeiten.find((f) => f.schuelerId === schuelerId && f.quelle === 'manuell'
    && f.datum === datum && f.stundeEintrag) || null;
}

/** Fehlzeiten anderer Herkunft (Untis) an diesem Datum. */
export function fremdEintraege(klasse, schuelerId, datum) {
  return klasse.fehlzeiten.filter((f) => f.schuelerId === schuelerId && f.datum === datum && !f.stundeEintrag);
}

/**
 * Zeichen einer Zelle. Ein eigenes Fehlzeichen (E A B P U |) steht vor Untis, Untis vor einem eigenen „.“ oder V.
 * Rückgabe {zeichen, eigen, fremd} und, wenn gesetzt, min, stern, text.
 */
export function zeichenVon(klasse, schuelerId, datum) {
  const marke = klasse.anwesenheitLf?.[datum]?.[schuelerId];
  const extra = marke ? { ...(marke.min ? { min: marke.min } : {}), ...(marke.stern ? { stern: true } : {}), ...(marke.text ? { text: marke.text } : {}) } : {};
  if (marke?.z && ANWESENHEIT_ZEICHEN[marke.z]?.status) return { zeichen: marke.z, eigen: true, fremd: false, ...extra };
  const eigen = handEintrag(klasse, schuelerId, datum);
  if (eigen && !marke?.z) return { zeichen: ZEICHEN_ZU_STATUS[eigen.status] || '|', eigen: true, fremd: false };
  const fremd = fremdEintraege(klasse, schuelerId, datum);
  if (fremd.length > 0) return { zeichen: ZEICHEN_ZU_STATUS[fremd[0].status] || '|', eigen: false, fremd: true };
  if (marke?.z) return { zeichen: marke.z, eigen: true, fremd: false, ...extra };
  return { zeichen: '', eigen: false, fremd: false };
}

/**
 * Zeichen setzen. Leer entfernt alles. Fehlzeichen legen die zugehörige Fehlzeit an oder ändern sie,
 * „.“ und V entfernen sie wieder. `extra`: {min, stern, text}.
 */
export function zeichenSetzen(klasse, schuelerId, datum, zeichen, extra = {}) {
  const ziel = ANWESENHEIT_ZEICHEN[zeichen];
  const karte = (klasse.anwesenheitLf ||= {});
  const vorhanden = handEintrag(klasse, schuelerId, datum);
  const entfernen = () => {
    if (vorhanden) klasse.fehlzeiten.splice(klasse.fehlzeiten.indexOf(vorhanden), 1);
  };
  if (!ziel) {
    if (karte[datum]) {
      delete karte[datum][schuelerId];
      if (Object.keys(karte[datum]).length === 0) delete karte[datum];
    }
    entfernen();
    return;
  }
  (karte[datum] ||= {})[schuelerId] = {
    z: zeichen,
    ...(zeichen === 'V' && extra.min ? { min: Number(extra.min) } : {}),
    ...(extra.stern ? { stern: true } : {}),
    ...(extra.text ? { text: extra.text } : {}),
  };
  if (ziel.status === null) return entfernen();
  if (vorhanden) {
    vorhanden.status = ziel.status;
    vorhanden.grund = ziel.grund || '';
    return;
  }
  klasse.fehlzeiten.push({
    id: neueId(), schuelerId, datum, datumBis: '', zeitVon: '', zeitBis: '', stunde: null,
    std: 1, min: 0, fach: '', status: ziel.status, grund: ziel.grund || '', quelle: 'manuell', notiz: '',
    zaehltNicht: false, stundeEintrag: true,
  });
}

/**
 * Spalten der Liste: alle Unterrichtstage der Klasse, nach Datum sortiert.
 * Quellen sind der Stundenplan (wie im Sport) und die angelegten Stunden der sonstigen Leistung.
 * Mehrere Stunden am selben Tag ergeben eine Spalte, weil Fehlzeiten tagesweise geführt werden.
 */
export function termineVon(klasse) {
  const tage = new Map();
  for (const e of klasse.stundenplan || []) {
    if (e.status === 'ok' && e.datum) tage.set(e.datum, { datum: e.datum, quelle: 'stundenplan' });
  }
  for (const t of klasse.sonstige || []) {
    if (t.datum) tage.set(t.datum, { datum: t.datum, quelle: 'stunde', name: t.name || '' });
  }
  return [...tage.values()].sort((a, b) => a.datum.localeCompare(b.datum));
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const monatName = (iso) => `${MONATE[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

function zeigeAnwesenheitLf() {
  const d = K.daten;
  const wurzel = h('section', { class: 'seite' });
  const rahmen = h('div', { class: 'tabelle-rahmen raster' });
  let fokus = null;
  let puffer = '';
  let pufferZeit = 0;

  const zellenInhalt = (btn, t, s) => {
    const z = zeichenVon(d, s.id, t.datum);
    btn.className = `zelle ${zeichenFarbe(z.zeichen)}${z.zeichen === '.' ? ' punkt' : ''}${z.zeichen === '|' ? ' strich' : ''}${z.fremd ? ' fremd' : ''}`;
    btn.textContent = z.zeichen ? `${z.zeichen}${z.zeichen === 'V' && z.min ? z.min : ''}${z.stern ? '*' : ''}` : '';
    btn.title = [z.zeichen && (ANWESENHEIT_ZEICHEN[z.zeichen]?.text || ''), z.text,
      z.fremd && `aus ${FZ_QUELLE[fremdEintraege(d, s.id, t.datum)[0]?.quelle] || 'Import'}, nicht änderbar`].filter(Boolean).join(' · ');
    btn.setAttribute('aria-label', `${anzeigename(s)} ${datumDeutsch(t.datum)}: ${z.zeichen || 'leer'}`);
  };

  const setze = (t, s, zeichen, extra) => {
    zeichenSetzen(d, s.id, t.datum, zeichen, extra);
    K.aenderung();
  };

  async function palette(t, s) {
    const jetzt = zeichenVon(d, s.id, t.datum);
    if (jetzt.fremd) {
      toast('Dieser Eintrag stammt aus einem Import. Ändern Sie ihn unter „Fehlzeiten“.');
      return;
    }
    const erg = await zeichenPalette(d, t, s, { z: jetzt.zeichen, min: jetzt.min, stern: jetzt.stern, text: jetzt.text }, LISTE);
    if (erg === null || erg === undefined) return;
    fokus = { t: t.datum, s: s.id };
    setze(t, s, erg.z, erg);
    zeichnen();
  }

  function taste(ev, t, s, termine, personen) {
    const k = ev.key;
    const i = personen.findIndex((p) => p.id === s.id);
    const j = termine.findIndex((x) => x.datum === t.datum);
    const gehe = (di, dj) => {
      const ziel = rahmen.querySelector(`button.zelle[data-t="${termine[j + dj]?.datum}"][data-s="${personen[i + di]?.id}"]`);
      if (ziel) { ev.preventDefault(); ziel.focus(); }
    };
    if (k === 'ArrowDown' || k === 'Enter') return gehe(1, 0);
    if (k === 'ArrowUp') return gehe(-1, 0);
    if (k === 'ArrowLeft') return gehe(0, -1);
    if (k === 'ArrowRight') return gehe(0, 1);
    if (k === 'Backspace' || k === 'Delete') { ev.preventDefault(); fokus = { t: t.datum, s: s.id }; setze(t, s, ''); return zeichnen(); }
    if (k === ' ') { ev.preventDefault(); return palette(t, s); }
    if (ev.ctrlKey || ev.metaKey || ev.altKey || k.length !== 1) return;
    const z = KURZ[k.toLowerCase()];
    if (!z) return;
    if (zeichenVon(d, s.id, t.datum).fremd) return;
    ev.preventDefault();
    fokus = { t: t.datum, s: personen[i + 1]?.id || s.id };
    const alt = zeichenVon(d, s.id, t.datum);
    setze(t, s, z, { min: z === 'V' ? alt.min : undefined, stern: alt.stern, text: alt.text });
    zeichnen();
  }

  function zeichnen() {
    leeren(rahmen);
    const personen = aktiveSchueler(d);
    const termine = termineVon(d);
    if (personen.length === 0) {
      return rahmen.append(h('p', { class: 'hinweis' }, 'Bitte zuerst unter „Grunddaten“ Schüler:innen eintragen.'));
    }
    if (termine.length === 0) {
      return rahmen.append(h('p', { class: 'hinweis' }, 'Noch keine Unterrichtstage. Laden Sie unter „Stundenplan“ den Plan aus Untis, dann erscheinen alle Termine dieser Klasse. Oder legen Sie oben eine einzelne Stunde an.'));
    }
    const pausen = pausenSpalten(d, termine.map((t) => t.datum));
    const spalten = [];
    termine.forEach((t, i) => {
      for (const p of pausen.get(i) || []) spalten.push({ pause: p, datum: p.datum });
      spalten.push({ t, datum: t.datum });
    });
    const monate = [];
    for (const sp of spalten) {
      const m = sp.datum.slice(0, 7);
      if (monate.at(-1)?.m === m) monate.at(-1).n += 1;
      else monate.push({ m, n: 1, name: monatName(sp.datum) });
    }
    const pauseTitel = (p) => `${p.text}${p.bis !== p.datum ? ` (${datumKurz(p.datum)} bis ${datumKurz(p.bis)})` : ` (${datumKurz(p.datum)})`}`;

    const kopf1 = h('tr', {}, h('th', { rowspan: 2 }, 'Nr.'), h('th', { rowspan: 2, class: 'links name-spalte' }, 'Name'),
      monate.map((x) => h('th', { class: 'reihe-balken', colspan: x.n, title: x.name }, x.name)),
      h('th', { rowspan: 2 }, 'fehlt'), h('th', { rowspan: 2 }, 'offen'));
    const kopf2 = h('tr', {}, spalten.map((sp) => (sp.pause
      ? h('th', { class: `pause-kopf pause-${sp.pause.art}`, title: pauseTitel(sp.pause) }, sp.pause.text)
      : h('th', { class: 'datum-kopf' },
        h('span', { class: 'datum-knopf', title: sp.t.name || '' }, datumKurz(sp.t.datum)),
        h('button', { type: 'button', class: 'alle-da', 'data-termin': sp.t.datum, title: 'Alle noch leeren Zellen dieses Tages auf anwesend setzen', 'aria-label': `Alle übrigen anwesend am ${datumDeutsch(sp.t.datum)}`, onclick: () => {
          let n = 0;
          for (const p of personen) if (!zeichenVon(d, p.id, sp.t.datum).zeichen) { zeichenSetzen(d, p.id, sp.t.datum, '.'); n += 1; }
          if (n) K.aenderung();
          zeichnen();
          toast(n ? `${n} Zelle(n) auf „.“ gesetzt.` : 'Keine leeren Zellen.');
        } }, 'Alle da')))));

    const tbody = h('tbody');
    personen.forEach((p, i) => {
      let fehlt = 0;
      let offen = 0;
      const zellen = spalten.map((sp) => {
        if (sp.pause) return h('td', { class: `pause-zelle pause-${sp.pause.art}`, title: pauseTitel(sp.pause) });
        const z = zeichenVon(d, p.id, sp.t.datum);
        if (ANWESENHEIT_ZEICHEN[z.zeichen]?.status) fehlt += 1;
        if (z.zeichen === '|') offen += 1;
        const btn = h('button', { type: 'button', 'data-t': sp.t.datum, 'data-s': p.id, onclick: () => palette(sp.t, p), onkeydown: (ev) => taste(ev, sp.t, p, termine, personen) });
        zellenInhalt(btn, sp.t, p);
        return h('td', { class: 'zellen-td' }, btn);
      });
      tbody.append(h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links name name-spalte' }, personLink(p, anzeigename(p))), zellen,
        h('td', { class: 'zahl' }, fehlt ? String(fehlt) : ''), h('td', { class: `zahl ${offen ? 'z-violett' : ''}`, 'data-offen': p.id }, offen ? String(offen) : '')));
    });
    rahmen.append(h('table', { class: 'tabelle sport-raster anwesenheit-lf' }, h('thead', {}, kopf1, kopf2), tbody));
    if (fokus) {
      rahmen.querySelector(`button.zelle[data-t="${fokus.t}"][data-s="${fokus.s}"]`)?.focus();
      fokus = null;
    }
  }

  fuege(wurzel,
    h('h1', {}, 'Anwesenheit'),
    h('div', { class: 'knopfreihe' },
      h('button', {
        type: 'button', class: 'knopf primaer', id: 'anw-neu',
        onclick: () => {
          d.sonstige.push(neuerTermin(heuteIso()));
          K.aenderung();
          zeichnen();
          toast('Stunde für heute angelegt.');
        },
      }, '+ Stunde (heute)'),
      h('span', { class: 'klein' }, 'Zelle antippen für die Zeichen-Auswahl, oder mit der Tastatur tippen: . V | E A B P U, Entf leert, Pfeiltasten und Enter bewegen. Graue Spalten sind Ferien, Feiertage und ausgefallene Stunden.')),
    h('div', { class: 'legende' },
      [['z-normal', '. V anwesend'], ['z-rot', 'U nicht entschuldigt'], ['z-violett', '| Grund offen'], ['z-grau', 'E A B P entschuldigt, leer: nicht eingetragen']].map(([c, t]) => h('span', { class: `legende-punkt ${c}` }, t))),
    rahmen);
  zeichnen();
  return { el: wurzel, update: () => {} };
}

ansichtRegistrieren('anwesenheit-lf', {
  text: 'Anwesenheit',
  bauen: zeigeAnwesenheitLf,
  klasse: true,
  nurWenn: istLernfeld,
  reihe: 2.05,
});
