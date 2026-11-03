import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rundeNote, punkte, grundnoteAusMittel, pruefungsnoteAusProzent, teilRohwert, pruefungsprozent, mitarbeitReihe,
  pruefungReihe, reihenErgebnis, gesamtSport, endnotenKlasse, aenderungenZaehlen, spsNummern, istPruefungstag,
  doppelBewertungHinweis, einstellungenAus,
} from '../js/sport.js';
import { neueKlasse, neueReihe, neuerPruefteil, neuesBuch, sportStandard, neueId, klasseKopieren, pruefeBuch } from '../js/modell.js';
import { inDateitext, ausDateitext } from '../js/krypto.js';

const EIN = sportStandard();
const nah = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/** Sport-Klasse mit n Personen (erfundene Namen). */
function sportKlasse(n = 1) {
  const k = neueKlasse({ klasse: 'SPORT-A', fachtyp: 'sport' });
  k.schueler = k.schueler.slice(0, n);
  k.schueler.forEach((s, i) => { s.name = `Muster${i + 1}`; s.vorname = `Person${i + 1}`; });
  return k;
}
let tag = 0;
/** Legt einen Termin an; zeichen: Zeichen der ersten Person (oder Liste je Person). */
function termin(k, reihe, zeichen = '.', { datum, vermerk = '', halbjahr = 1, pruefungstag = false } = {}) {
  tag += 1;
  const t = { id: neueId(), datum: datum || `2026-02-${String(Math.min(tag, 28)).padStart(2, '0')}`, uhrzeit: '', reihe: reihe ? reihe.id : '', pruefungstag, vermerk, halbjahr };
  k.sport.termine.push(t);
  const liste = Array.isArray(zeichen) ? zeichen : [zeichen];
  k.sport.anwesenheit[t.id] = {};
  liste.forEach((z, i) => { if (z !== null && k.schueler[i]) k.sport.anwesenheit[t.id][k.schueler[i].id] = { z }; });
  return t;
}
const mitarbeit = (k, t, wert, i = 0) => { (k.sport.mitarbeit[t.id] ||= {})[k.schueler[i].id] = wert; };
const haken = (k, t, m, i = 0) => { const a = ((k.sport.merkmale[t.id] ||= {})[k.schueler[i].id] ||= [false, false, false]); a[m] = true; };
function reihe(k, name, { pruefung = 0.5, mit = 0.5, verhalten = 0 } = {}) {
  const r = neueReihe(name);
  r.gewichte = { pruefung, mitarbeit: mit, verhalten };
  k.sport.reihen.push(r);
  return r;
}
function teile(r, anzahl, versuche = 5) {
  r.teile = Array.from({ length: anzahl }, (_, i) => Object.assign(neuerPruefteil(`Teil ${i + 1}`), { versuche }));
  return r.teile;
}
function summen(k, r, werte, i = 0) {
  const w = (r.werte[k.schueler[i].id] ||= {});
  w.summen ||= {};
  werte.forEach((v, j) => { if (v !== null) w.summen[r.teile[j].id] = v; });
}
const erg = (k, r, i = 0) => reihenErgebnis(k, r, k.schueler[i].id, EIN);

// ---------- Grundlagen ----------

test('Prüfungsschlüssel 83/58/40/25/10 an den Kanten', () => {
  const f = [[100, 1], [83, 1], [82.9, 2], [58, 2], [57.9, 3], [40, 3], [39.9, 4], [25, 4], [24.9, 5], [10, 5], [9.9, 6], [0, 6]];
  for (const [p, n] of f) assert.equal(pruefungsnoteAusProzent(p, EIN), n, `${p} %`);
});

test('Mitarbeitstabelle 2,8/2,4/1,7/1,0/0,4', () => {
  const f = [[3, 1], [2.8, 1], [2.79, 2], [2.4, 2], [2.39, 3], [2, 3], [1.7, 3], [1.69, 4], [1, 4], [0.99, 5], [0.4, 5], [0.39, 6], [0, 6]];
  for (const [m, n] of f) assert.equal(grundnoteAusMittel(m, EIN), n, `Ø ${m}`);
});

test('Rundung: halbe Werte zur besseren Note (2,5 → 2; 2,51 → 3)', () => {
  assert.equal(rundeNote(2.5), 2);
  assert.equal(rundeNote(2.51), 3);
  assert.equal(rundeNote(2.4999), 2);
  assert.equal(rundeNote(1.5), 1);
  assert.equal(rundeNote(1), 1);
  assert.equal(rundeNote(0.7), 1);
  assert.equal(rundeNote(6), 6);
  assert.equal(rundeNote(2.5 + 1e-12), 2, 'Rechenfehler an der Kante');
  assert.equal(rundeNote(null), null);
});

