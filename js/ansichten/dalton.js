// Dalton-Aufgaben: Schnelleingabe, Übersicht, Einstellungen (SPEC 8.3).
import { K } from '../kontext.js';
import { h, leeren, bestaetigen, inhaltDialog, avatar, fuege } from '../ui.js';
import { neueDaltonAufgabe, aktiveSchueler, anzeigename, datumDeutsch, heuteIso } from '../modell.js';
import { daltonNote, daltonProzent, DALTON_STATUS, DALTON_QUALITAET } from '../dalton.js';
import { formatZahl, zahlLesen } from '../rechnen.js';
import { ansichtRegistrieren } from '../registry.js';
import { personAbschnittRegistrieren } from './person.js';

let aktuelleAufgabe = null;

const SYMBOL = { abgegeben: '✔', nicht: '✘', entschuldigt: '○', taeuschung: '⚠' };

export function symbolFuer(e) {
  if (!e || !e.status) return '';
  const q = e.status === 'abgegeben' && e.qualitaet ? ` ${e.qualitaet}` : '';
  return `${SYMBOL[e.status] || ''}${q}`;
}

function aufgabeFragen(titel, a) {
  const titelFeld = h('input', { type: 'text', value: a?.titel || '', placeholder: 'z. B. Dalton-Aufgabe Lagerbuchführung' });
  const ausgabe = h('input', { type: 'date', value: a?.ausgabe || heuteIso() });
  const abgabe = h('input', { type: 'date', value: a?.abgabe || '' });
  const gewicht = h('input', { type: 'text', inputmode: 'decimal', value: String(a?.gewicht ?? 1).replace('.', ',') });
  return inhaltDialog(titel, [
    h('label', {}, 'Titel', titelFeld),
    h('label', {}, 'Ausgabedatum', ausgabe),
    h('label', {}, 'Abgabedatum', abgabe),
    h('label', {}, 'Gewicht (Standard 1)', gewicht),
  ], [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: 'Speichern', wert: true, klasse: 'knopf primaer', vorPruefung: () => {
      const z = zahlLesen(gewicht.value);
      gewicht.classList.toggle('fehler', z === null || Number.isNaN(z) || z < 0);
      return z !== null && !Number.isNaN(z) && z >= 0;
    } },
  ]).then((ok) => (ok ? { titel: titelFeld.value.trim(), ausgabe: ausgabe.value, abgabe: abgabe.value, gewicht: zahlLesen(gewicht.value) } : null));
}

export function zeigeDalton(params) {
  const d = K.daten;
  const bereich = params[0] || 'eingabe';
  const wurzel = h('section', { class: 'seite' });
  wurzel.append(
    h('h1', {}, 'Dalton'),
    h('div', { class: 'reiter' },
      [['eingabe', '#/dalton', 'Schnelleingabe'], ['uebersicht', '#/dalton/uebersicht', 'Übersicht'], ['einstellungen', '#/dalton/einstellungen', 'Einstellungen']]
        .map(([id, href, text]) => h('a', { href, class: `reiter-punkt${bereich === id ? ' aktiv' : ''}` }, text))),
    h('p', { class: 'klein' }, d.dalton.modus === 'einrechnen' ? `Dalton fließt mit ${String(d.dalton.anteil).replace('.', ',')} % in die sonstige Leistung ein.` : 'Dalton wird nur dokumentiert und fließt nicht in die Note ein.'),
  );
  const ansicht = bereich === 'uebersicht' ? uebersicht(d) : bereich === 'einstellungen' ? einstellungen(d) : eingabe(d);
  wurzel.append(ansicht.el);
  return { el: wurzel, update: ansicht.update };
}

// ---------- Schnelleingabe ----------

