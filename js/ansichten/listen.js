// Eigene Listen je Klasse (SPEC 8.14).
import { K } from '../kontext.js';
import { h, leeren, bestaetigen, inhaltDialog, fuege, personLink } from '../ui.js';
import { aktiveSchueler, anzeigename, datumDeutsch, heuteIso } from '../modell.js';
import {
  LISTEN_ARTEN, listeAnlegen, strichHinzu, strichZurueck, strichSumme, abhakSetzen, abhakErledigt, abhakDatum, abhakFehlend,
  zahlungHinzu, zahlungLoeschen, betragSoll, betragGezahlt, betragRest, betragSummen, sichtbareListen,
} from '../listen.js';
import { zahlLesen } from '../rechnen.js';
import { ansichtRegistrieren } from '../registry.js';
import { personAbschnittRegistrieren } from './person.js';

let aktuelleListe = null;
const euro = (v) => `${(Math.round(v * 100) / 100).toFixed(2).replace('.', ',')} €`;

export async function listeAnlegenDialog(klasse) {
  const name = h('input', { type: 'text', placeholder: 'z. B. Hausaufgaben vergessen' });
  const art = h('select', { 'aria-label': 'Listenart' }, Object.entries(LISTEN_ARTEN).map(([w, t]) => h('option', { value: w }, t)));
  const ok = await inhaltDialog('Neue Liste', [
    h('label', {}, 'Name', name), h('label', {}, 'Art', art),
    h('p', { class: 'klein' }, 'Strichliste: ein Strich je Vorfall. Abhakliste: einmal erledigt ja/nein. Betragsliste: Sollbetrag und Zahlungen.'),
  ], [{ text: 'Abbrechen', wert: false, abbruch: true }, { text: 'Anlegen', wert: true, klasse: 'knopf primaer', vorPruefung: () => name.value.trim() !== '' }]);
  if (!ok) return null;
  const l = listeAnlegen(klasse, name.value.trim(), art.value);
  K.aenderung();
  return l;
}

export function zeigeListen() {
  const d = K.daten;
  const wurzel = h('section', { class: 'seite' });
  const alle = d.listen;
  if (!aktuelleListe || !alle.some((l) => l.id === aktuelleListe)) aktuelleListe = sichtbareListen(d)[0]?.id || alle[0]?.id || null;
  const l = alle.find((x) => x.id === aktuelleListe);
  wurzel.append(
    h('h1', {}, 'Eigene Listen'),
    h('div', { class: 'reiter' },
      alle.map((x) => h('button', { type: 'button', class: `reiter-punkt${x.id === aktuelleListe ? ' aktiv' : ''}`, onclick: () => { aktuelleListe = x.id; K.neuZeichnen(); } }, `${x.name}${x.ausgeblendet ? ' (ausgeblendet)' : ''}`)),
      h('button', { type: 'button', class: 'knopf', id: 'liste-neu', onclick: async () => { const n = await listeAnlegenDialog(d); if (n) { aktuelleListe = n.id; K.neuZeichnen(); } } }, '+ Neue Liste')),
    h('p', { class: 'klein' }, 'Eigene Listen fließen nicht in Noten ein.'),
  );
  if (!l) {
    wurzel.append(h('p', { class: 'hinweis' }, 'Noch keine Liste angelegt.'));
    return { el: wurzel };
  }
  const personen = aktiveSchueler(d);
  wurzel.append(
    h('h2', { class: 'nur-druck' }, `${l.name} · ${LISTEN_ARTEN[l.art]} · ${d.kopf.klasse || ''}`),
    h('div', { class: 'knopfreihe nicht-drucken' },
      h('span', {}, `${LISTEN_ARTEN[l.art]}: `, h('strong', {}, l.name)),
      h('button', { type: 'button', class: 'knopf', onclick: () => window.print() }, 'Drucken / PDF speichern'),
      h('button', { type: 'button', class: 'knopf', onclick: async () => {
        const n = h('input', { type: 'text', value: l.name });
        if (await inhaltDialog('Liste umbenennen', [h('label', {}, 'Name', n)], [{ text: 'Abbrechen', wert: false, abbruch: true }, { text: 'Speichern', wert: true, klasse: 'knopf primaer' }]) && n.value.trim()) { l.name = n.value.trim(); K.aenderung(); K.neuZeichnen(); }
      } }, 'Umbenennen'),
      h('button', { type: 'button', class: 'knopf', onclick: () => { l.ausgeblendet = !l.ausgeblendet; K.aenderung(); K.neuZeichnen(); } }, l.ausgeblendet ? 'Einblenden' : 'Ausblenden'),
      h('button', { type: 'button', class: 'knopf gefahr', onclick: async () => {
        if (!(await bestaetigen('Liste löschen', `Die Liste „${l.name}“ wird mit allen Einträgen gelöscht.`, 'Löschen', true))) return;
        d.listen.splice(d.listen.indexOf(l), 1);
        aktuelleListe = null;
        K.aenderung();
        K.neuZeichnen();
      } }, 'Löschen')),
  );
  if (personen.length === 0) return wurzel.append(h('p', { class: 'hinweis' }, 'Bitte zuerst unter „Grunddaten“ Schüler:innen eintragen.')), { el: wurzel };
  wurzel.append(l.art === 'strich' ? strichAnsicht(d, l, personen) : l.art === 'abhak' ? abhakAnsicht(d, l, personen) : betragAnsicht(d, l, personen));
  return { el: wurzel };
}

