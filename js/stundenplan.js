// Stundenplan aus WebUntis (iCal): Zuordnung zu Klassen, Doppelstunden, Termine anlegen und erneut importieren (SPEC Abschnitt 10).
import { normName } from './tabelle.js';
import { neueId } from './modell.js';
import { ortszeitZuMs, STANDARD_ZEITZONE } from './ical.js';

const MS_MIN = 60000;
export const DOPPELSTUNDE_LUECKE_MIN = 15;

export function stundenplanEinstellung(buch) {
  const e = (buch.einstellungen.stundenplan ||= { zuordnung: {}, letzterImport: '' });
  e.zuordnung ||= {};
  return e;
}

/** Schlüssel einer „Klasse + Fach“-Kombination: der normalisierte SUMMARY (bei leerem SUMMARY die DESCRIPTION). */
export function kombiSchluessel(e) {
  return normName(e.summary || e.description.split('\n')[0] || '');
}

const mitWortgrenze = (text, wort) => !!wort && new RegExp(`(^|[^a-z0-9äöüß])${wort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9äöüß])`).test(text);

/** Vorschlag für die Klasse aus dem Klassennamen im Text (längster Name zuerst), sonst ''. */
export function klasseVorschlag(buch, e) {
  const text = normName(`${e.summary} ${e.description}`);
  const kandidaten = buch.klassen.filter((k) => normName(k.kopf.klasse)).sort((a, b) => normName(b.kopf.klasse).length - normName(a.kopf.klasse).length);
  return kandidaten.find((k) => mitWortgrenze(text, normName(k.kopf.klasse)))?.id || '';
}

/**
 * Verschiedene Kombinationen „Klasse + Fach“ der Ereignisse mit Vorschlag (gemerkte Zuordnung vor Namens-Vorschlag).
 * Ganztägige Ereignisse (Ferien, Feiertage) werden nicht berücksichtigt.
 */
export function kombinationen(buch, ereignisse) {
  const e = stundenplanEinstellung(buch);
  const map = new Map();
  for (const ev of ereignisse) {
    if (ev.ganztaegig) continue;
    const s = kombiSchluessel(ev);
    if (!s) continue;
    const k = map.get(s) || { schluessel: s, text: ev.summary || ev.description.split('\n')[0], anzahl: 0, beispiel: `${ev.datum} ${ev.uhrzeit}`, location: ev.location, vorschlag: '' };
    k.anzahl += 1;
    map.set(s, k);
  }
  const ersterVorschlag = new Map();
  for (const ev of ereignisse) if (!ev.ganztaegig) { const s = kombiSchluessel(ev); if (s && !ersterVorschlag.has(s)) ersterVorschlag.set(s, ev); }
  for (const k of map.values()) {
    const gemerkt = e.zuordnung[k.schluessel];
    if (gemerkt === 'ignorieren' || (gemerkt && buch.klassen.some((x) => x.id === gemerkt))) k.vorschlag = gemerkt;
    else k.vorschlag = klasseVorschlag(buch, ersterVorschlag.get(k.schluessel));
    k.gemerkt = !!gemerkt && (gemerkt === 'ignorieren' || buch.klassen.some((x) => x.id === gemerkt));
  }
  return [...map.values()].sort((a, b) => a.text.localeCompare(b.text, 'de'));
}

/** Doppelstunden: aufeinanderfolgende Ereignisse derselben Kombination am selben Tag werden zu einem zusammengefasst. */
export function doppelstundenZusammenfassen(ereignisse, lueckeMin = DOPPELSTUNDE_LUECKE_MIN) {
  const sortiert = [...ereignisse].filter((e) => !e.ganztaegig).sort((a, b) => a.startMs - b.startMs);
  const ergebnis = [];
  for (const e of sortiert) {
    const s = kombiSchluessel(e);
    const vorher = ergebnis.findLast?.((x) => x.schluessel === s && x.datum === e.datum && x.abgesagt === e.abgesagt)
      ?? [...ergebnis].reverse().find((x) => x.schluessel === s && x.datum === e.datum && x.abgesagt === e.abgesagt);
    if (vorher && e.startMs - vorher.endeMs <= lueckeMin * MS_MIN && e.startMs >= vorher.startMs) {
      vorher.endeMs = Math.max(vorher.endeMs, e.endeMs);
      vorher.ende = e.ende || vorher.ende;
      vorher.uids.push(e.uid);
      vorher.stunden += 1;
    } else ergebnis.push({ ...e, schluessel: s, uids: [e.uid], stunden: 1 });
  }
  return ergebnis;
}