test('Punkte: 1,0 → 14; 0,7 → 15; 2,3333 → 10; 2,5 → 10; 4,3333 → 4; 6,0 → 0', () => {
  const f = [[1.0, 14], [0.7, 15], [2.3333, 10], [2.5, 10], [4.3333, 4], [6.0, 0]];
  for (const [n, p] of f) assert.equal(punkte(n, EIN), p, `Note ${n}`);
  assert.equal(punkte(null, EIN), null);
});

// ---------- Prüfung ----------

test('Volleyball: Pritschen 12, Baggern 10, Aufschlag 8 → 30 von 45 = 66,7 % → 2', () => {
  const k = sportKlasse();
  const r = reihe(k, 'Volleyball');
  teile(r, 3);
  summen(k, r, [12, 10, 8]);
  const pz = pruefungsprozent(r.teile, r.werte[k.schueler[0].id]);
  nah(pz.prozent, 66.6667);
  assert.equal(pruefungReihe(k, r, k.schueler[0].id, EIN).note, 2);
});

test('Skala an der Kante: 29 von 45 = 64,4 % → 2; 26 von 45 = 57,8 % → 3', () => {
  const k = sportKlasse(2);
  const r = reihe(k, 'Volleyball');
  teile(r, 3);
  summen(k, r, [10, 10, 9], 0); // 29
  summen(k, r, [9, 9, 8], 1); // 26
  const [a, b] = k.schueler.map((s) => pruefungReihe(k, r, s.id, EIN));
  nah(a.prozent, 64.4444);
  assert.equal(a.note, 2);
  nah(b.prozent, 57.7778);
  assert.equal(b.note, 3);
});

test('Einzelversuche: 2,2,3,1,2 → 10; Versuch von 1 auf 2 geändert → 11', () => {
  const k = sportKlasse();
  const r = reihe(k, 'Badminton');
  const [t] = teile(r, 1);
  const w = (r.werte[k.schueler[0].id] ||= {});
  w.versuche = { [t.id]: [2, 2, 3, 1, 2] };
  assert.equal(teilRohwert(w, t), 10);
  w.versuche[t.id][3] = 2;
  assert.equal(teilRohwert(w, t), 11);
  // Summe direkt eingegeben gilt nur, wenn keine Einzelversuche da sind
  const w2 = { summen: { [t.id]: 7 } };
  assert.equal(teilRohwert(w2, t), 7);
  assert.equal(teilRohwert({}, t), null);
  assert.equal(teilRohwert({ versuche: { [t.id]: [null, null] } }, t), null);
});

test('Badminton: fünf Teile à 15, Summen 10, 9, 8, 7, 6 → 40 von 75 = 53,3 % → 3', () => {
  const k = sportKlasse();
  const r = reihe(k, 'Badminton', { pruefung: 0.6, mit: 0.4 });
  teile(r, 5);
  summen(k, r, [10, 9, 8, 7, 6]);
  const p = pruefungReihe(k, r, k.schueler[0].id, EIN);
  nah(p.prozent, 53.3333);
  assert.equal(p.note, 3);
});

test('Teilprüfung: nur drei Teile geprüft, 10 + 9 + 8 = 27 von 45 = 60 % → 2 (nicht geprüfte Teile wirken nicht als 0)', () => {
  const k = sportKlasse();
  const r = reihe(k, 'Badminton');
  teile(r, 5);
  summen(k, r, [10, 9, 8, null, null]);
  const p = pruefungReihe(k, r, k.schueler[0].id, EIN);
  assert.equal(p.prozent, 60);
  assert.equal(p.geprueft, 3);
  assert.equal(p.note, 2);
});

test('Höchstwert überschreibbar (Regeltest 40) und Gewichte der Teile', () => {
  const k = sportKlasse();
  const r = reihe(k, 'Volleyball');
  teile(r, 2);
  r.teile[0].hoechst = 40;
  r.teile[1].gewicht = 2;
  summen(k, r, [30, 6]);
  // (1×30 + 2×6) / (1×40 + 2×15) = 42/70 = 60 %
  assert.equal(pruefungsprozent(r.teile, r.werte[k.schueler[0].id]).prozent, 60);
});

test('Ohne jeden Wert bleibt die Prüfung leer', () => {
  const k = sportKlasse();
  const r = reihe(k, 'Volleyball');
  teile(r, 3);
  const p = pruefungReihe(k, r, k.schueler[0].id, EIN);
  assert.equal(p.note, null);
  assert.equal(p.status, 'leer');
});

// ---------- Mitarbeit ----------

