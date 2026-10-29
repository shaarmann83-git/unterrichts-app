// Untis-Abgleich mit Vorschau (SPEC 8.6): Dateien lesen, Klassen und Fächer wählen, Personen zuordnen, Änderungen zeigen, Teilnahme vorschlagen.
import { K } from '../kontext.js';
import { h, leeren, inhaltDialog, meldung, spaltenDialog, toast, fuege } from '../ui.js';
import { dateiLesen, abgleichAnwenden } from '../untis-eingang.js';
import { pruefsumme, aufKlassenVerteilen, importPlanen, untisFaecher, untisKlassen, zeilenMitZuordnung, kopfUndDaten, UNTIS_FELDER, klassePasst, zeilenName } from '../untis.js';
import { teilnahmeVorschlaege, vorschlagUebernehmen, TEILNAHME } from '../nachschreiben.js';
import { FZ_STATUS } from '../fehlzeiten.js';
import { datumDeutsch, anzeigename } from '../modell.js';

const fzText = (f) => `${datumDeutsch(f.datum)}${f.datumBis ? `–${datumDeutsch(f.datumBis)}` : ''} ${f.zeitVon ? `${f.zeitVon}–${f.zeitBis}` : ''} ${f.fach || ''} ${f.stunde ? `${f.stunde}. Std.` : ''}`.replace(/\s+/g, ' ').trim();

/** Dateien lesen (Format an der Kopfzeile erkennen, sonst Zuordnungsdialog). */
async function dateienLesen(dateien) {
  const gelesen = [];
  for (const d of dateien) {
    const bytes = d.bytes ?? d.text;
    let g;
    try {
      g = dateiLesen(bytes, d.name);
    } catch (e) {
      await meldung('Datei nicht lesbar', `${d.name}: ${e.message}`);
      continue;
    }
    if (!g.format) {
      const { kopf, daten } = kopfUndDaten(g.roh);
      const zuordnung = await spaltenDialog({ titel: `Spalten zuordnen: ${d.name}`, kopf, felder: UNTIS_FELDER, zuordnung: {}, beispielZeilen: daten.slice(0, 3) });
      if (!zuordnung) continue;
      if ((zuordnung.name === undefined && zuordnung.vorname === undefined) || zuordnung.von === undefined) {
        await meldung('Zuordnung unvollständig', 'Bitte mindestens Name und Datum (von) zuordnen.');
        continue;
      }
      g = { format: 'B', roh: g.roh, zeilen: zeilenMitZuordnung(g.roh, zuordnung) };
    }
    gelesen.push({ name: d.name, pruefsumme: await pruefsumme(bytes), format: g.format, zeilen: g.zeilen });
  }
  return gelesen;
}

/** Ordnet (falls nötig) die Untis-Klasse der gewählten Klasse zu und verteilt die Zeilen. */
async function verteilen(buch, gelesen, klasse) {
  // Berichte ohne Klassenspalte gehören zur gewählten Klasse und werden nicht verteilt
  const alleZeilen = gelesen.flatMap((g) => g.zeilen).filter((z) => z.klasse || !klasse);
  let verteilung = aufKlassenVerteilen(buch, alleZeilen);
  const untisNamen = untisKlassen(alleZeilen);
  if (klasse && !verteilung.proKlasse.has(klasse.id) && untisNamen.length > 0) {
    const wahl = h('select', { 'aria-label': 'Untis-Klasse' }, untisNamen.map((n) => h('option', { value: n }, n)));
    const ok = await inhaltDialog('Klasse zuordnen', [
      h('p', {}, `In der Untis-Datei kommt „${klasse.kopf.klasse || 'diese Klasse'}“ nicht vor. Welche Untis-Klasse gehört zu dieser Klasse? Die Zuordnung wird gemerkt.`),
      h('label', {}, 'Untis-Klasse', wahl),
    ], [{ text: 'Abbrechen', wert: false, abbruch: true }, { text: 'Zuordnen', wert: true, klasse: 'knopf primaer' }]);
    if (!ok) return null;
    klasse.untis.klassenName = wahl.value;
    verteilung = aufKlassenVerteilen(buch, alleZeilen);
  }
  return verteilung;
}