const eintragAus = (e, jetztIso) => ({
  uid: e.uids[0] || e.uid,
  uids: e.uids,
  datum: e.datum,
  uhrzeit: e.uhrzeit,
  ende: e.ende,
  startMs: e.startMs,
  endeMs: e.endeMs,
  status: e.abgesagt ? 'ausgefallen' : 'ok',
  summary: e.summary,
  schluessel: e.schluessel,
  stunden: e.stunden,
  importiert: jetztIso,
});

/** Hat der Termin Einträge (Anwesenheit, Mitarbeit, Merkmale) oder Vermerke? Dann wird er nie verändert. */
export function terminHatEintraege(klasse, t) {
  const a = klasse.sport.anwesenheit[t.id];
  const hatZ = a && Object.values(a).some((x) => x && x.z);
  const m = klasse.sport.mitarbeit[t.id];
  const hatM = m && Object.keys(m).length > 0;
  const mk = klasse.sport.merkmale[t.id];
  const hatMk = mk && Object.values(mk).some((arr) => arr.some(Boolean));
  return !!(hatZ || hatM || hatMk || (t.vermerk || '').trim() || t.pruefungstag);
}

function terminStartMs(t) {
  const [j, m, d] = String(t.datum).split('-').map(Number);
  const [h, mi] = (t.uhrzeit || '00:00').split(':').map(Number);
  return ortszeitZuMs(j, m, d, h, mi, 0, STANDARD_ZEITZONE);
}

const halbjahrVon = (datum, klasse) => {
  if (klasse.sport.zeitraum !== 'jahr') return 1;
  const m = Number(String(datum).slice(5, 7));
  return m >= 2 && m <= 7 ? 2 : 1;
};

const unterscheidet = (a, b) => a.datum !== b.datum || a.uhrzeit !== b.uhrzeit || (a.ende || '') !== (b.ende || '') || a.status !== b.status;

/**
 * Plant den Import. Nichts wird verändert.
 * `ereignisse`: Ergebnis von icalLesen. `zuordnung`: {schluessel: klasseId | 'ignorieren'}.
 * Rückgabe: { klassen: [{klasse, aktionen, neu, geaendert, entfallen, ausgefallen, abweichungen, uebersprungen}], nichtZugeordnet: [schluessel], bereich }.
 */
