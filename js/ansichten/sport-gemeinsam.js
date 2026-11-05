// Gemeinsame Hilfen der Sport-Ansichten (SPEC Abschnitt 9).
import { K } from '../kontext.js';
import { h, inhaltDialog, bestaetigen, fuege } from '../ui.js';
import { aktiveSchueler, neueId, heuteIso, datumDeutsch } from '../modell.js';
import { einstellungenAus, ZEICHEN, termineGeordnet, istPruefungstag } from '../sport.js';

export const sportKlasse = () => !!K.daten && K.daten.fachtyp === 'sport';

export function sportKontext() {
  const d = K.daten;
  return { d, ein: einstellungenAus(K.buch), personen: aktiveSchueler(d), reihen: d.sport.reihen };
}

export const reiheById = (d, id) => d.sport.reihen.find((r) => r.id === id) || null;

/** Kurzes Datum „TT.MM.“ */
export function datumKurz(iso) {
  const m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}.${m[1]}.` : iso || '';
}

/** Farbklasse für ein Anwesenheitszeichen (SPEC 9.2): U/ku rot; sps ab 2. Mal orange; offen violett; entschuldigt/leer grau. */
export function zeichenFarbe(z, spsNr = 0) {
  if (!z) return 'z-grau';
  if (z === 'U' || z === 'ku') return 'z-rot';
  if (z === 'sps') return spsNr >= 2 ? 'z-orange' : 'z-normal';
  if (z === 'k' || z === '|') return 'z-violett';
  if (['E', 'A', 'B', 'P', 'ke', 'ka'].includes(z)) return 'z-grau';
  return 'z-normal';
}

/** Farbklasse für Mitarbeit 0–3: 3 grün, 1 blau, 0 rot. */
export function mitarbeitFarbe(wert, grund = '') {
  if (wert === null || wert === undefined) return 'z-grau';
  if (wert === 0) return 'z-rot';
  if (wert === 3) return 'm-gruen';
  if (wert === 1) return 'm-blau';
  return grund === 'standard' ? 'z-leise' : 'z-normal';
}

export function zelleSetzen(d, terminId, schuelerId, wert) {
  const a = (d.sport.anwesenheit[terminId] ||= {});
  if (!wert || !wert.z) delete a[schuelerId];
  else a[schuelerId] = { ...wert, quelle: 'hand' };
  K.aenderung();
}

/** Zeichen-Palette (Tippen auf eine Zelle): große Tasten, Verspätung mit Minuten, Vermerk. */
export function zeichenPalette(d, termin, person, aktuell = {}, zeichenListe = Object.keys(ZEICHEN)) {
  const min = h('input', { type: 'text', inputmode: 'numeric', class: 'gewicht', 'aria-label': 'Minuten', value: aktuell.min ? String(aktuell.min) : '', placeholder: 'Min.' });
  const text = h('input', { type: 'text', 'aria-label': 'Vermerk', value: aktuell.text || '', placeholder: 'Vermerk (optional)' });
  const stern = h('input', { type: 'checkbox', 'aria-label': 'Verweis auf Vermerk', checked: !!aktuell.stern });
  return inhaltDialog(`${person.vorname} ${person.name} · ${datumDeutsch(termin.datum)}`, (schliessen) => {
    const taste = (z) => h('button', { type: 'button', class: `knopf zeichen-taste ${zeichenFarbe(z)}`, 'data-zeichen': z, 'aria-label': `${z}: ${ZEICHEN[z].text}`, onclick: () => schliessen({ z, min: z === 'V' ? Number(min.value) || 0 : undefined, stern: stern.checked, text: text.value.trim() }) }, h('strong', {}, z), h('span', { class: 'klein' }, ZEICHEN[z].text));
    return [
      h('div', { class: 'zeichen-raster' }, zeichenListe.map(taste)),
      h('label', { class: 'inline' }, 'Verspätung (nur bei V): ', min, ' Minuten'),
      h('label', { class: 'schalter' }, stern, ' * Verweis auf einen Vermerk'),
      h('label', {}, 'Vermerk', text),
    ];
  }, [
    { text: 'Abbrechen', wert: null, abbruch: true },
    { text: 'Zelle leeren', wert: { z: '' } },
  ]);
}

/** Termin anlegen oder bearbeiten. Gibt den Termin zurück (neu oder geändert), `{loeschen:true}` oder null. */
export async function terminDialog(d, termin = null, vorgabe = {}) {
  const sp = d.sport;
  const letzter = termineGeordnet(d).at(-1);
  const datum = h('input', { type: 'date', value: termin?.datum ?? vorgabe.datum ?? heuteIso(), id: 'termin-datum' });
  const uhrzeit = h('input', { type: 'time', value: termin?.uhrzeit || '', 'aria-label': 'Uhrzeit' });
  const reihe = h('select', { id: 'termin-reihe', 'aria-label': 'Reihe' },
    h('option', { value: '' }, 'keiner Reihe zugeordnet'),
    sp.reihen.map((r) => h('option', { value: r.id, selected: (termin ? termin.reihe : vorgabe.reihe ?? letzter?.reihe ?? sp.reihen.at(-1)?.id ?? '') === r.id }, r.name || 'ohne Namen')));
  const pruef = h('input', { type: 'checkbox', id: 'termin-pruefung', checked: !!termin?.pruefungstag });
  const vermerk = h('input', { type: 'text', id: 'termin-vermerk', value: termin?.vermerk || '', placeholder: 'z. B. T für Prüfungstag' });
  const hj = h('select', { id: 'termin-halbjahr', 'aria-label': 'Halbjahr' }, [1, 2].map((n) => h('option', { value: n, selected: (termin?.halbjahr || 1) === n }, `Halbjahr ${n}`)));
  const felder = [
    h('label', {}, 'Datum', datum),
    h('label', {}, 'Uhrzeit (optional)', uhrzeit),
    h('label', {}, 'Reihe', reihe),
    h('label', { class: 'schalter' }, pruef, ' Prüfungstag'),
    h('label', {}, 'Vermerk', vermerk),
    sp.zeitraum === 'jahr' && h('label', {}, 'Halbjahr', hj),
  ];
  const knoepfe = [
    { text: 'Abbrechen', wert: false, abbruch: true },
    termin && { text: 'Termin löschen', wert: 'loeschen', klasse: 'knopf gefahr' },
    { text: 'Speichern', wert: true, klasse: 'knopf primaer' },
  ].filter(Boolean);
  const ok = await inhaltDialog(termin ? 'Termin bearbeiten' : 'Neuer Termin', felder.filter(Boolean), knoepfe);
  if (ok === 'loeschen') {
    if (!(await bestaetigen('Termin löschen', 'Der Termin wird mit allen Anwesenheitszeichen, Mitarbeitswerten und Merkmalen gelöscht.', 'Löschen', true))) return null;
    sp.termine.splice(sp.termine.indexOf(termin), 1);
    delete sp.anwesenheit[termin.id];
    delete sp.mitarbeit[termin.id];
    delete sp.merkmale[termin.id];
    K.aenderung();
    return { loeschen: true };
  }
  if (!ok) return null;
  const rId = reihe.value;
  const reiheObj = reiheById(d, rId);
  const t = termin || { id: neueId(), uid: '', quelle: 'hand' };
  Object.assign(t, {
    datum: datum.value,
    uhrzeit: uhrzeit.value,
    reihe: rId,
    pruefungstag: pruef.checked,
    vermerk: vermerk.value.trim(),
    halbjahr: sp.zeitraum === 'jahr' ? Number(hj.value) || reiheObj?.halbjahr || 1 : 1,
  });
  if (sp.zeitraum === 'jahr' && !felder[5]) t.halbjahr = reiheObj?.halbjahr || 1;
  if (!termin) sp.termine.push(t);
  K.aenderung();
  return t;
}

/** Hilfe zur Anzeige einer Note im Notensystem der Klasse. */
export { istPruefungstag, fuege };