/** Fachfilter pro Klasse (nur Format A kennt Fächer). */
async function faecherWaehlen(klasse, zeilenA) {
  const faecher = untisFaecher(zeilenA);
  if (faecher.length <= 1) return klasse.untis.faecher;
  const gespeichert = new Set(klasse.untis.faecher);
  const boxen = faecher.map((f) => h('label', { class: 'schalter' }, h('input', { type: 'checkbox', value: f, checked: gespeichert.size === 0 || gespeichert.has(f) }), ` ${f}`));
  const ok = await inhaltDialog(`Fächer für ${klasse.kopf.klasse || 'die Klasse'}`, [h('p', {}, 'Die Datei enthält mehrere Fächer. Welche sollen für diese Klasse übernommen werden? Die Auswahl wird gemerkt.'), ...boxen], [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: 'Weiter', wert: true, klasse: 'knopf primaer' },
  ]);
  if (!ok) return null;
  const gewaehlt = boxen.map((b) => b.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
  klasse.untis.faecher = gewaehlt.length === faecher.length ? [] : gewaehlt;
  return klasse.untis.faecher;
}

function aenderungsListe(titel, eintraege, text) {
  if (eintraege.length === 0) return null;
  return h('details', {}, h('summary', {}, `${titel}: ${eintraege.length}`), h('ul', { class: 'liste-kurz' }, eintraege.slice(0, 40).map((e) => h('li', {}, text(e))), eintraege.length > 40 && h('li', {}, `… und ${eintraege.length - 40} weitere`)));
}

/** Vorschau-Dialog je Klasse. Gibt true zurück, wenn übernommen werden soll. */
async function vorschau(buch, eintraege) {
  const behaelter = h('div', { class: 'untis-vorschau' });
  const name = (klasse, sid) => anzeigename(klasse.schueler.find((s) => s.id === sid) || {});
  function zeichnen() {
    leeren(behaelter);
    for (const e of eintraege) {
      const { klasse, plan } = e;
      const sec = h('section', { class: 'untis-klasse' }, h('h3', {}, `${klasse.kopf.klasse || 'Klasse'}`));
      sec.append(h('p', {}, `${plan.uebernommen} Einträge zugeordnet · neu ${plan.neu.length} · geändert ${plan.geaendert.length} · weggefallen ${plan.weggefallen.length}`));
      fuege(sec,
        aenderungsListe('Neu', plan.neu, (f) => `${name(klasse, f.schuelerId)}: ${FZ_STATUS[f.status]} ${fzText(f)}`),
        aenderungsListe('Status geändert', plan.geaendert, (x) => `${name(klasse, x.nachher.schuelerId)}: ${FZ_STATUS[x.vorher.status]} → ${FZ_STATUS[x.nachher.status]} (${fzText(x.nachher)})`),
        aenderungsListe('Weggefallen', plan.weggefallen, (f) => `${name(klasse, f.schuelerId)}: ${FZ_STATUS[f.status]} ${fzText(f)}`),
      );
      if (plan.unzugeordnet.length) {
        sec.append(h('p', { class: 'fehlertext' }, `${plan.unzugeordnet.length} Person(en) nicht eindeutig zuordenbar (rot):`));
        const tab = h('table', { class: 'tabelle klein-tabelle' }, h('tbody', {}, plan.unzugeordnet.map((u) => h('tr', { class: 'zeile-rot' },
          h('td', { class: 'links' }, `${u.name}${u.id ? ` (ID ${u.id})` : ''} · ${u.zeilen} Zeile(n)${u.status === 'mehrdeutig' ? ' · mehrdeutig' : ''}`),
          h('td', {}, h('select', { 'aria-label': `Zuordnung ${u.name}`, onchange: (ev) => {
            e.optionen.manuell.set(u.schluessel, ev.target.value === '' ? undefined : ev.target.value === '-' ? null : ev.target.value);
            if (ev.target.value === '') e.optionen.manuell.delete(u.schluessel);
            e.plan = e.neuPlanen();
            zeichnen();
          } },
            h('option', { value: '' }, '– bitte wählen –'),
            h('option', { value: '-' }, 'überspringen'),
            klasse.schueler.filter((s) => (s.name || s.vorname) && !s.archiviert).map((s) => h('option', { value: s.id }, `${s.name}, ${s.vorname}`)))),
        ))));
        sec.append(tab);
      }
      behaelter.append(sec);
    }
    if (eintraege.length === 0) behaelter.append(h('p', { class: 'hinweis' }, 'Keine passende Klasse im Notenbuch gefunden.'));
  }
  zeichnen();
  return inhaltDialog('Untis-Abgleich: Vorschau', [h('p', { class: 'klein' }, 'Nichts wird ohne Bestätigung übernommen. Manuell erfasste Fehlzeiten bleiben unverändert.'), behaelter], [
    { text: 'Abbrechen', wert: false, abbruch: true },
    eintraege.length > 0 && { text: 'Übernehmen', wert: true, klasse: 'knopf primaer' },
  ].filter(Boolean));
}