test('Volleyball: Mitarbeit 3,2,2,2,2,2,2 (ein Termin E) → Ø 2,142857 → Grundnote 3; ein Merkmal → 2,6667; Reihenwert 2,3333 → Note 2', () => {
  const k = sportKlasse();
  const r = reihe(k, 'Volleyball');
  teile(r, 3);
  summen(k, r, [12, 10, 8]);
  const ts = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => termin(k, r, i === 4 ? 'E' : '.'));
  mitarbeit(k, ts[0], 3);
  let m = mitarbeitReihe(k, r, k.schueler[0].id, EIN);
  assert.equal(m.n, 7);
  nah(m.mittel, 2.142857);
  assert.equal(m.grundnote, 3);
  assert.equal(m.aufwertung, 0);
  nah(m.note, 3);
  // ein Merkmal in zwei Terminen
  haken(k, ts[1], 0); haken(k, ts[2], 0);
  m = mitarbeitReihe(k, r, k.schueler[0].id, EIN);
  assert.deepEqual(m.gezeigt, [true, false, false]);
  nah(m.note, 2.6667);
  const e = erg(k, r);
  nah(e.wert, 2.3333);
  assert.equal(e.note, 2);
});

test('Merkmal gilt erst ab zwei Terminen; höchstens eine ganze Note Aufwertung', () => {
  const k = sportKlasse();
  const r = reihe(k, 'X');
  const ts = Array.from({ length: 5 }, () => termin(k, r, '.'));
  haken(k, ts[0], 0);
  assert.equal(mitarbeitReihe(k, r, k.schueler[0].id, EIN).aufwertung, 0);
  for (const m of [0, 1, 2]) { haken(k, ts[1], m); haken(k, ts[2], m); haken(k, ts[0], m); }
  const m = mitarbeitReihe(k, r, k.schueler[0].id, EIN);
  assert.equal(m.gezeigt.filter(Boolean).length, 3);
  nah(m.aufwertung, 1);
  nah(m.note, 2, 1e-9); // Grundnote 3 − 1
});

test('Aufwertung macht nie besser als 1,0', () => {
  const k = sportKlasse();
  const r = reihe(k, 'X');
  const ts = Array.from({ length: 4 }, () => termin(k, r, '.'));
  ts.forEach((t) => mitarbeit(k, t, 3));
  for (const m of [0, 1, 2]) { haken(k, ts[0], m); haken(k, ts[1], m); }
  const m = mitarbeitReihe(k, r, k.schueler[0].id, EIN);
  assert.equal(m.grundnote, 1);
  assert.equal(m.note, 1);
});

test('sps: 8 Termine Punkt, davon 2× sps → 1. wie anwesend, 2. fest 0 → Ø 1,75 → 3; drittes sps in anderer Reihe ebenfalls 0', () => {
  const k = sportKlasse();
  const r = reihe(k, 'Volleyball');
  const z = ['.', '.', 'sps', '.', '.', 'sps', '.', '.'];
  const ts = z.map((c) => termin(k, r, c));
  const m = mitarbeitReihe(k, r, k.schueler[0].id, EIN);
  assert.equal(m.n, 8);
  nah(m.mittel, 1.75);
  assert.equal(m.grundnote, 3);
  assert.equal(m.sps, 2);
  const nr = spsNummern(k, k.schueler[0].id);
  assert.equal(nr.get(ts[2].id), 1);
  assert.equal(nr.get(ts[5].id), 2);
  // drittes sps in einer anderen Reihe desselben Halbjahres
  const r2 = reihe(k, 'Badminton');
  const t3 = termin(k, r2, 'sps');
  [0, 1, 2].forEach(() => termin(k, r2, '.'));
  assert.equal(spsNummern(k, k.schueler[0].id).get(t3.id), 3);
  const m2 = mitarbeitReihe(k, r2, k.schueler[0].id, EIN);
  nah(m2.mittel, 1.5); // 0, 2, 2, 2
});

test('sps: zweites Halbjahr beginnt neu zu zählen (ganzes Schuljahr)', () => {
  const k = sportKlasse();
  k.sport.zeitraum = 'jahr';
  const r = reihe(k, 'A');
  const t1 = termin(k, r, 'sps', { halbjahr: 1, datum: '2026-01-10' });
  const t2 = termin(k, r, 'sps', { halbjahr: 2, datum: '2026-03-10' });
  const nr = spsNummern(k, k.schueler[0].id);
  assert.equal(nr.get(t1.id), 1);
  assert.equal(nr.get(t2.id), 1);
});

test('Offen: 6 Termine Punkt, 1× k → „zählt als 0“ Ø 1,714 → 3; „zählt nicht“ Ø 2,0 → 3', () => {
  const k = sportKlasse();
  const r = reihe(k, 'X');
  ['.', '.', '.', '.', '.', '.', 'k'].forEach((c) => termin(k, r, c));
  let m = mitarbeitReihe(k, r, k.schueler[0].id, EIN);
  nah(m.mittel, 1.7143);
  assert.equal(m.grundnote, 3);
  assert.equal(m.offen, 1);
  m = mitarbeitReihe(k, r, k.schueler[0].id, { ...EIN, offenZaehltNull: false });
  assert.equal(m.mittel, 2);
  assert.equal(m.grundnote, 3);
  assert.equal(m.offen, 1, 'die Zahl offener Einträge wird unabhängig davon gezeigt');
  // Strich ist ebenfalls offen
  const k2 = sportKlasse();
  const r2 = reihe(k2, 'X');
  ['.', '.', '|'].forEach((c) => termin(k2, r2, c));
  assert.equal(mitarbeitReihe(k2, r2, k2.schueler[0].id, EIN).offen, 1);
});