function eingabe(d) {
  const wurzel = h('div', {});
  const inhalt = h('div', {});
  const personen = aktiveSchueler(d);
  const updater = [];
  if (!aktuelleAufgabe || !d.dalton.aufgaben.some((a) => a.id === aktuelleAufgabe)) aktuelleAufgabe = d.dalton.aufgaben.at(-1)?.id || null;

  function render() {
    leeren(inhalt);
    updater.length = 0;
    const a = d.dalton.aufgaben.find((x) => x.id === aktuelleAufgabe);
    const auswahl = h('select', { 'aria-label': 'Dalton-Aufgabe wählen', onchange: (e) => { aktuelleAufgabe = e.target.value; render(); } },
      d.dalton.aufgaben.map((x, i) => h('option', { value: x.id, selected: x.id === aktuelleAufgabe }, `${i + 1}. ${x.titel || 'ohne Titel'}${x.abgabe ? ` (Abgabe ${datumDeutsch(x.abgabe)})` : ''}`)));
    fuege(inhalt, h('div', { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf primaer gross', id: 'dalton-neu', onclick: async () => {
        const v = await aufgabeFragen('Neue Dalton-Aufgabe', null);
        if (!v) return;
        const neu = neueDaltonAufgabe(v.titel, v.ausgabe, v.abgabe);
        neu.gewicht = v.gewicht;
        d.dalton.aufgaben.push(neu);
        aktuelleAufgabe = neu.id;
        K.aenderung();
        render();
      } }, '+ Neue Dalton-Aufgabe'),
      d.dalton.aufgaben.length > 0 && h('label', { class: 'inline' }, 'Aufgabe: ', auswahl),
      a && h('button', { type: 'button', class: 'knopf', onclick: async () => {
        const v = await aufgabeFragen('Dalton-Aufgabe bearbeiten', a);
        if (!v) return;
        Object.assign(a, v);
        K.aenderung();
        render();
      } }, 'Bearbeiten'),
      a && h('button', { type: 'button', class: 'knopf gefahr', onclick: async () => {
        if (!(await bestaetigen('Dalton-Aufgabe löschen', `„${a.titel || 'ohne Titel'}“ wird mit allen Einträgen gelöscht.`, 'Löschen', true))) return;
        d.dalton.aufgaben.splice(d.dalton.aufgaben.indexOf(a), 1);
        aktuelleAufgabe = null;
        K.aenderung();
        render();
      } }, 'Löschen')));
    if (!a) return inhalt.append(h('p', { class: 'hinweis' }, 'Noch keine Dalton-Aufgabe. Legen Sie die erste an.'));
    if (personen.length === 0) return inhalt.append(h('p', { class: 'hinweis' }, 'Bitte zuerst unter „Grunddaten“ Schüler:innen eintragen.'));
    const liste = h('div', { class: 'schnell-liste' });
    for (const s of personen) {
      const e = (a.eintraege[s.id] ||= {});
      const pr = h('span', { class: 'klein prozent' });
      const statusTasten = Object.entries(DALTON_STATUS).map(([wert, text]) =>
        h('button', { type: 'button', class: 'knopf taste', 'data-status': wert, 'aria-pressed': String(e.status === wert), 'aria-label': `${anzeigename(s)}: ${text}`, title: text, onclick: () => {
          e.status = e.status === wert ? undefined : wert;
          if (e.status !== 'abgegeben') delete e.qualitaet;
          K.aenderung();
          render();
        } }, SYMBOL[wert]));
      const qualiTasten = e.status === 'abgegeben' ? Object.entries(DALTON_QUALITAET).map(([wert, text]) =>
        h('button', { type: 'button', class: 'knopf taste', 'data-qualitaet': wert, 'aria-pressed': String(e.qualitaet === wert), 'aria-label': `${anzeigename(s)}: Qualität ${text}`, onclick: () => {
          e.qualitaet = e.qualitaet === wert ? undefined : wert;
          K.aenderung();
          render();
        } }, text)) : [];
      const selbst = e.status === 'abgegeben' ? h('label', { class: 'inline klein' }, 'selbstständig: ',
        h('select', { 'aria-label': `${anzeigename(s)}: selbstständig erarbeitet`, onchange: (ev) => { e.selbststaendig = ev.target.value || undefined; K.aenderung(); } },
          [['', '–'], ['ja', 'ja'], ['nein', 'nein']].map(([w, t]) => h('option', { value: w, selected: (e.selbststaendig || '') === w }, t)))) : null;
      const note = h('input', { type: 'text', inputmode: 'decimal', class: 'notenfeld', placeholder: 'Note', title: 'Note überschreiben (1,0 bis 6,0)', 'aria-label': `${anzeigename(s)}: Note überschreiben`, value: typeof e.note === 'number' ? String(e.note).replace('.', ',') : '',
        oninput: (ev) => {
          const z = zahlLesen(ev.target.value);
          const ok = z === null || (!Number.isNaN(z) && z >= 1 && z <= 6);
          ev.target.classList.toggle('fehler', !ok);
          if (ok) { e.note = z === null ? undefined : z; K.aenderung(); }
        } });
      const notiz = h('input', { type: 'text', class: 'notizfeld', placeholder: 'Notiz', 'aria-label': `${anzeigename(s)}: Notiz`, value: e.notiz || '', oninput: (ev) => { e.notiz = ev.target.value; K.aenderung(); } });
      updater.push(() => {
        const n = daltonNote(e, d.dalton.zuordnung);
        const p = daltonProzent(e, d.dalton.zuordnung);
        pr.textContent = n === null ? '' : `Note ${formatZahl(n, 1)} = ${formatZahl(p, 2)} %`;
      });
      liste.append(h('div', { class: 'schnell-zeile dalton-zeile' },
        h('div', { class: 'schnell-name' }, avatar(d, s), ' ', anzeigename(s)),
        h('div', { class: 'tasten' }, statusTasten),
        h('div', { class: 'tasten' }, qualiTasten, selbst),
        h('div', { class: 'schnell-note' }, note, pr),
        notiz));
    }
    inhalt.append(h('p', { class: 'klein' }, `✔ abgegeben · ✘ nicht abgegeben · ○ entschuldigt (zählt nicht) · ⚠ Täuschung. Ohne Status zählt der Eintrag nicht.`), liste);
    updater.forEach((f) => f());
  }
  render();
  wurzel.append(inhalt);
  return { el: wurzel, update: () => updater.forEach((f) => f()) };
}

