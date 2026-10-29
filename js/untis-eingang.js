// Import-Automatik für Untis-Berichte (SPEC 8.6): neue Dateien in einem Ordner finden und abgleichen.
// Der Ordner steckt hinter einer Schnittstelle, damit Tests ohne echten Ordner laufen:
//   ordner.liste()  -> Promise<[{ name, geaendert (ms), lesen(): Promise<ArrayBuffer> }]>
//   ordner.verarbeitet?(name), ordner.loeschen?(name)   (optional)
import { tabelleAusDatei } from './tabelle-datei.js';
import { formatErkennen, zeilenAusA, zeilenAusB, importPlanen, importAnwenden, aufKlassenVerteilen, pruefsumme, zeitstempelAusName } from './untis.js';

/** 'A' (AbsencePerStudent), 'B' (AbsenceList) oder null nach dem Dateinamen. */
export function dateiTyp(name) {
  if (/^AbsenceList.*\.(xls|xlsx)$/i.test(name)) return 'B';
  if (/^AbsencePerStudent.*\.(xls|xlsx)$/i.test(name)) return 'A';
  return null;
}

// Sortierbarer Stand (17 Ziffern): Zeitstempel im Dateinamen, sonst Änderungsdatum der Datei.
const stand = (d) => (zeitstempelAusName(d.name) || new Date(d.geaendert || 0).toISOString().replace(/\D/g, '')).padEnd(17, '0');

/**
 * Sucht neue Untis-Dateien. Von mehreren Dateien gleichen Typs zählt nur die neueste;
 * ist deren Prüfsumme schon verarbeitet, ist nichts neu.
 * Rückgabe: { neu: [{typ, name, bytes, pruefsumme, stand}], bekannt: [names], aeltere: [names] }
 */
export async function neueDateien(ordner, buch, { optionalA = true } = {}) {
  const alle = (await ordner.liste()).filter((d) => dateiTyp(d.name));
  const verarbeitet = new Set((buch.einstellungen?.untisDateien || []).map((x) => x.pruefsumme));
  const ergebnis = { neu: [], bekannt: [], aeltere: [] };
  for (const typ of ['B', 'A']) {
    if (typ === 'A' && !optionalA) continue;
    const gruppe = alle.filter((d) => dateiTyp(d.name) === typ).sort((a, b) => (stand(a) < stand(b) ? 1 : stand(a) > stand(b) ? -1 : 0));
    if (gruppe.length === 0) continue;
    const [neueste, ...rest] = gruppe;
    ergebnis.aeltere.push(...rest.map((d) => d.name));
    const bytes = await neueste.lesen();
    const summe = await pruefsumme(bytes);
    if (verarbeitet.has(summe)) ergebnis.bekannt.push(neueste.name);
    else ergebnis.neu.push({ typ, name: neueste.name, bytes, pruefsumme: summe, stand: stand(neueste) });
  }
  return ergebnis;
}

/** Datei einlesen: Format an der Kopfzeile erkennen, nicht am Namen. */
export function dateiLesen(bytes, name) {
  const roh = tabelleAusDatei(bytes, name);
  const format = formatErkennen(roh);
  if (format === 'A') return { format, roh, zeilen: zeilenAusA(roh) };
  if (format === 'B') return { format, roh, zeilen: zeilenAusB(roh) };
  return { format: null, roh, zeilen: [] };
}

/**
 * Plant den Abgleich aller Dateien für alle passenden Klassen des Notenbuchs, ohne etwas zu verändern.
 * `dateien`: [{name, pruefsumme, bytes}]. `optionen`: Map(klassenId -> {faecher, manuell}).
 * Rückgabe: { klassen: [{klasse, plan}], unbekannteKlassen, nichtErkannt: [names], dateien }.
 */
export function abgleichPlanen(buch, dateien, optionen = new Map()) {
  const gelesen = [];
  const nichtErkannt = [];
  for (const d of dateien) {
    const g = dateiLesen(d.bytes, d.name);
    if (!g.format) nichtErkannt.push(d.name);
    else gelesen.push({ ...g, name: d.name, pruefsumme: d.pruefsumme });
  }
  const proKlasse = new Map(); // klassenId -> {a: [], b: []}
  const unbekannt = new Set();
  for (const g of gelesen) {
    const { proKlasse: verteilt, unbekannt: fremd } = aufKlassenVerteilen(buch, g.zeilen);
    fremd.forEach((k) => unbekannt.add(k));
    for (const [id, zeilen] of verteilt) {
      if (!proKlasse.has(id)) proKlasse.set(id, { a: [], b: [] });
      proKlasse.get(id)[g.format === 'A' ? 'a' : 'b'].push(...zeilen);
    }
  }
  const klassen = [];
  for (const [id, eingabe] of proKlasse) {
    const klasse = buch.klassen.find((k) => k.id === id);
    const opt = optionen.get(id) || { faecher: klasse.untis?.faecher || [], manuell: new Map() };
    klassen.push({ klasse, plan: importPlanen(klasse, eingabe, { faecher: opt.faecher.length ? opt.faecher : klasse.untis?.faecher || [], manuell: opt.manuell }) });
  }
  return { klassen, unbekannteKlassen: [...unbekannt], nichtErkannt, dateien: gelesen.map((g) => ({ name: g.name, pruefsumme: g.pruefsumme, format: g.format })) };
}

/** Wendet den Plan an und merkt sich die Dateien als verarbeitet. Gibt die Zahlen je Klasse zurück. */
export function abgleichAnwenden(buch, ergebnis, jetzt = new Date()) {
  const zusammen = [];
  for (const { klasse, plan } of ergebnis.klassen) {
    importAnwenden(klasse, plan);
    zusammen.push({ klasse: klasse.kopf.klasse, neu: plan.neu.length, geaendert: plan.geaendert.length, weggefallen: plan.weggefallen.length });
  }
  buch.einstellungen.untisDateien ||= [];
  for (const d of ergebnis.dateien) {
    if (!buch.einstellungen.untisDateien.some((x) => x.pruefsumme === d.pruefsumme)) {
      buch.einstellungen.untisDateien.push({ pruefsumme: d.pruefsumme, name: d.name, zeit: jetzt.toISOString() });
    }
  }
  buch.einstellungen.untisDateien = buch.einstellungen.untisDateien.slice(-50);
  return zusammen;
}

/** Ordner-Attrappe für Tests und die Teilen-Ablage: Dateien aus dem Speicher. */
export function speicherOrdner(dateien) {
  const geloescht = [];
  const verschoben = [];
  return {
    geloescht,
    verschoben,
    async liste() {
      return dateien.filter((d) => !geloescht.includes(d.name) && !verschoben.includes(d.name)).map((d) => ({ name: d.name, geaendert: d.geaendert || 0, lesen: async () => d.bytes }));
    },
    async verarbeitet(name) {
      verschoben.push(name);
    },
    async loeschen(name) {
      geloescht.push(name);
    },
  };
}