test('Wirkung aller Zeichen auf die Mitarbeit', () => {
  const k = sportKlasse();
  const r = reihe(k, 'X');
  const erwartet = { '.': 2, V: 2, sps: 2, k: 0, ke: null, ka: null, ku: 0, '|': 0, E: null, A: null, B: null, P: null, U: 0, '': null };
  for (const [z, w] of Object.entries(erwartet)) {
    const t = termin(k, r, z === '' ? [null] : z);
    const m = mitarbeitReihe(k, r, k.schueler[0].id, EIN);
    const eintrag = m.zaehlend.find((x) => x.terminId === t.id);
    assert.equal(eintrag ? eintrag.wert : null, w, `Zeichen „${z}“`);
  }
});

test('Vorrang: Mitarbeit 3 eingetippt, Anwesenheit ku → Wert 0', () => {
  const k = sportKlasse();
  const r = reihe(k, 'X');
  const ts = [termin(k, r, 'ku'), termin(k, r, 'U'), termin(k, r, '.'), termin(k, r, '.'), termin(k, r, 'sps'), termin(k, r, 'sps')];
  ts.forEach((t) => mitarbeit(k, t, 3));
  const m = mitarbeitReihe(k, r, k.schueler[0].id, EIN);
  assert.deepEqual(m.zaehlend.map((x) => x.wert), [0, 0, 3, 3, 3, 0]);
});

test('Merkmal mit sps: M1 in 2 Terminen, einer davon sps → zählt 1 → keine Aufwertung; auch ku/U zählen nicht', () => {
  const k = sportKlasse();
  const r = reihe(k, 'X');
  const t1 = termin(k, r, '.');
  const t2 = termin(k, r, 'sps');
  const t3 = termin(k, r, 'ku');
  termin(k, r, '.');
  haken(k, t1, 0); haken(k, t2, 0);
  assert.equal(mitarbeitReihe(k, r, k.schueler[0].id, EIN).aufwertung, 0);
  haken(k, t3, 0);
  assert.equal(mitarbeitReihe(k, r, k.schueler[0].id, EIN).merkmalAnzahl[0], 1);
});

test('Mindestzahl: 2 zählende Termine → Mitarbeit leer → Reihenwert = Prüfungsnote', () => {
  const k = sportKlasse();
  const r = reihe(k, 'Volleyball');
  teile(r, 3);
  summen(k, r, [12, 10, 8]);
  termin(k, r, '.'); termin(k, r, '.'); termin(k, r, 'E');
  const e = erg(k, r);
  assert.equal(e.mitarbeit.note, null);
  assert.equal(e.pruefung.note, 2);
  assert.equal(e.wert, 2);
  assert.equal(e.note, 2);
  // Mindestzahl einstellbar
  const e2 = reihenErgebnis(k, r, k.schueler[0].id, { ...EIN, mindestTermine: 2 });
  assert.notEqual(e2.mitarbeit.note, null);
});

test('Mitarbeitsnote manuell überschreibbar', () => {
  const k = sportKlasse();
  const r = reihe(k, 'X');
  [1, 2, 3, 4].forEach(() => termin(k, r, '.'));
  r.werte[k.schueler[0].id] = { mitarbeitNote: { wert: 1.5, begruendung: 'Hat die Gruppe angeleitet' } };
  const m = mitarbeitReihe(k, r, k.schueler[0].id, EIN);
  assert.equal(m.note, 1.5);
  assert.equal(m.berechnet, 3);
  assert.equal(m.ueberschrieben.begruendung, 'Hat die Gruppe angeleitet');
});

// ---------- Prüfungstag ----------

test('Prüfungstag unentschuldigt: Person U, keine Werte → Prüfungsnote 6; Reihenwert 4,3333', () => {
  const k = sportKlasse();
  const r = reihe(k, 'Volleyball');
  teile(r, 3);
  // 6 Termine mit 2 und der Prüfungstag mit U (zählt 0): Ø 12/7 = 1,714 → Grundnote 3, ein Merkmal → 2,6667
  const mt = Array.from({ length: 6 }, () => termin(k, r, '.'));
  haken(k, mt[0], 0); haken(k, mt[1], 0);
  termin(k, r, 'U', { vermerk: 'T' });
  const e = erg(k, r);
  assert.equal(e.pruefung.note, 6);
  assert.equal(e.pruefung.status, 'auto6');
  nah(e.mitarbeit.note, 2.6667);
  nah(e.wert, 4.3333);
});