export function importPlanen(buch, ereignisse, zuordnung, jetztMs = Date.now()) {
  const jetztIso = new Date(jetztMs).toISOString();
  const alle = ereignisse.filter((e) => !e.ganztaegig);
  const bereich = alle.length ? [alle.map((e) => e.datum).sort()[0], alle.map((e) => e.datum).sort().at(-1)] : ['', ''];
  const nichtZugeordnet = new Set();
  const proKlasse = new Map();
  for (const e of alle) {
    const s = kombiSchluessel(e);
    const ziel = zuordnung[s];
    if (!ziel) { nichtZugeordnet.add(s); continue; }
    if (ziel === 'ignorieren') continue;
    if (!buch.klassen.some((k) => k.id === ziel)) { nichtZugeordnet.add(s); continue; }
    if (!proKlasse.has(ziel)) proKlasse.set(ziel, []);
    proKlasse.get(ziel).push(e);
  }
  // Klassen, die schon importierte Ereignisse haben, aber in dieser Datei nichts mehr: ebenfalls prüfen (Termine könnten entfallen sein)
  for (const k of buch.klassen) if ((k.stundenplan || []).length && !proKlasse.has(k.id)) proKlasse.set(k.id, []);

  const klassen = [];
  for (const [klasseId, evs] of proKlasse) {
    const klasse = buch.klassen.find((k) => k.id === klasseId);
    const neueEintraege = doppelstundenZusammenfassen(evs).map((e) => eintragAus(e, jetztIso));
    const bestehend = new Map((klasse.stundenplan || []).map((x) => [x.uid, x]));
    const neueMap = new Map(neueEintraege.map((x) => [x.uid, x]));
    const res = { klasse, aktionen: [], neu: [], geaendert: [], entfallen: [], ausgefallen: [], abweichungen: [], uebersprungen: [] };
    const sport = klasse.fachtyp === 'sport';
    const handTermine = sport ? klasse.sport.termine.filter((t) => !t.uid) : [];
    const terminZuUid = (uid) => (sport ? klasse.sport.termine.find((t) => t.uid === uid || (t.uids || []).includes(uid)) : null);

    for (const n of neueEintraege) {
      const alt = bestehend.get(n.uid);
      if (!alt) {
        res.aktionen.push({ typ: 'eintrag-setzen', klasseId, eintrag: n });
        if (n.status === 'ausgefallen') { res.ausgefallen.push(n); continue; }
        if (sport) {
          const doppelt = handTermine.find((t) => t.datum === n.datum && (!t.uhrzeit || t.uhrzeit === n.uhrzeit));
          if (doppelt) { res.uebersprungen.push({ eintrag: n, grund: 'Am selben Tag gibt es schon einen von Hand angelegten Termin.' }); continue; }
          res.aktionen.push({ typ: 'termin-neu', klasseId, termin: { id: neueId(), datum: n.datum, uhrzeit: n.uhrzeit, ende: n.ende, reihe: '', pruefungstag: false, vermerk: '', halbjahr: halbjahrVon(n.datum, klasse), uid: n.uid, uids: n.uids, quelle: 'ical', _neu: true } });
        }
        res.neu.push(n);
        continue;
      }
      if (!unterscheidet(alt, n)) continue;
      res.geaendert.push({ vorher: alt, nachher: n });
      res.aktionen.push({ typ: 'eintrag-setzen', klasseId, eintrag: { ...n } });
      if (!sport) continue;
      const t = terminZuUid(n.uid);
      if (!t) continue; // Termin wurde von Hand gelöscht: nicht neu anlegen
      const frei = !terminHatEintraege(klasse, t) && terminStartMs(t) > jetztMs;
      if (n.status === 'ausgefallen') {
        if (frei) res.aktionen.push({ typ: 'termin-entfernen', klasseId, terminId: t.id });
        else if (terminHatEintraege(klasse, t)) res.abweichungen.push({ art: 'ausgefallen', termin: t, text: 'in Untis ausgefallen, in der App aber schon Einträge' });
      } else if (frei) {
        res.aktionen.push({ typ: 'termin-aendern', klasseId, terminId: t.id, datum: n.datum, uhrzeit: n.uhrzeit, ende: n.ende, halbjahr: halbjahrVon(n.datum, klasse) });
      } else if (terminHatEintraege(klasse, t)) {
        res.abweichungen.push({ art: 'geaendert', termin: t, nachher: n, text: `in Untis verschoben auf ${n.datum} ${n.uhrzeit}, in der App aber schon Einträge` });
      }
    }
    for (const [uid, alt] of bestehend) {
      if (neueMap.has(uid)) continue;
      if (bereich[0] && (alt.datum < bereich[0] || alt.datum > bereich[1])) continue; // außerhalb des Zeitraums der Datei: unverändert
      res.entfallen.push(alt);
      res.aktionen.push({ typ: 'eintrag-entfernen', klasseId, uid });
      if (!sport) continue;
      const t = terminZuUid(uid);
      if (!t) continue;
      if (!terminHatEintraege(klasse, t) && terminStartMs(t) > jetztMs) res.aktionen.push({ typ: 'termin-entfernen', klasseId, terminId: t.id });
      else if (terminHatEintraege(klasse, t)) res.abweichungen.push({ art: 'entfallen', termin: t, text: 'in Untis entfallen, in der App aber schon Einträge' });
    }
    klassen.push(res);
  }
  return { klassen, nichtZugeordnet: [...nichtZugeordnet], bereich, jetztIso };
}

