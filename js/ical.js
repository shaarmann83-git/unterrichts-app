// Kleiner iCal-Leser (RFC 5545) für den WebUntis-Stundenplan (SPEC 10.1). Keine Fremdbibliothek.
// Gelesen werden VEVENT mit UID, SUMMARY, LOCATION, DESCRIPTION, STATUS, DTSTART, DTEND (oder DURATION).
// Zeiten werden in Ortszeit (Europe/Berlin oder die angegebene Zeitzone) als Datum und Uhrzeit geliefert, dazu als UTC-Millisekunden.

export const STANDARD_ZEITZONE = 'Europe/Berlin';

/** Gefaltete Zeilen (Zeilenumbruch + Leerzeichen/Tab) zusammenfügen. */
export function entfalten(text) {
  return String(text).replace(/^﻿/, '').replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

/** TEXT-Werte: \\n, \\N → Zeilenumbruch; \\, \; \\\\ → Zeichen. */
export function textEntschluesseln(t) {
  return String(t).replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** „NAME;PARAM=WERT;PARAM2=\"W;ert\":Wert“ → {name, params, wert}. Anführungszeichen in Parametern werden beachtet. */
export function zeileLesen(zeile) {
  let inAnf = false;
  let doppelpunkt = -1;
  for (let i = 0; i < zeile.length; i++) {
    const c = zeile[i];
    if (c === '"') inAnf = !inAnf;
    else if (c === ':' && !inAnf) {
      doppelpunkt = i;
      break;
    }
  }
  if (doppelpunkt < 0) return null;
  const kopf = zeile.slice(0, doppelpunkt);
  const wert = zeile.slice(doppelpunkt + 1);
  const teile = [];
  let aktuell = '';
  inAnf = false;
  for (const c of kopf) {
    if (c === '"') inAnf = !inAnf;
    if (c === ';' && !inAnf) {
      teile.push(aktuell);
      aktuell = '';
    } else aktuell += c;
  }
  teile.push(aktuell);
  const name = teile[0].toUpperCase();
  const params = {};
  for (const p of teile.slice(1)) {
    const g = p.indexOf('=');
    if (g > 0) params[p.slice(0, g).toUpperCase()] = p.slice(g + 1).replace(/^"|"$/g, '');
  }
  return { name, params, wert };
}

// ---------- Zeitzonen über Intl ----------

const formatierer = new Map();
function teileIn(ms, tz) {
  let f = formatierer.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formatierer.set(tz, f);
  }
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}

/** Zeitzonen-Versatz (Minuten) zu UTC für den Zeitpunkt `ms`. */
export function versatzMinuten(ms, tz) {
  const t = teileIn(ms, tz);
  return Math.round((Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second) - Math.floor(ms / 1000) * 1000) / 60000);
}

/** Ortszeit (Datum, Uhrzeit in `tz`) → UTC-Millisekunden. Bei der Umstellung gilt die frühere (Sommer-)Zeit. */
export function ortszeitZuMs(j, m, t, h, min, s, tz) {
  const roh = Date.UTC(j, m - 1, t, h, min, s);
  let ms = roh - versatzMinuten(roh, tz) * 60000;
  ms = roh - versatzMinuten(ms, tz) * 60000;
  return ms;
}

export function gueltigeZeitzone(tz) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * DTSTART/DTEND-Wert lesen.
 * Rückgabe {ms, datum 'JJJJ-MM-TT', uhrzeit 'HH:MM', ganztaegig} in der Zeitzone `ziel`.
 * Formen: 20261025 (Datum), 20261025T100000 (mit TZID oder lokal), 20261025T100000Z (UTC).
 */