test('Prüfungstag mit E → Prüfung offen, Status „Nachprüfung offen“; mit Wert gilt die normale Rechnung', () => {
  const k = sportKlasse();
  const r = reihe(k, 'Volleyball');
  teile(r, 3);
  termin(k, r, 'E', { vermerk: 'T' });
  assert.equal(pruefungReihe(k, r, k.schueler[0].id, EIN).status, 'nachpruefung-offen');
  assert.equal(pruefungReihe(k, r, k.schueler[0].id, EIN).note, null);
  summen(k, r, [12, 10, 8]);
  const p = pruefungReihe(k, r, k.schueler[0].id, EIN);
  assert.equal(p.status, 'normal');
  assert.equal(p.note, 2);
});

test('Zwei Prüfungstage, an einem anwesend, keine Werte → offen; an beiden entschuldigt → Nachprüfung offen; beide unentschuldigt → 6', () => {
  const stand = (z1, z2) => {
    const k = sportKlasse();
    const r = reihe(k, 'X');
    teile(r, 1);
    termin(k, r, z1, { vermerk: 'T' });
    termin(k, r, z2, { vermerk: 'P' });
    return pruefungReihe(k, r, k.schueler[0].id, EIN);
  };
  assert.equal(stand('.', 'U').status, 'offen');
  assert.equal(stand('.', 'U').note, null);
  assert.equal(stand('E', 'A').status, 'nachpruefung-offen');
  assert.equal(stand('U', 'ku').status, 'auto6');
  assert.equal(stand('U', '|').status, 'auto6', 'Strich zählt als unentschuldigt bei „offen zählt als 0“');
  assert.equal(stand('E', 'U').status, 'nachpruefung-offen');
  assert.equal(stand('', 'U').status, 'offen', 'noch nicht erfasst');
});

test('Prüfungstag: offen bei „offen zählt nicht“, Kennzeichen als Wort erkannt, eigene Kennzeichen, Markierung', () => {
  const k = sportKlasse();
  const r = reihe(k, 'X');
  teile(r, 1);
  termin(k, r, '|', { vermerk: 'T' });
  const ohne = { ...EIN, offenZaehltNull: false };
  assert.equal(pruefungReihe(k, r, k.schueler[0].id, ohne).status, 'offen');
  assert.equal(istPruefungstag({ vermerk: 'Test heute', pruefungstag: false }, EIN), false, '„Test“ ist kein Kennzeichen');
  assert.equal(istPruefungstag({ vermerk: 'P' }, EIN), true);
  assert.equal(istPruefungstag({ vermerk: 'Regeltest (T)' }, EIN), true);
  assert.equal(istPruefungstag({ vermerk: 'x', pruefungstag: true }, EIN), true);
  assert.equal(istPruefungstag({ vermerk: 'Q' }, { ...EIN, pruefungstagKennzeichen: ['Q'] }), true);
});

test('Ohne Prüfungstag und ohne Werte: keine automatische 6', () => {
  const k = sportKlasse();
  const r = reihe(k, 'X');
  teile(r, 1);
  termin(k, r, 'U');
  assert.equal(pruefungReihe(k, r, k.schueler[0].id, EIN).note, null);
});

test('Ersatzprüfung: eigene Teile mit gleichem Schlüssel oder direkte Note; Beschreibung ist Pflicht', () => {
  const k = sportKlasse();
  const r = reihe(k, 'Volleyball');
  teile(r, 3);
  r.ersatzTeile = [Object.assign(neuerPruefteil('Regeltest'), { versuche: 0, hoechst: 40 }), Object.assign(neuerPruefteil('Aufwärmen'), { versuche: 0, hoechst: 30 })];
  r.werte[k.schueler[0].id] = { ersatz: { beschreibung: 'Knie-OP', summen: { [r.ersatzTeile[0].id]: 30, [r.ersatzTeile[1].id]: 20 } } };
  let p = pruefungReihe(k, r, k.schueler[0].id, EIN);
  assert.equal(p.status, 'ersatz');
  nah(p.prozent, 71.4286);
  assert.equal(p.note, 2);
  assert.equal(p.ersatzOhneBeschreibung, false);
  r.werte[k.schueler[0].id].ersatz = { beschreibung: '', note: 3 };
  p = pruefungReihe(k, r, k.schueler[0].id, EIN);
  assert.equal(p.note, 3);
  assert.equal(p.ersatzOhneBeschreibung, true);
});

// ---------- Reihenwert, Verhalten, Ultimate ----------

test('Verhalten: Gewichte 0,6/0,4/0,2, Prüfung 3, Mitarbeit 1,6667, Verhalten 2 → 2,3889', () => {
  const k = sportKlasse();
  const r = reihe(k, 'X', { pruefung: 0.6, mit: 0.4, verhalten: 0.2 });
  teile(r, 1);
  summen(k, r, [8]); // 8 von 15 = 53,3 % → 3
  const ts = [0, 1, 2, 3].map(() => termin(k, r, '.'));
  ts.forEach((t) => mitarbeit(k, t, 1)); // Ø 1 → Grundnote 4
  haken(k, ts[0], 0); haken(k, ts[1], 0); // Aufwertung 1/3 → 3,6667. Gewünscht: 1,6667 → anders erzeugen
  r.werte[k.schueler[0].id].mitarbeitNote = { wert: 1.6667, begruendung: 'Testfall' };
  r.werte[k.schueler[0].id].verhalten = 2;
  const e = erg(k, r);
  assert.equal(e.pruefung.note, 3);
  nah(e.wert, (0.6 * 3 + 0.4 * 1.6667 + 0.2 * 2) / 1.2, 1e-9);
  nah(e.wert, 2.3889);
});

