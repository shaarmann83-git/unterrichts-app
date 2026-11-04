// Stundenplan aus WebUntis (iCal): Laden, Zuordnung „Klasse + Fach“, Vorschau mit Änderungsliste, Startvorschlag „Jetzt“ (SPEC Abschnitt 10).
import { K } from '../kontext.js';
import { h, leeren, fuege, inhaltDialog, meldung, toast } from '../ui.js';
import { datumDeutsch } from '../modell.js';
import { icalLesen } from '../ical.js';
import { kombinationen, importPlanen, importAnwenden, jetztVorschlag, stundenplanEinstellung } from '../stundenplan.js';
import { dateienAlsBytes } from '../speicher.js';
import { pruefsumme } from '../untis.js';
import { ansichtRegistrieren } from '../registry.js';
import { setzeAktuellenTermin } from './sport-nachstunde.js';

const wochentag = (iso) => ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(`${iso}T12:00:00Z`).getUTCDay()];
const zeitText = (e) => `${wochentag(e.datum)} ${datumDeutsch(e.datum)} ${e.uhrzeit}${e.ende ? '–' + e.ende : ''}`;

function dekodieren(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Zuordnungsdialog: jede Kombination „Klasse + Fach“ einer Klasse zuordnen oder ignorieren. Gibt {schluessel: klasseId|'ignorieren'} oder null. */
export async function zuordnungDialog(buch, kombis, { alleZeigen = false } = {}) {
  const zeigen = alleZeigen ? kombis : kombis.filter((k) => !k.gemerkt);
  const wahl = new Map();
  const zeilen = zeigen.map((k) => {
    const sel = h('select', { 'data-schluessel': k.schluessel, 'aria-label': `Zuordnung ${k.text}` },
      h('option', { value: '', selected: !k.vorschlag }, '(noch nicht zuordnen)'),
      h('option', { value: 'ignorieren', selected: k.vorschlag === 'ignorieren' }, 'ignorieren (immer)'),
      buch.klassen.map((x) => h('option', { value: x.id, selected: k.vorschlag === x.id }, `${x.kopf.klasse || 'Ohne Namen'}${x.fachtyp === 'sport' ? ' (Sport)' : ''}`)));
    wahl.set(k.schluessel, sel);
    return h('tr', {}, h('td', { class: 'links' }, h('strong', {}, k.text), k.location && h('div', { class: 'klein' }, k.location)), h('td', { class: 'zahl' }, String(k.anzahl)), h('td', { class: 'klein' }, k.beispiel), h('td', {}, sel));
  });
  if (zeigen.length === 0) return {};
  const ok = await inhaltDialog('Stundenplan: Zuordnung', [
    h('p', {}, 'Im Stundenplan kommen diese Kombinationen aus Klasse und Fach vor. Ordnen Sie jede einer Klasse im Notenbuch zu oder ignorieren Sie sie (z. B. Aufsichten). Die Zuordnung wird gemerkt und beim nächsten Import vorgeschlagen.'),
    h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle' }, h('thead', {}, h('tr', {}, ['Eintrag im Stundenplan', 'Anzahl', 'Beispiel', 'Klasse im Notenbuch'].map((t) => h('th', {}, t)))), h('tbody', {}, zeilen))),
  ], [{ text: 'Abbrechen', wert: false, abbruch: true }, { text: 'Weiter', wert: true, klasse: 'knopf primaer' }]);
  if (!ok) return null;
  const ergebnis = {};
  for (const [s, sel] of wahl) if (sel.value) ergebnis[s] = sel.value;
  return ergebnis;
}

function liste(titel, eintraege, text) {
  if (!eintraege.length) return null;
  return h('details', { open: eintraege.length <= 6 }, h('summary', {}, `${titel}: ${eintraege.length}`), h('ul', { class: 'liste-kurz' }, eintraege.slice(0, 40).map((e) => h('li', {}, text(e))), eintraege.length > 40 && h('li', {}, `… und ${eintraege.length - 40} weitere`)));
}

/** Vorschau mit Änderungsliste; gibt true zurück, wenn übernommen werden soll. */
async function vorschau(plan) {
  const inhalt = h('div', { class: 'untis-vorschau' });
  for (const res of plan.klassen) {
    const sec = h('section', { class: 'untis-klasse' }, h('h3', {}, `${res.klasse.kopf.klasse || 'Klasse'}${res.klasse.fachtyp === 'sport' ? ' (Sport)' : ''}`));
    const sport = res.klasse.fachtyp === 'sport';
    fuege(sec,
      h('p', {}, `${sport ? 'Neue Termine' : 'Neue Einträge'}: ${res.neu.length} · geändert ${res.geaendert.length} · entfallen ${res.entfallen.length} · ausgefallen ${res.ausgefallen.length}`),
      liste(sport ? 'Neu (Termine werden angelegt)' : 'Neu (Vorschläge)', res.neu, (e) => `${zeitText(e)}${e.stunden > 1 ? ` (${e.stunden} Stunden zusammengefasst)` : ''}`),
      liste('Geändert', res.geaendert, (x) => `${zeitText(x.vorher)} → ${zeitText(x.nachher)}`),
      liste('Entfallen', res.entfallen, (e) => zeitText(e)),
      liste('Ausgefallen (zählt nirgends)', res.ausgefallen, (e) => zeitText(e)),
      liste('Übersprungen', res.uebersprungen, (x) => `${zeitText(x.eintrag)}: ${x.grund}`),
      res.abweichungen.length > 0 && h('div', { class: 'warnung' }, `${res.abweichungen.length} Abweichung(en) bei Terminen mit Einträgen. Diese Termine bleiben unverändert:`, h('ul', { class: 'liste-kurz' }, res.abweichungen.map((a) => h('li', { class: 'abweichung' }, `${datumDeutsch(a.termin.datum)}${a.termin.uhrzeit ? ' ' + a.termin.uhrzeit : ''}: ${a.text}`)))));
    inhalt.append(sec);
  }
  if (plan.nichtZugeordnet.length) inhalt.append(h('p', { class: 'klein' }, `Nicht zugeordnet (ignoriert): ${plan.nichtZugeordnet.join(', ')}`));
  if (!plan.klassen.length) inhalt.append(h('p', { class: 'hinweis' }, 'Keine Klasse zugeordnet. Es wird nichts übernommen.'));
  return inhaltDialog('Stundenplan: Vorschau', [h('p', { class: 'klein' }, 'Nichts wird ohne Bestätigung übernommen. Von Hand angelegte Termine und Termine mit Einträgen werden nie verändert.'), inhalt], [
    { text: 'Abbrechen', wert: false, abbruch: true },
    plan.klassen.length > 0 && { text: 'Übernehmen', wert: true, klasse: 'knopf primaer' },
  ].filter(Boolean));
}

/**
 * Stundenplan abgleichen. `dateien`: [{bytes|text, name}]. `automatisch`: nur mit gemerkter Zuordnung, ohne Rückfrage.
 * Gibt true zurück, wenn übernommen wurde.
 */
export async function icsAbgleichStarten(dateien, { automatisch = false, jetzt = Date.now() } = {}) {
  if (!K.buch) return false;
  let ereignisse = [];
  try {
    for (const d of dateien) ereignisse.push(...icalLesen(typeof d.text === 'string' ? d.text : dekodieren(d.bytes ?? d.text)));
  } catch (e) {
    await meldung('Stundenplan nicht lesbar', e.message);
    return false;
  }
  if (ereignisse.length === 0) {
    if (!automatisch) await meldung('Keine Termine gefunden', 'In der Datei wurden keine Unterrichtstermine gefunden. Ist es ein iCal-Kalender (.ics) aus WebUntis?');
    return false;
  }
  const kombis = kombinationen(K.buch, ereignisse);
  const einst = stundenplanEinstellung(K.buch);
  let zuordnung = {};
  for (const k of kombis) if (k.gemerkt) zuordnung[k.schluessel] = k.vorschlag;
  if (!automatisch) {
    const neu = await zuordnungDialog(K.buch, kombis);
    if (neu === null) return false;
    zuordnung = { ...zuordnung, ...neu };
  }
  const plan = importPlanen(K.buch, ereignisse, zuordnung, jetzt);
  const veraendert = plan.klassen.some((r) => r.aktionen.length > 0);
  if (automatisch) {
    if (!veraendert) return true;
  } else if (!(await vorschau(plan))) return false;
  importAnwenden(K.buch, plan, zuordnung);
  K.aenderung();
  K.neuZeichnen();
  const zahl = plan.klassen.reduce((n, r) => ({ neu: n.neu + r.neu.length, geaendert: n.geaendert + r.geaendert.length, entfallen: n.entfallen + r.entfallen.length }), { neu: 0, geaendert: 0, entfallen: 0 });
  toast(`Stundenplan übernommen: ${zahl.neu} neu, ${zahl.geaendert} geändert, ${zahl.entfallen} entfallen.${plan.nichtZugeordnet.length ? ` Nicht zugeordnet: ${plan.nichtZugeordnet.length}.` : ''}`);
  return true;
}

export async function stundenplanLaden() {
  const dateien = await dateienAlsBytes('.ics,text/calendar');
  if (dateien.length === 0) return false;
  return icsAbgleichStarten(dateien.map((d) => ({ bytes: d.text, name: d.name })));
}

// ---------- Startvorschlag „Jetzt“ ----------

/** Hinweisleiste „Jetzt: WAK 1 Sport – Einheit erfassen“ oder null. */
export function jetztLeiste(jetzt = Date.now()) {
  if (!K.buch) return null;
  const v = jetztVorschlag(K.buch, jetzt);
  if (!v) return null;
  const sport = v.klasse.fachtyp === 'sport';
  return h('div', { class: 'jetzt-leiste', id: 'jetzt-leiste', role: 'status' },
    h('strong', {}, v.text),
    h('span', { class: 'klein' }, v.laeuft ? ` (läuft bis ${v.eintrag.ende || '?'} Uhr)` : ` (beginnt um ${v.eintrag.uhrzeit} Uhr, in ${v.inMinuten} Minuten)`),
    h('button', { type: 'button', class: 'knopf primaer', id: 'jetzt-los', onclick: () => {
      K.klasseId = v.klasse.id;
      if (sport) { if (v.terminId) setzeAktuellenTermin(v.terminId); K.navigiere('nachstunde'); } else K.navigiere('sl');
      K.neuZeichnen();
    } }, sport ? 'Einheit erfassen' : 'Stunde notieren'));
}

// ---------- Ansicht „Stundenplan“ ----------

export function zeigeStundenplan() {
  const wurzel = h('section', { class: 'seite' });
  const e = stundenplanEinstellung(K.buch);
  const heute = new Date().toISOString().slice(0, 10);
  const tabellen = K.buch.klassen.filter((k) => (k.stundenplan || []).length).map((k) => {
    const naechste = k.stundenplan.filter((x) => x.datum >= heute).sort((a, b) => a.startMs - b.startMs).slice(0, 8);
    return h('div', {}, h('h2', {}, `${k.kopf.klasse || 'Klasse'}${k.fachtyp === 'sport' ? ' (Sport)' : ''}`),
      h('p', { class: 'klein' }, `${k.stundenplan.length} Einträge, davon ${k.stundenplan.filter((x) => x.status === 'ausgefallen').length} ausgefallen.`),
      naechste.length ? h('ul', {}, naechste.map((x) => h('li', {}, `${zeitText(x)}${x.status === 'ausgefallen' ? ' (ausgefallen)' : ''}${x.stunden > 1 ? ` · ${x.stunden} Stunden` : ''}`))) : h('p', { class: 'hinweis' }, 'Keine kommenden Einträge.'));
  });
  const zuordnungen = Object.entries(e.zuordnung);
  fuege(wurzel, h('h1', {}, 'Stundenplan'),
    h('p', {}, 'Laden Sie die iCal-Datei (.ics) aus dem WebUntis-Kalenderabo. Sie enthält nur Ihren Stundenplan, keine Schülerdaten. Aus den Terminen entstehen bei Sport-Klassen Termine, bei Lernfeld-Klassen Vorschläge.'),
    h('div', { class: 'knopfreihe' },
      h('button', { type: 'button', class: 'knopf primaer gross', id: 'stundenplan-laden', onclick: async () => { await stundenplanLaden(); } }, 'Stundenplan laden (.ics)'),
      zuordnungen.length > 0 && h('button', { type: 'button', class: 'knopf', id: 'zuordnung-loeschen', onclick: () => { e.zuordnung = {}; K.aenderung(); K.neuZeichnen(); toast('Gemerkte Zuordnungen gelöscht.'); } }, 'Gemerkte Zuordnungen löschen')),
    h('p', { class: 'klein' }, 'Weitere Wege: Datei in die App ziehen (PC), Teilen-Menü (Android), überwachter Ordner oder OneDrive-Eingang (Einstellungen). Eine automatische Abfrage der Abo-Adresse gibt es bewusst nicht.'),
    e.letzterImport && h('p', { class: 'klein' }, `Letzter Import: ${new Date(e.letzterImport).toLocaleString('de-DE')}`),
    zuordnungen.length > 0 && h('details', {}, h('summary', {}, `Gemerkte Zuordnungen: ${zuordnungen.length}`), h('ul', { class: 'liste-kurz' }, zuordnungen.map(([s, z]) => h('li', {}, `${s} → ${z === 'ignorieren' ? 'ignorieren' : K.buch.klassen.find((k) => k.id === z)?.kopf.klasse || '(Klasse gelöscht)'}`)))),
    tabellen.length ? tabellen : h('p', { class: 'hinweis' }, 'Noch kein Stundenplan importiert.'));
  return { el: wurzel };
}

ansichtRegistrieren('stundenplan', { text: 'Stundenplan', bauen: zeigeStundenplan, klasse: false, reihe: 11.2 });