function strichAnsicht(d, l, personen) {
  return h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle' },
    h('thead', {}, h('tr', {}, ['Nr.', 'Name', 'Striche', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, personen.map((s, i) => h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links name' }, personLink(s, anzeigename(s))),
      h('td', { class: 'zahl', 'data-summe': s.id }, String(strichSumme(l, s.id))),
      h('td', {}, h('button', { type: 'button', class: 'knopf taste', 'aria-label': `${anzeigename(s)}: Strich`, onclick: () => { strichHinzu(l, s.id, heuteIso()); K.aenderung(); K.neuZeichnen(); } }, '+1'),
        h('button', { type: 'button', class: 'knopf taste', 'aria-label': `${anzeigename(s)}: Strich zurücknehmen`, onclick: () => { if (strichZurueck(l, s.id)) { K.aenderung(); K.neuZeichnen(); } } }, '−1')))))));
}

function abhakAnsicht(d, l, personen) {
  const fehlt = abhakFehlend(l, personen);
  return h('div', {}, h('p', {}, fehlt.length ? `Es fehlt noch bei: ${fehlt.map(anzeigename).join(', ')}` : 'Bei allen erledigt.'),
    h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle' },
      h('thead', {}, h('tr', {}, ['Nr.', 'Name', 'Erledigt', 'am'].map((t) => h('th', {}, t)))),
      h('tbody', {}, personen.map((s, i) => h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links name' }, personLink(s, anzeigename(s))),
        h('td', { class: 'mitte' }, h('input', { type: 'checkbox', 'aria-label': `${anzeigename(s)} erledigt`, checked: abhakErledigt(l, s.id), onchange: (e) => { abhakSetzen(l, s.id, e.target.checked, heuteIso()); K.aenderung(); K.neuZeichnen(); } })),
        h('td', {}, abhakErledigt(l, s.id) ? h('input', { type: 'date', value: abhakDatum(l, s.id), 'aria-label': `${anzeigename(s)} erledigt am`, onchange: (e) => { l.eintraege[s.id][0].datum = e.target.value; K.aenderung(); } }) : '')))))));
}