test('Verhalten mit Gewicht 0 wirkt nicht; leere Teilleistung verteilt ihr Gewicht', () => {
  const k = sportKlasse();
  const r = reihe(k, 'X', { pruefung: 0.5, mit: 0.5, verhalten: 0 });
  teile(r, 1);
  summen(k, r, [15]);
  r.werte[k.schueler[0].id].verhalten = 5;
  assert.equal(erg(k, r).wert, 1, 'nur Prüfung, Mitarbeit leer, Verhalten Gewicht 0');
});

test('Ultimate: Rückhand 15, Vorhand 6 → 21 von 30 = 70 % → 2; Spiel 3; Gewichte 1/1/0 → Reihenwert 2,5 → Reihennote 2', () => {
  const k = sportKlasse();
  const r = reihe(k, 'Ultimate Frisbee', { pruefung: 1, mit: 0 });
  teile(r, 2);
  r.direkte = [{ id: neueId(), name: 'Spiel', gewicht: 1, stufen: [] }];
  summen(k, r, [15, 6]);
  r.werte[k.schueler[0].id].direkt = { [r.direkte[0].id]: 3 };
  [1, 2, 3, 4].forEach(() => termin(k, r, '.'));
  const e = erg(k, r);
  assert.equal(e.pruefung.prozent, 70);
  assert.equal(e.pruefung.note, 2);
  assert.equal(e.wert, 2.5);
  assert.equal(e.note, 2);
  assert.equal(doppelBewertungHinweis(r), '');
  r.gewichte.mitarbeit = 0.5;
  assert.match(doppelBewertungHinweis(r), /doppelt bewertet/);
});

// ---------- Halbjahr, Endnote ----------

function beispielHalbjahr() {
  const k = sportKlasse();
  const v = reihe(k, 'Volleyball');
  teile(v, 3);
  summen(k, v, [12, 10, 8]);
  const tv = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => termin(k, v, i === 4 ? 'E' : '.'));
  mitarbeit(k, tv[0], 3);
  haken(k, tv[1], 0); haken(k, tv[2], 0);
  const b = reihe(k, 'Badminton', { pruefung: 0.6, mit: 0.4 });
  teile(b, 5);
  summen(k, b, [10, 9, 8, 7, 6]);
  const tb = [0, 1, 2, 3, 4].map(() => termin(k, b, '.'));
  mitarbeit(k, tb[0], 3); mitarbeit(k, tb[1], 2); mitarbeit(k, tb[2], 2); mitarbeit(k, tb[3], 3); mitarbeit(k, tb[4], 2); // Ø 2,4
  haken(k, tb[0], 0); haken(k, tb[1], 0);
  return { k, v, b };
}

test('Badminton: Prüfung 3, Ø 2,4 → 2; ein Merkmal → 1,6667; Reihenwert 0,6 × 3 + 0,4 × 1,6667 = 2,4667 → 2', () => {
  const { k, b } = beispielHalbjahr();
  const e = erg(k, b);
  nah(e.mitarbeit.mittel, 2.4);
  assert.equal(e.mitarbeit.grundnote, 2);
  nah(e.mitarbeit.note, 1.6667);
  nah(e.wert, 2.4667);
  assert.equal(e.note, 2);
});

test('Halbjahr Volleyball + Badminton: Ø Wert (2,3333 + 2,4667)/2 = 2,4 → 2; Ø Note (2 + 2)/2 = 2', () => {
  const { k } = beispielHalbjahr();
  const g = gesamtSport(k, k.schueler[0].id, EIN);
  nah(g.oWert, 2.4);
  assert.equal(g.oNote, 2);
  const { ergebnis } = endnotenKlasse(k, k.schueler, EIN);
  assert.equal(ergebnis.get(k.schueler[0].id).endnote, 2);
});

test('Reihen-Gewichte der Gesamtnote (Standard 1) und Reihe ohne Wert zählt nicht', () => {
  const { k, v } = beispielHalbjahr();
  v.gewichtReihe = 3;
  const g = gesamtSport(k, k.schueler[0].id, EIN);
  nah(g.oWert, (3 * 2.3333 + 2.4667) / 4);
  const leer = reihe(k, 'Leer');
  assert.equal(erg(k, leer).wert, null);
  nah(gesamtSport(k, k.schueler[0].id, EIN).oWert, (3 * 2.3333 + 2.4667) / 4);
});