// ---------- Übersicht ----------

function uebersicht(d) {
  const personen = aktiveSchueler(d);
  if (d.dalton.aufgaben.length === 0) return { el: h('p', { class: 'hinweis' }, 'Noch keine Dalton-Aufgaben.') };
  const kopf = h('tr', {}, h('th', {}, 'Nr.'), h('th', { class: 'links' }, 'Name'),
    d.dalton.aufgaben.map((a, i) => h('th', {}, h('div', {}, `${i + 1}. ${a.titel || 'ohne Titel'}`), h('div', { class: 'klein' }, a.abgabe ? `Abgabe ${datumDeutsch(a.abgabe)}` : ''), h('div', { class: 'klein' }, `Gewicht ${String(a.gewicht).replace('.', ',')}`))));
  const tbody = h('tbody', {}, personen.map((s, i) => h('tr', {},
    h('td', { class: 'zahl' }, String(i + 1)),
    h('td', { class: 'links name' }, h('a', { href: `#/person/${s.id}` }, [s.name, s.vorname].filter(Boolean).join(', '))),
    d.dalton.aufgaben.map((a) => {
      const e = a.eintraege[s.id];
      const n = daltonNote(e, d.dalton.zuordnung);
      const zelle = h('td', { class: 'mitte', title: e?.notiz || '' }, h('span', { class: 'symbol' }, symbolFuer(e)));
      if (n !== null) zelle.append(h('div', { class: 'klein' }, `${formatZahl(n, 1)} · ${formatZahl(daltonProzent(e, d.dalton.zuordnung), 2)} %`));
      if (e?.selbststaendig === 'nein') zelle.append(h('div', { class: 'klein' }, 'nicht selbstständig'));
      if (e?.notiz) zelle.append(h('span', { class: 'notiz-symbol', title: e.notiz }, '📝'));
      return zelle;
    }))));
  return { el: h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle' }, h('thead', {}, kopf), tbody)) };
}

// ---------- Einstellungen ----------

function einstellungen(d) {
  const z = d.dalton.zuordnung;
  const t = d.dalton.texte;
  const zeilen = [['gut', 'abgegeben, gut'], ['mittel', 'abgegeben, mittel'], ['schlecht', 'abgegeben, schlecht'], ['nicht', 'nicht abgegeben'], ['taeuschung', 'Täuschung (abgeschrieben)']];
  const tabelle = h('table', { class: 'tabelle' },
    h('thead', {}, h('tr', {}, ['Bewertung', 'Note', 'Beschreibung (für den Aushang)'].map((x) => h('th', {}, x)))),
    h('tbody', {}, zeilen.map(([k, text]) => h('tr', {},
      h('td', { class: 'links' }, text),
      h('td', {}, h('input', { type: 'text', inputmode: 'decimal', class: 'gewicht', 'aria-label': `Note ${text}`, value: String(z[k]).replace('.', ','),
        oninput: (e) => {
          const v = zahlLesen(e.target.value);
          const ok = v !== null && !Number.isNaN(v) && v >= 1 && v <= 6;
          e.target.classList.toggle('fehler', !ok);
          if (ok) { z[k] = v; K.aenderung(); }
        } })),
      h('td', {}, h('input', { type: 'text', class: 'breit-feld', 'aria-label': `Beschreibung ${text}`, value: t[k] || '', oninput: (e) => { t[k] = e.target.value; K.aenderung(); } }))))));
  return { el: h('div', {},
    h('p', {}, 'Zuordnung Bewertung → Note für diese Klasse. „Entschuldigt“ hat keinen Wert und zählt nicht. Die Note wird wie eine sonstige Leistung über das IHK-Schema in Prozent umgerechnet.'),
    h('div', { class: 'tabelle-rahmen' }, tabelle),
    h('p', { class: 'klein' }, 'Eine überschriebene Note (Feld „Note“ in der Schnelleingabe) hat immer Vorrang.'),
    h('a', { class: 'knopf', href: '#/druck' }, 'Druck „Bewertungskriterien Dalton“')) };
}

// ---------- Personenübersicht ----------

personAbschnittRegistrieren(30, (d, s) => {
  if (d.dalton.modus === 'aus') return null;
  const zeilen = d.dalton.aufgaben.map((a) => {
    const e = a.eintraege[s.id];
    const n = daltonNote(e, d.dalton.zuordnung);
    return h('tr', {}, h('td', { class: 'links' }, a.titel || 'ohne Titel'), h('td', {}, datumDeutsch(a.abgabe)), h('td', {}, DALTON_STATUS[e?.status] || ''), h('td', {}, DALTON_QUALITAET[e?.qualitaet] || ''), h('td', {}, e?.selbststaendig || ''), h('td', { class: 'zahl' }, n === null ? '' : formatZahl(n, 1)), h('td', { class: 'zahl' }, n === null ? '' : formatZahl(daltonProzent(e, d.dalton.zuordnung), 2)), h('td', { class: 'links' }, e?.notiz || ''));
  });
  return h('div', {}, h('h2', {}, 'Dalton'),
    zeilen.length ? h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle klein-tabelle' }, h('thead', {}, h('tr', {}, ['Aufgabe', 'Abgabe', 'Status', 'Qualität', 'selbstständig', 'Note', '%', 'Notiz'].map((x) => h('th', {}, x)))), h('tbody', {}, zeilen))) : h('p', { class: 'hinweis' }, 'Noch keine Dalton-Aufgaben.'));
});

ansichtRegistrieren('dalton', { text: 'Dalton', bauen: zeigeDalton, klasse: true, reihe: 5, nurWenn: () => K.daten && K.daten.dalton.modus !== 'aus' });
