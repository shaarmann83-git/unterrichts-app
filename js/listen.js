// Eigene Listen (SPEC 8.14): Strichliste, Abhakliste, Betragsliste. Fließen nicht in Noten ein.
import { neueId, neueListe } from './modell.js';

export const LISTEN_ARTEN = { strich: 'Strichliste', abhak: 'Abhakliste', betrag: 'Betragsliste' };

export function listeAnlegen(klasse, name, art) {
  const l = neueListe(name, art);
  klasse.listen.push(l);
  return l;
}

const eintraege = (liste, sid) => (liste.eintraege[sid] ||= []);

// --- Strichliste ---
export function strichHinzu(liste, sid, datum) {
  eintraege(liste, sid).push({ id: neueId(), datum, n: 1 });
}
/** Nimmt den letzten Strich zurück. Gibt true zurück, wenn einer entfernt wurde. */
export function strichZurueck(liste, sid) {
  const e = eintraege(liste, sid);
  if (e.length === 0) return false;
  e.pop();
  return true;
}
export const strichSumme = (liste, sid) => (liste.eintraege[sid] || []).reduce((s, e) => s + (e.n ?? 1), 0);

// --- Abhakliste ---
export const abhakErledigt = (liste, sid) => (liste.eintraege[sid] || []).length > 0;
export function abhakSetzen(liste, sid, erledigt, datum) {
  liste.eintraege[sid] = erledigt ? [{ id: neueId(), datum, erledigt: true }] : [];
}
export const abhakDatum = (liste, sid) => liste.eintraege[sid]?.[0]?.datum || '';
/** Personen, bei denen der Haken noch fehlt. */
export const abhakFehlend = (liste, personen) => personen.filter((p) => !abhakErledigt(liste, p.id));

// --- Betragsliste (in ganzen Cent gerechnet, damit 0,1 + 0,2 genau 0,30 ergibt) ---
const cent = (euro) => Math.round(Number(euro) * 100 + (euro >= 0 ? 1e-9 : -1e-9));
export const betragSoll = (liste, sid) => liste.sollJe?.[sid] ?? liste.soll ?? 0;
export const betragGezahlt = (liste, sid) => (liste.eintraege[sid] || []).reduce((s, e) => s + cent(e.betrag), 0) / 100;
export const betragRest = (liste, sid) => (cent(betragSoll(liste, sid)) - cent(betragGezahlt(liste, sid))) / 100;
export function zahlungHinzu(liste, sid, betrag, datum) {
  eintraege(liste, sid).push({ id: neueId(), datum, betrag });
}
export function zahlungLoeschen(liste, sid, id) {
  liste.eintraege[sid] = eintraege(liste, sid).filter((e) => e.id !== id);
}
export function betragSummen(liste, personen) {
  let soll = 0;
  let gezahlt = 0;
  for (const p of personen) {
    soll += cent(betragSoll(liste, p.id));
    gezahlt += cent(betragGezahlt(liste, p.id));
  }
  return { soll: soll / 100, gezahlt: gezahlt / 100, rest: (soll - gezahlt) / 100 };
}

export const sichtbareListen = (klasse) => klasse.listen.filter((l) => !l.ausgeblendet);