test('Endnote-Variante: Klasse mit zwei Personen, die Variante mit kleinerem Klassendurchschnitt wird gewählt', () => {
  const k = sportKlasse(2);
  const r1 = reihe(k, 'R1', { pruefung: 1, mit: 0 });
  const r2 = reihe(k, 'R2', { pruefung: 1, mit: 0 });
  const r3 = reihe(k, 'R3', { pruefung: 1, mit: 0 });
  for (const r of [r1, r2, r3]) { teile(r, 1); }
  // Person 1: Reihennoten 1, 1, 5 → Ø Note 2,33 → 2; Ø Wert ebenfalls 2,33 → 2 (gleich)
  // Wir steuern über direkte Teilleistungen: Reihenwert 1,4 / 1,4 / 4,4 → Ø Wert 2,4 → 2; Reihennoten 1, 1, 4 → Ø Note 2,0 → 2
  // Besser: Person 1 Reihenwerte 2,6 / 2,6 / 2,6 → Reihennoten 3 → beide Varianten 3; Person 2: 1,6 / 1,6 / 4,6 → Wert 2,6 → 3; Noten 2, 2, 5 → Ø 3 → 3
  // Verschiedene Ergebnisse: Person 2: 1,6 / 1,6 / 3,5 → Ø Wert 2,2333 → 2; Noten 2, 2, 3 → Ø 2,3333 → 2 … daher Person 2: Werte 2,6 / 2,6 / 1,0 → Ø Wert 2,0667 → 2; Noten 3, 3, 1 → Ø 2,3333 → 2.
  // Einfacher: direkte Noten setzen und beide Varianten per Hand prüfen.
  const setze = (r, i, wert) => { r.direkte = r.direkte.length ? r.direkte : [{ id: 'd' + r.id, name: 'Note', gewicht: 1, stufen: [] }]; r.gewichte = { pruefung: 0, mitarbeit: 0, verhalten: 0 }; (r.werte[k.schueler[i].id] ||= {}).direkt = { [r.direkte[0].id]: wert }; };
  // Person 1: 2,6 / 2,6 / 2,6 → Reihennoten 3/3/3, Ø Wert 2,6 → 3, Ø Note 3 → 3
  [r1, r2, r3].forEach((r) => setze(r, 0, 2.6));
  // Person 2: 2,5 / 2,5 / 3,4 → Reihennoten 2/2/3 (Ø Note 2,3333 → 2); Ø Wert 2,8 → 3
  setze(r1, 1, 2.5); setze(r2, 1, 2.5); setze(r3, 1, 3.4);
  const wert = endnotenKlasse({ ...k, sport: { ...k.sport, endnoteVariante: 'wert' } }, k.schueler, EIN);
  const note = endnotenKlasse({ ...k, sport: { ...k.sport, endnoteVariante: 'note' } }, k.schueler, EIN);
  assert.deepEqual(k.schueler.map((s) => wert.ergebnis.get(s.id).endnote), [3, 3]);
  assert.deepEqual(k.schueler.map((s) => note.ergebnis.get(s.id).endnote), [3, 2]);
  const besser = endnotenKlasse(k, k.schueler, EIN);
  assert.equal(besser.variante, 'note', 'Ø der Endnoten 2,5 (Note) < 3,0 (Wert)');
  assert.deepEqual(k.schueler.map((s) => besser.ergebnis.get(s.id).endnote), [3, 2]);
  // Gleichstand → Ø Wert
  k.sport.endnoten = {};
  [r1, r2, r3].forEach((r) => setze(r, 1, 2.6));
  assert.equal(endnotenKlasse(k, k.schueler, EIN).variante, 'wert');
});

test('Endnote festsetzen hat Vorrang und zeigt „festgesetzt“', () => {
  const { k } = beispielHalbjahr();
  k.sport.endnoten[k.schueler[0].id] = { wert: 1, begruendung: 'Sonderleistung' };
  const e = endnotenKlasse(k, k.schueler, EIN).ergebnis.get(k.schueler[0].id);
  assert.equal(e.berechnet, 2);
  assert.equal(e.endnote, 1);
  assert.equal(e.festgesetzt.begruendung, 'Sonderleistung');
});

test('Ganzes Schuljahr: Halbjahreswerte und Jahreswert als Mittelwert der Halbjahre', () => {
  const k = sportKlasse();
  k.sport.zeitraum = 'jahr';
  const a = reihe(k, 'A', { pruefung: 1, mit: 0 });
  const b = reihe(k, 'B', { pruefung: 1, mit: 0 });
  b.halbjahr = 2;
  for (const [r, v] of [[a, 15], [b, 6]]) { teile(r, 1); summen(k, r, [v]); }
  const g = gesamtSport(k, k.schueler[0].id, EIN);
  assert.equal(g.halbjahre[0].oWert, 1);
  assert.equal(g.halbjahre[1].oWert, 3); // 6 von 15 = 40 %: genau auf der Kante, ab 40 → 3
  assert.equal(g.oWert, 2); // Mittelwert der Halbjahre (1 + 3) / 2
  assert.equal(g.oNote, 2);
});