/** Teilnahme-Vorschläge zur Bestätigung (nie still übernehmen). */
export async function vorschlaegeDialog(klassen) {
  const liste = klassen.flatMap((k) => teilnahmeVorschlaege(k).map((v) => ({ ...v, klasse: k })));
  if (liste.length === 0) return 0;
  const haken = liste.map(() => h('input', { type: 'checkbox', checked: true, 'aria-label': 'Vorschlag übernehmen' }));
  const tab = h('div', { class: 'tabelle-rahmen' }, h('table', { class: 'tabelle klein-tabelle' },
    h('thead', {}, h('tr', {}, ['', 'Klasse', 'Arbeit', 'Person', 'bisher', 'Vorschlag', 'laut Untis'].map((t) => h('th', {}, t)))),
    h('tbody', {}, liste.map((v, i) => h('tr', {},
      h('td', {}, haken[i]),
      h('td', {}, v.klasse.kopf.klasse),
      h('td', {}, `KA ${v.kaIndex + 1} (${datumDeutsch(v.ka.datum)})`),
      h('td', { class: 'links' }, anzeigename(v.person)),
      h('td', { class: 'links' }, v.aenderung ? TEILNAHME[v.aktuell] : '–'),
      h('td', { class: 'links' }, h('strong', {}, TEILNAHME[v.vorschlag]), v.aenderung && ' (geändert)'),
      h('td', { class: 'links klein' }, `${FZ_STATUS[v.fz.status]}, ${fzText(v.fz)}`),
    )))));
  const ok = await inhaltDialog('Teilnahme an Klassenarbeiten: Vorschläge', [h('p', {}, 'Laut Untis haben diese Personen bei einer Klassenarbeit gefehlt. Bestätigen Sie, was übernommen werden soll.'), tab], [
    { text: 'Später', wert: false, abbruch: true },
    { text: 'Ausgewählte übernehmen', wert: true, klasse: 'knopf primaer' },
  ]);
  if (!ok) return 0;
  let n = 0;
  liste.forEach((v, i) => {
    if (haken[i].checked) {
      vorschlagUebernehmen(v);
      n += 1;
    }
  });
  if (n) K.aenderung();
  return n;
}

/**
 * Manueller Abgleich: `dateien` = [{bytes|text, name}]. `klasse`: gewählte Klasse (für die Klassenzuordnung), optional.
 * Gibt die Zahl der übernommenen Teilnahme-Vorschläge zurück oder -1 bei Abbruch.
 */
export async function untisAbgleichStarten(dateien, { klasse = null } = {}) {
  if (!K.buch || dateien.length === 0) return -1;
  const gelesen = await dateienLesen(dateien);
  if (gelesen.length === 0) return -1;
  const verteilung = await verteilen(K.buch, gelesen, klasse);
  if (!verteilung) return -1;
  const eintraege = [];
  const klassenlos = (g) => g.zeilen.filter((z) => !z.klasse);
  const ids = new Set(verteilung.proKlasse.keys());
  if (klasse && gelesen.some((g) => klassenlos(g).length)) ids.add(klasse.id);
  for (const id of ids) {
    const k = K.buch.klassen.find((x) => x.id === id);
    const fuerKlasse = (g) => [...(aufKlassenVerteilen(K.buch, g.zeilen).proKlasse.get(id) || []), ...(klasse && id === klasse.id ? klassenlos(g) : [])];
    const a = gelesen.filter((g) => g.format === 'A').flatMap(fuerKlasse);
    const b = gelesen.filter((g) => g.format === 'B').flatMap(fuerKlasse);
    const faecher = a.length ? await faecherWaehlen(k, a) : k.untis.faecher;
    if (faecher === null) return -1;
    const optionen = { faecher, manuell: new Map() };
    const e = { klasse: k, optionen, neuPlanen: () => importPlanen(k, { a, b }, optionen) };
    e.plan = e.neuPlanen();
    eintraege.push(e);
  }
  if (verteilung.unbekannt.length) toast(`Nicht zugeordnet (keine passende Klasse): ${verteilung.unbekannt.join(', ')}`);
  const ok = await vorschau(K.buch, eintraege);
  if (!ok) return -1;
  abgleichAnwenden(K.buch, { klassen: eintraege.map((e) => ({ klasse: e.klasse, plan: e.plan })), dateien: gelesen });
  K.aenderung();
  K.neuZeichnen();
  toast('Untis-Fehlzeiten übernommen.');
  return vorschlaegeDialog(eintraege.map((e) => e.klasse));
}