export function zeitLesen(wert, params = {}, ziel = STANDARD_ZEITZONE) {
  const m = String(wert).trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, j, mo, t, h, mi, se, z] = m;
  if (h === undefined) {
    return { ms: ortszeitZuMs(+j, +mo, +t, 0, 0, 0, ziel), datum: `${j}-${mo}-${t}`, uhrzeit: '', ganztaegig: true };
  }
  let ms;
  if (z) ms = Date.UTC(+j, +mo - 1, +t, +h, +mi, +(se || 0));
  else {
    const tz = params.TZID && gueltigeZeitzone(params.TZID) ? params.TZID : ziel;
    ms = ortszeitZuMs(+j, +mo, +t, +h, +mi, +(se || 0), tz);
  }
  const l = teileIn(ms, ziel);
  return { ms, datum: `${l.year}-${pad(l.month)}-${pad(l.day)}`, uhrzeit: `${pad(l.hour)}:${pad(l.minute)}`, ganztaegig: false };
}

/** ISO-8601-Dauer wie PT45M, PT1H30M, P1D → Millisekunden. */
export function dauerMs(text) {
  const m = String(text).trim().match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, vz, w, d, h, mi, s] = m;
  const ms = ((+(w || 0) * 7 + +(d || 0)) * 86400 + +(h || 0) * 3600 + +(mi || 0) * 60 + +(s || 0)) * 1000;
  return vz === '-' ? -ms : ms;
}

/**
 * iCal-Text → Ereignisse. Verschachtelte Komponenten (VALARM, VTIMEZONE) werden übersprungen.
 * Ereignis: {uid, summary, location, description, status, abgesagt, datum, uhrzeit, ende, startMs, endeMs, ganztaegig}
 */
export function icalLesen(text, { zeitzone = STANDARD_ZEITZONE } = {}) {
  const zeilen = entfalten(text);
  const ereignisse = [];
  let aktuell = null;
  let tiefe = 0; // verschachtelte Komponenten im VEVENT
  for (const roh of zeilen) {
    if (!roh) continue;
    const u = roh.toUpperCase();
    if (u === 'BEGIN:VEVENT') {
      aktuell = { props: {} };
      tiefe = 0;
      continue;
    }
    if (!aktuell) continue;
    if (u === 'END:VEVENT') {
      const e = ereignisAus(aktuell.props, zeitzone);
      if (e) ereignisse.push(e);
      aktuell = null;
      continue;
    }
    if (u.startsWith('BEGIN:')) { tiefe += 1; continue; }
    if (u.startsWith('END:')) { tiefe = Math.max(0, tiefe - 1); continue; }
    if (tiefe > 0) continue;
    const z = zeileLesen(roh);
    if (z && !(z.name in aktuell.props)) aktuell.props[z.name] = z;
  }
  return ereignisse;
}

function ereignisAus(p, zeitzone) {
  if (!p.DTSTART) return null;
  const start = zeitLesen(p.DTSTART.wert, p.DTSTART.params, zeitzone);
  if (!start) return null;
  let ende = null;
  if (p.DTEND) ende = zeitLesen(p.DTEND.wert, p.DTEND.params, zeitzone);
  else if (p.DURATION) {
    const d = dauerMs(p.DURATION.wert);
    if (d !== null) ende = { ms: start.ms + d, ...(() => { const l = teileIn(start.ms + d, zeitzone); return { datum: `${l.year}-${pad(l.month)}-${pad(l.day)}`, uhrzeit: `${pad(l.hour)}:${pad(l.minute)}` }; })() };
  }
  const text = (n) => (p[n] ? textEntschluesseln(p[n].wert).trim() : '');
  const status = text('STATUS').toUpperCase();
  const summary = text('SUMMARY');
  const beschreibung = text('DESCRIPTION');
  const abgesagt = status === 'CANCELLED' || /^\s*(entf[aä]llt|ausfall|cancelled)\b/i.test(summary) || /\b(entf[aä]llt|ausgefallen)\b/i.test(`${summary} ${beschreibung}`);
  return {
    uid: text('UID'),
    summary,
    location: text('LOCATION'),
    description: beschreibung,
    status,
    abgesagt,
    datum: start.datum,
    uhrzeit: start.uhrzeit,
    ende: ende && !ende.ganztaegig ? ende.uhrzeit : '',
    endeDatum: ende && !ende.ganztaegig ? ende.datum : start.datum,
    startMs: start.ms,
    endeMs: ende ? ende.ms : start.ms,
    ganztaegig: start.ganztaegig,
  };
}