function betragAnsicht(d, l, personen) {
  const sum = betragSummen(l, personen);
  const sollFeld = h('input', { type: 'text', inputmode: 'decimal', class: 'gewicht', 'aria-label': 'Sollbetrag für alle', value: String(l.soll).replace('.', ','), oninput: (e) => {
    const z = zahlLesen(e.target.value);
    const ok = z !== null && !Number.isNaN(z) && z >= 0;
    e.target.classList.toggle('fehler', !ok);
    if (ok) { l.soll = z; K.aenderung(); }
  }, onchange: () => K.neuZeichnen() });
  return h('div', {},
    h('div', { class: 'formular' }, h('label', {}, 'Sollbetrag je Person in €', sollFeld)),
    h('p', { class: 'summe-zeile' }, `Soll ${euro(sum.soll)} · gezahlt ${euro(sum.gezahlt)} · offen `, h('strong', {}, euro(sum.rest))),
    h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle' },
      h('thead', {}, h('tr', {}, ['Nr.', 'Name', 'Soll', 'Gezahlt', 'Rest', 'Zahlung erfassen', 'Zahlungen'].map((t) => h('th', {}, t)))),
      h('tbody', {}, personen.map((s, i) => {
        const betrag = h('input', { type: 'text', inputmode: 'decimal', class: 'gewicht', placeholder: '0,00', 'aria-label': `${anzeigename(s)}: Betrag` });
        const zahlen = () => {
          const z = zahlLesen(betrag.value);
          if (z === null || Number.isNaN(z) || z === 0) { betrag.classList.add('fehler'); return; }
          zahlungHinzu(l, s.id, z, heuteIso());
          K.aenderung();
          K.neuZeichnen();
        };
        return h('tr', {}, h('td', { class: 'zahl' }, String(i + 1)), h('td', { class: 'links name' }, personLink(s, anzeigename(s))),
          h('td', { class: 'zahl' }, h('input', { type: 'text', inputmode: 'decimal', class: 'gewicht', 'aria-label': `${anzeigename(s)}: Sollbetrag`, value: String(betragSoll(l, s.id)).replace('.', ','), oninput: (e) => {
            const z = zahlLesen(e.target.value);
            if (z === null || Number.isNaN(z) || z < 0) { e.target.classList.add('fehler'); return; }
            e.target.classList.remove('fehler');
            (l.sollJe ||= {})[s.id] = z;
            K.aenderung();
          }, onchange: () => K.neuZeichnen() })),
          h('td', { class: 'zahl' }, euro(betragGezahlt(l, s.id))), h('td', { class: 'zahl', 'data-rest': s.id }, h('strong', {}, euro(betragRest(l, s.id)))),
          h('td', {}, betrag, h('button', { type: 'button', class: 'knopf klein', onclick: zahlen }, 'Zahlung')),
          h('td', { class: 'links' }, (l.eintraege[s.id] || []).map((e) => h('span', { class: 'chip-klein' }, `${datumDeutsch(e.datum)}: ${euro(e.betrag)} `, h('button', { type: 'button', class: 'notiz-symbol', 'aria-label': 'Zahlung löschen', onclick: () => { zahlungLoeschen(l, s.id, e.id); K.aenderung(); K.neuZeichnen(); } }, '✕')))));
      })))));
}

personAbschnittRegistrieren(50, (d, s) => {
  const sichtbar = sichtbareListen(d);
  if (sichtbar.length === 0) return null;
  const text = (l) => {
    if (l.art === 'strich') return `${strichSumme(l, s.id)} Striche`;
    if (l.art === 'abhak') return abhakErledigt(l, s.id) ? `erledigt am ${datumDeutsch(abhakDatum(l, s.id))}` : 'noch nicht erledigt';
    return `Soll ${euro(betragSoll(l, s.id))}, gezahlt ${euro(betragGezahlt(l, s.id))}, Rest ${euro(betragRest(l, s.id))}`;
  };
  return h('div', {}, h('h2', {}, 'Eigene Listen'), h('ul', {}, sichtbar.map((l) => h('li', {}, h('strong', {}, `${l.name}: `), text(l)))));
});

ansichtRegistrieren('listen', { text: 'Listen', bauen: zeigeListen, klasse: true, reihe: 7, nurWenn: () => !!K.daten && sichtbareListen(K.daten).length > 0 });