/** Wendet den Plan an und merkt die Zuordnung. Neue Sport-Termine übernehmen die Reihe vom vorherigen Termin. */
export function importAnwenden(buch, plan, zuordnung) {
  const e = stundenplanEinstellung(buch);
  Object.assign(e.zuordnung, zuordnung);
  e.letzterImport = plan.jetztIso;
  for (const res of plan.klassen) {
    const klasse = res.klasse;
    klasse.stundenplan ||= [];
    for (const a of res.aktionen) {
      if (a.typ === 'eintrag-setzen') {
        const i = klasse.stundenplan.findIndex((x) => x.uid === a.eintrag.uid);
        if (i >= 0) klasse.stundenplan[i] = a.eintrag;
        else klasse.stundenplan.push(a.eintrag);
      } else if (a.typ === 'eintrag-entfernen') klasse.stundenplan = klasse.stundenplan.filter((x) => x.uid !== a.uid);
      else if (a.typ === 'termin-neu') klasse.sport.termine.push({ ...a.termin });
      else if (a.typ === 'termin-aendern') {
        const t = klasse.sport.termine.find((x) => x.id === a.terminId);
        if (t) Object.assign(t, { datum: a.datum, uhrzeit: a.uhrzeit, ende: a.ende, halbjahr: a.halbjahr });
      } else if (a.typ === 'termin-entfernen') {
        const sp = klasse.sport;
        sp.termine = sp.termine.filter((x) => x.id !== a.terminId);
        delete sp.anwesenheit[a.terminId];
        delete sp.mitarbeit[a.terminId];
        delete sp.merkmale[a.terminId];
      }
    }
    klasse.stundenplan.sort((a, b) => a.startMs - b.startMs);
    if (klasse.fachtyp === 'sport') reiheUebernehmen(klasse);
  }
}

/** Neue Termine (Marke _neu) übernehmen die Reihe des vorherigen Termins (nach Datum und Uhrzeit sortiert). */
export function reiheUebernehmen(klasse) {
  const sortiert = [...klasse.sport.termine].sort((a, b) => terminStartMs(a) - terminStartMs(b));
  let vorherige = '';
  for (const t of sortiert) {
    if (t._neu) {
      t.reihe = vorherige;
      delete t._neu;
    }
    vorherige = t.reihe;
  }
}

// ---------- Jetzt-Vorschlag, Vorschläge für Lernfeld ----------

/**
 * Läuft gerade oder in den nächsten `minuten` Minuten ein Termin? Gibt die laufende Einheit zurück, sonst die nächste.
 * Rückgabe {klasse, eintrag, laeuft, inMinuten, text, terminId} oder null.
 */
export function jetztVorschlag(buch, jetztMs = Date.now(), minuten = 30) {
  let beste = null;
  for (const klasse of buch.klassen) {
    for (const eintrag of klasse.stundenplan || []) {
      if (eintrag.status !== 'ok') continue;
      const laeuft = eintrag.startMs <= jetztMs && jetztMs < eintrag.endeMs;
      const bald = eintrag.startMs > jetztMs && eintrag.startMs - jetztMs <= minuten * MS_MIN;
      if (!laeuft && !bald) continue;
      const rang = laeuft ? 0 : eintrag.startMs - jetztMs;
      if (!beste || rang < beste.rang) beste = { klasse, eintrag, laeuft, rang };
    }
  }
  if (!beste) return null;
  const { klasse, eintrag, laeuft } = beste;
  const sport = klasse.fachtyp === 'sport';
  const titel = [klasse.kopf.klasse, sport ? 'Sport' : klasse.kopf.lernfeldBez].filter(Boolean).join(' ');
  const t = sport ? klasse.sport.termine.find((x) => x.uid === eintrag.uid || (x.uids || []).includes(eintrag.uid)) : null;
  return {
    klasse,
    eintrag,
    laeuft,
    inMinuten: laeuft ? 0 : Math.round((eintrag.startMs - jetztMs) / MS_MIN),
    terminId: t?.id || '',
    text: `Jetzt: ${titel} – ${sport ? 'Einheit erfassen' : 'Stunde notieren'}`,
  };
}

/** Einträge einer Klasse ab einem Datum (für Vorschläge bei Klassenarbeiten und „Heutige Stunde“). */
export function eintraegeAb(klasse, abDatum, anzahl = 12) {
  return (klasse.stundenplan || []).filter((e) => e.status === 'ok' && e.datum >= abDatum).sort((a, b) => a.startMs - b.startMs).slice(0, anzahl);
}

export const eintraegeAm = (klasse, datum) => (klasse.stundenplan || []).filter((e) => e.status === 'ok' && e.datum === datum).sort((a, b) => a.startMs - b.startMs);