// ---------- Punkte, Einstellungen ----------

test('Punkte (BG): Mitarbeitsnote darf unter 1,0 sinken (bis 15 Punkte)', () => {
  const k = sportKlasse();
  k.sport.notensystem = 'punkte';
  const r = reihe(k, 'X');
  const ts = Array.from({ length: 4 }, () => termin(k, r, '.'));
  ts.forEach((t) => mitarbeit(k, t, 3));
  for (const m of [0, 1, 2]) { haken(k, ts[0], m); haken(k, ts[1], m); }
  const m = mitarbeitReihe(k, r, k.schueler[0].id, EIN);
  assert.equal(m.grundnote, 1);
  nah(m.aufwertung, 1);
  nah(m.note, 2 / 3);
  assert.equal(punkte(m.note, EIN), 15);
});

test('Einstellungen ändern: Zwei-Grenze von 58 auf 65 % → 66,7 % bleibt 2, 64,4 % wird 3; Warnung zählt betroffene Noten', () => {
  const k = sportKlasse(2);
  const r = reihe(k, 'Volleyball', { pruefung: 1, mit: 0 });
  teile(r, 3);
  summen(k, r, [12, 10, 8], 0);
  summen(k, r, [10, 10, 9], 1);
  const buch = neuesBuch(k);
  const neu = { ...EIN, pruefschluessel: [83, 65, 40, 25, 10] };
  assert.equal(pruefungReihe(k, r, k.schueler[0].id, neu).note, 2);
  assert.equal(pruefungReihe(k, r, k.schueler[1].id, neu).note, 3);
  assert.equal(pruefungReihe(k, r, k.schueler[1].id, EIN).note, 2);
  const z = aenderungenZaehlen(buch, EIN, neu);
  assert.equal(z.geaendert, 1);
  assert.equal(z.mitWerten, 2);
});

test('Einstellungen kommen aus dem Notenbuch und haben Standardwerte', () => {
  const buch = neuesBuch(sportKlasse());
  const e = einstellungenAus(buch);
  assert.deepEqual(e.pruefschluessel, [83, 58, 40, 25, 10]);
  assert.deepEqual(e.mitarbeitsTabelle, [2.8, 2.4, 1.7, 1.0, 0.4]);
  assert.equal(e.standardwert, 2);
  assert.equal(e.mindestTermine, 3);
  assert.equal(e.offenZaehltNull, true);
  assert.deepEqual(e.pruefungstagKennzeichen, ['T', 'P']);
  assert.equal(einstellungenAus(null).standardwert, 2);
});

// ---------- Datei, Kopie, Regression ----------

test('Sport-Klasse übersteht Speichern und Öffnen (mit und ohne Passwort) unverändert', async () => {
  const { k } = beispielHalbjahr();
  const buch = neuesBuch(k);
  for (const pw of ['', 'sport-pw']) {
    const zurueck = await ausDateitext(await inDateitext(buch, pw), pw);
    assert.deepEqual(zurueck, buch);
    const g = gesamtSport(zurueck.klassen[0], zurueck.klassen[0].schueler[0].id, einstellungenAus(zurueck));
    nah(g.oWert, 2.4);
  }
});

test('Alte Dateien ohne Sport-Felder werden ergänzt; Lernfeld-Klassen bleiben Lernfeld', () => {
  const alt = neuesBuch(neueKlasse({ klasse: 'ALT' }));
  const k = alt.klassen[0];
  delete k.fachtyp;
  delete k.sport;
  delete alt.einstellungen.sport;
  const neu = pruefeBuch(JSON.parse(JSON.stringify(alt)));
  assert.equal(neu.klassen[0].fachtyp, 'lernfeld');
  assert.deepEqual(neu.klassen[0].sport.reihen, []);
  assert.equal(neu.einstellungen.sport.standardwert, 2);
});

test('Sport-Klasse kopieren: Reihen-Definitionen bleiben, Termine und Werte nicht', () => {
  const { k, v } = beispielHalbjahr();
  v.merkmaleTexte = ['a', 'b', 'c'];
  const kopie = klasseKopieren(k);
  assert.equal(kopie.fachtyp, 'sport');
  assert.equal(kopie.sport.reihen.length, 2);
  assert.equal(kopie.sport.reihen[0].teile.length, 3);
  assert.deepEqual(kopie.sport.reihen[0].merkmaleTexte, ['a', 'b', 'c']);
  assert.deepEqual(kopie.sport.reihen[0].werte, {});
  assert.deepEqual(kopie.sport.termine, []);
  assert.deepEqual(kopie.sport.anwesenheit, {});
  assert.equal(k.sport.termine.length > 0, true, 'Original unverändert');
});
