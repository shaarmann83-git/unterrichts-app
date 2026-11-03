// Gesamtnote Sport (SPEC 9.5, 9.6) und Sport-Einstellungen (SPEC 9.6a).
import { K } from '../kontext.js';
import { h, leeren, fuege, bestaetigen, inhaltDialog, meldung, toast, avatar } from '../ui.js';
import { anzeigename, datumDeutsch, sportStandard } from '../modell.js';
import { gesamtSport, endnotenKlasse, einstellungenAus, punkte, aenderungenZaehlen, rundeNote } from '../sport.js';
import { fehlzeitenSummen } from '../fehlzeiten.js';
import { zahlLesen } from '../rechnen.js';
import { herunterladen } from '../speicher.js';
import { sportXlsx } from '../sport-excel.js';
import { ansichtRegistrieren } from '../registry.js';
import { sportKlasse, sportKontext } from './sport-gemeinsam.js';

const f2 = (x) => (x === null || x === undefined ? '' : String(Math.round(x * 100) / 100).replace('.', ','));
let halbjahrAnzeige = 'jahr';

export function zeigeSportGesamt() {
  const { d, ein, personen } = sportKontext();
  const wurzel = h('section', { class: 'seite' });
  const punkteAn = d.sport.notensystem === 'punkte';
  const jahr = d.sport.zeitraum === 'jahr';
  if (!jahr) halbjahrAnzeige = 'jahr';
  const optionen = { halbjahr: jahr ? halbjahrAnzeige : 'jahr' };
  const { ergebnis, variante, durchschnittWert, durchschnittNote } = endnotenKlasse(d, personen, ein, optionen);
  const reihen = jahr && halbjahrAnzeige !== 'jahr' ? d.sport.reihen.filter((r) => (r.halbjahr || 1) === halbjahrAnzeige) : d.sport.reihen;

  const kopf = ['Nr.', 'Name', ...reihen.flatMap((r) => [`${r.name || 'Reihe'} Wert`, 'Note']), 'Ø Wert', 'Ø Note', ...(jahr && halbjahrAnzeige === 'jahr' ? ['HJ 1', 'HJ 2'] : []), 'Endnote', ...(punkteAn ? ['Vorschlag (Punkte)'] : []), 'sps', 'offen', 'Fehlstd.'];
  const tbody = h('tbody');
  personen.forEach((p, i) => {
    const e = ergebnis.get(p.id);
    const g = e.gesamt;
    const reihenErg = reihen.map((r) => g.reihen.find((x) => x.reihe.id === r.id)?.erg || null);
    const fest = e.festgesetzt;
    const fz = fehlzeitenSummen(d, p.id);
    tbody.append(h('tr', { 'data-person': p.id },
      h('td', { class: 'zahl' }, String(i + 1)),
      h('td', { class: 'links name' }, avatar(d, p), ' ', h('a', { href: `#/person/${p.id}` }, anzeigename(p))),
      reihenErg.flatMap((x) => [h('td', { class: 'zahl' }, x ? f2(x.wert) : ''), h('td', { class: `mitte ${x?.pruefung.status === 'auto6' ? 'z-rot' : ''}` }, x?.note ?? '')]),
      h('td', { class: 'zahl', 'data-feld': 'owert' }, f2(g.oWert)),
      h('td', { class: 'zahl', 'data-feld': 'onote' }, f2(g.oNote)),
      jahr && halbjahrAnzeige === 'jahr' && [0, 1].map((k) => h('td', { class: 'zahl' }, f2(g.halbjahre?.[k]?.oWert))),
      h('td', { class: `mitte endnote ${fest ? 'festgesetzt' : ''}`, 'data-feld': 'endnote', title: fest ? `festgesetzt: ${fest.begruendung}` : 'berechnet' },
        e.endnote === null || e.endnote === undefined ? '' : h('strong', {}, punkteAn ? `${e.endnote}` : String(e.endnote)), h('div', { class: 'klein' }, fest ? 'festgesetzt' : e.endnote ? 'berechnet' : '')),
      punkteAn && h('td', { class: 'zahl' }, g.oWert === null ? '' : String(punkte(g.oWert, ein))),
      h('td', { class: `zahl ${g.sps >= 2 ? 'z-orange' : ''}` }, String(g.sps)),
      h('td', { class: `zahl ${g.offen ? 'z-violett' : ''}` }, String(g.offen)),
      h('td', { class: 'zahl' }, String(fz.gesamt)),
      h('td', {}, h('button', { type: 'button', class: 'knopf klein', 'aria-label': `Endnote festsetzen ${anzeigename(p)}`, onclick: async () => {
        const w = h('input', { type: 'text', inputmode: 'decimal', value: fest ? String(fest.wert).replace('.', ',') : '', 'aria-label': 'Endnote' });
        const b = h('input', { type: 'text', value: fest?.begruendung || '', 'aria-label': 'Begründung' });
        const ok = await inhaltDialog(`Endnote festsetzen: ${anzeigename(p)}`, [
          h('p', { class: 'klein' }, `Berechnet: ${e.berechnet ?? '–'}. Leer lassen und speichern, um die Festsetzung zu entfernen.`),
          h('label', {}, 'Endnote (1 bis 6)', w), h('label', {}, 'Begründung (Pflicht)', b)], [
          { text: 'Abbrechen', wert: false, abbruch: true },
          { text: 'Speichern', wert: true, klasse: 'knopf primaer', vorPruefung: () => {
            if (w.value.trim() === '') return true;
            const z = zahlLesen(w.value);
            const ok = z !== null && !Number.isNaN(z) && z >= 1 && z <= 6 && b.value.trim() !== '';
            b.classList.toggle('fehler', b.value.trim() === '');
            w.classList.toggle('fehler', z === null || Number.isNaN(z) || z < 1 || z > 6);
            return ok;
          } },
        ]);
        if (!ok) return;
        if (w.value.trim() === '') delete d.sport.endnoten[p.id];
        else d.sport.endnoten[p.id] = { wert: zahlLesen(w.value), begruendung: b.value.trim() };
        K.aenderung();
        K.neuZeichnen();
      } }, 'festsetzen'))));
  });
  const varianteText = { wert: 'Ø Wert', note: 'Ø Note' }[variante];
  fuege(wurzel, h('h1', {}, 'Gesamtnote Sport'),
    h('div', { class: 'knopfreihe' },
      jahr && h('label', { class: 'inline' }, 'Anzeige: ', h('select', { id: 'gesamt-hj', 'aria-label': 'Halbjahr', onchange: (e) => { halbjahrAnzeige = e.target.value === 'jahr' ? 'jahr' : Number(e.target.value); K.neuZeichnen(); } },
        [['jahr', 'Schuljahr'], [1, 'Halbjahr 1'], [2, 'Halbjahr 2']].map(([w, t]) => h('option', { value: w, selected: String(halbjahrAnzeige) === String(w) }, t)))),
      h('button', { type: 'button', class: 'knopf', id: 'sport-excel', onclick: () => herunterladen(sportXlsx(d, ein), `${(d.kopf.klasse || 'Sport').replace(/[^\wäöüÄÖÜß-]+/g, '-')}_Sport.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') }, 'Export als .xlsx'),
      h('a', { class: 'knopf', href: '#/druck' }, 'Druck / Notenliste')),
    h('p', { class: 'klein', id: 'variante-info' }, `Endnote aus: ${varianteText}${d.sport.endnoteVariante === 'besser' ? ' (die für die Klasse insgesamt bessere Variante)' : ' (fest eingestellt)'}. Klassendurchschnitt der gerundeten Endnoten: Ø Wert ${f2(durchschnittWert)}, Ø Note ${f2(durchschnittNote)}. Rundung: halbe Werte zur besseren Note.`),
    personen.length === 0 ? h('p', { class: 'hinweis' }, 'Bitte zuerst unter „Grunddaten“ Schüler:innen eintragen.') :
    h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle sport-gesamt' }, h('thead', {}, h('tr', {}, kopf.map((t) => h('th', {}, t)), h('th', {}, ''))), tbody)),
    h('p', { class: 'klein' }, 'Keine Prozentwerte in dieser Übersicht: Prozent gibt es nur intern bei der Prüfung. Endnote manuell festsetzen verlangt eine Begründung.'));
  return { el: wurzel };
}

// ---------- Sport-Einstellungen (9.6a) ----------

const BESCHREIBUNG = {
  pruefschluessel: 'Prüfungsschlüssel (ab x % → Note 1, 2, 3, 4, 5)',
  mitarbeitsTabelle: 'Mitarbeitstabelle (ab Ø → Grundnote 1, 2, 3, 4, 5)',
  standardwert: 'Standardwert Beteiligung',
  mindestTermine: 'Mindestzahl zählender Termine',
  schritt: 'Schrittweite je Aufwertungsmerkmal',
  offenZaehltNull: 'Offene Einträge (k, Strich)',
  punkte: 'Punkte-Umrechnung',
  pruefungstagKennzeichen: 'Kennzeichen Prüfungstag',
};

function unterschiede(alt, neu) {
  const diff = [];
  for (const k of Object.keys(BESCHREIBUNG)) {
    if (JSON.stringify(alt[k]) !== JSON.stringify(neu[k])) diff.push({ feld: k, vorher: alt[k], nachher: neu[k] });
  }
  return diff;
}

const kurz = (x) => (Array.isArray(x) ? x.join(' / ') : typeof x === 'object' && x ? `${x.basis} − ${x.faktor} × Note (${x.min}–${x.max})` : typeof x === 'boolean' ? (x ? 'zählt als 0' : 'zählt nicht') : String(Math.round(x * 10000) / 10000).replace('.', ','));

export function zeigeSportEinstellungen() {
  const wurzel = h('section', { class: 'seite' });
  const aktuell = einstellungenAus(K.buch);
  const entwurf = JSON.parse(JSON.stringify(aktuell));
  entwurf.protokoll = undefined;
  const zahlenReihe = (schluessel, label, n) => h('div', { class: 'formular' }, Array.from({ length: n }, (_, i) => h('label', {}, `${i + 1}`, h('input', { type: 'text', inputmode: 'decimal', class: 'gewicht', 'data-schluessel': `${schluessel}-${i}`, 'aria-label': `${label} ${i + 1}`, value: String(entwurf[schluessel][i]).replace('.', ','),
    oninput: (e) => { const z = zahlLesen(e.target.value); const ok = z !== null && !Number.isNaN(z) && z >= 0; e.target.classList.toggle('fehler', !ok); if (ok) entwurf[schluessel][i] = z; } }))));
  const einzel = (schluessel, label, opt = {}) => h('label', {}, label, h('input', { type: 'text', inputmode: 'decimal', class: 'gewicht', 'data-schluessel': schluessel, 'aria-label': label, value: String(Math.round(entwurf[schluessel] * 10000) / 10000).replace('.', ','),
    oninput: (e) => { const z = zahlLesen(e.target.value); const ok = z !== null && !Number.isNaN(z) && z >= (opt.min ?? 0); e.target.classList.toggle('fehler', !ok); if (ok) entwurf[schluessel] = z; } }));
  const schrittWahl = h('select', { id: 'schritt-wahl', 'aria-label': 'Schrittweite', onchange: (e) => { entwurf.schritt = e.target.value === 'drittel' ? 1 / 3 : e.target.value === 'viertel' ? 0.25 : 0.5; } },
    [['drittel', '1/3 Note (Standard)'], ['viertel', '1/4 Note'], ['halb', '1/2 Note']].map(([w, t]) => h('option', { value: w, selected: Math.abs(entwurf.schritt - { drittel: 1 / 3, viertel: 0.25, halb: 0.5 }[w]) < 1e-9 }, t)));
  const offen = h('select', { id: 'offen-wahl', 'aria-label': 'Offene Einträge', onchange: (e) => { entwurf.offenZaehltNull = e.target.value === 'null'; } },
    [['null', 'zählt als 0 (Standard)'], ['nicht', 'zählt nicht']].map(([w, t]) => h('option', { value: w, selected: (w === 'null') === entwurf.offenZaehltNull }, t)));
  const kennz = h('input', { type: 'text', id: 'kennzeichen', 'aria-label': 'Kennzeichen Prüfungstag', value: entwurf.pruefungstagKennzeichen.join(', '), oninput: (e) => { entwurf.pruefungstagKennzeichen = e.target.value.split(/[,\s]+/).filter(Boolean); } });
  const pu = ['basis', 'faktor', 'min', 'max'].map((k) => h('label', {}, { basis: 'Basis', faktor: 'Faktor', min: 'Minimum', max: 'Maximum' }[k], h('input', { type: 'text', inputmode: 'decimal', class: 'gewicht', 'data-schluessel': `punkte-${k}`, 'aria-label': `Punkte ${k}`, value: String(entwurf.punkte[k]).replace('.', ','), oninput: (e) => { const z = zahlLesen(e.target.value); const ok = z !== null && !Number.isNaN(z); e.target.classList.toggle('fehler', !ok); if (ok) entwurf.punkte[k] = z; } })));

  async function uebernehmen() {
    entwurf.mindestTermine = Math.max(0, Math.round(entwurf.mindestTermine));
    const diff = unterschiede(aktuell, entwurf);
    if (diff.length === 0) { toast('Keine Änderung.'); return; }
    const neu = { ...aktuell, ...entwurf, protokoll: aktuell.protokoll };
    const z = aenderungenZaehlen(K.buch, aktuell, neu);
    const text = [h('p', {}, 'Folgendes wird geändert:'), h('ul', {}, diff.map((x) => h('li', {}, `${BESCHREIBUNG[x.feld]}: ${kurz(x.vorher)} → ${kurz(x.nachher)}`))),
      h('p', {}, `Die Änderung gilt sofort für alle Reihen aller Sport-Klassen dieses Notenbuchs. ${z.geaendert} Reihennote(n) würden sich ändern.`),
      z.mitWerten > 0 && h('p', { class: 'warnung' }, `Achtung: In ${z.mitWerten} Fall/Fällen stehen schon Prüfungswerte. Die Änderung wird mit Datum protokolliert.`)];
    const ok = await inhaltDialog('Sport-Einstellungen ändern', text, [
      { text: 'Abbrechen', wert: false, abbruch: true },
      { text: 'Änderung übernehmen', wert: true, klasse: 'knopf primaer' },
    ]);
    if (!ok) return;
    const ziel = K.buch.einstellungen.sport;
    for (const x of diff) ziel[x.feld] = x.nachher;
    ziel.protokoll = [...(ziel.protokoll || []), { zeit: new Date().toISOString(), was: diff.map((x) => `${BESCHREIBUNG[x.feld]}: ${kurz(x.vorher)} → ${kurz(x.nachher)}`).join('; '), geaenderteNoten: z.geaendert, mitWerten: z.mitWerten }];
    K.aenderung();
    K.neuZeichnen();
    toast('Sport-Einstellungen geändert und protokolliert.');
  }

  fuege(wurzel, h('h1', {}, 'Sport-Einstellungen'),
    h('p', { class: 'klein' }, 'Diese Einstellungen gelten für alle Sport-Klassen dieses Notenbuchs, damit in allen Sportarten derselbe Maßstab gilt. Änderungen wirken sofort auf alle Reihen und werden mit Datum protokolliert.'),
    h('div', { class: 'einstellung-block' }, h('h2', {}, BESCHREIBUNG.pruefschluessel), zahlenReihe('pruefschluessel', 'Prozent', 5), h('p', { class: 'klein' }, 'Standard 83/58/40/25/10 % (abgestimmt auf die 0–3-Skala).')),
    h('div', { class: 'einstellung-block' }, h('h2', {}, BESCHREIBUNG.mitarbeitsTabelle), zahlenReihe('mitarbeitsTabelle', 'Ø', 5), h('p', { class: 'klein' }, 'Standard 2,8 / 2,4 / 1,7 / 1,0 / 0,4.')),
    h('div', { class: 'einstellung-block formular' }, einzel('standardwert', 'Standardwert Beteiligung'), einzel('mindestTermine', 'Mindestzahl zählender Termine'), h('label', {}, 'Schrittweite je Merkmal', schrittWahl), h('label', {}, 'Offene Einträge (k, Strich)', offen), h('label', {}, 'Kennzeichen Prüfungstag (Komma getrennt)', kennz)),
    h('div', { class: 'einstellung-block' }, h('h2', {}, BESCHREIBUNG.punkte), h('div', { class: 'formular' }, pu), h('p', { class: 'klein' }, 'Punkte = Basis − Faktor × Note, kaufmännisch gerundet, begrenzt auf Minimum bis Maximum (Standard 17 − 3 × Note, 0 bis 15). Die Ausgabe in Punkten wählen Sie je Klasse in den Grunddaten.')),
    h('div', { class: 'knopfreihe' }, h('button', { type: 'button', class: 'knopf primaer', id: 'sport-einst-uebernehmen', onclick: uebernehmen }, 'Änderungen übernehmen'), h('button', { type: 'button', class: 'knopf', onclick: () => K.neuZeichnen() }, 'Zurücksetzen'),
      h('button', { type: 'button', class: 'knopf', id: 'sport-standard', onclick: () => { const s = sportStandard(); for (const k of Object.keys(BESCHREIBUNG)) entwurf[k] = JSON.parse(JSON.stringify(s[k])); uebernehmen(); } }, 'Auf Standard zurücksetzen')),
    h('h2', {}, 'Protokoll der Änderungen'),
    (aktuell.protokoll || []).length === 0 ? h('p', { class: 'hinweis' }, 'Noch keine Änderungen.') :
      h('ul', { id: 'sport-protokoll' }, [...aktuell.protokoll].reverse().map((p) => h('li', {}, `${new Date(p.zeit).toLocaleString('de-DE')}: ${p.was} (${p.geaenderteNoten} Reihennote(n) betroffen)`))));
  return { el: wurzel };
}

ansichtRegistrieren('sportgesamt', { text: 'Gesamtnote Sport', bauen: zeigeSportGesamt, klasse: true, nurWenn: sportKlasse, reihe: 8 });
ansichtRegistrieren('sporteinstellungen', { text: 'Sport-Einstellungen', bauen: zeigeSportEinstellungen, klasse: false, ohneBuch: false, reihe: 11.5, nurWenn: () => !!K.buch && K.buch.klassen.some((k) => k.fachtyp === 'sport') });
