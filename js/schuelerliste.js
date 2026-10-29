// Schülerliste importieren (SPEC 8.12): Zeilen -> Personen, Vergleich mit der vorhandenen Klasse.
import { neuerSchueler } from './modell.js';
import { normName, spaltenRaten, datumIso, zelle } from './tabelle.js';

export const SCHUELER_FELDER = [
  { id: 'name', text: 'Name (Nachname)' },
  { id: 'vorname', text: 'Vorname' },
  { id: 'namevorname', text: 'Name, Vorname (eine Spalte)' },
  { id: 'geburtstag', text: 'Geburtstag' },
  { id: 'geschlecht', text: 'Geschlecht (m/w/d)' },
  { id: 'betrieb', text: 'Ausbildungsbetrieb' },
  { id: 'untisId', text: 'Untis-ID' },
];

const REGELN = {
  name: ['name', 'nachname', 'langname', 'familienname'],
  vorname: ['vorname', 'rufname'],
  namevorname: ['schülerinnen', 'schüler', 'schülerin', 'name, vorname', 'schülername'],
  geburtstag: ['geburtstag', 'geburtsdatum', 'geb', 'geb datum'],
  geschlecht: ['geschlecht', 'm/w/d', 'm/w'],
  betrieb: ['betrieb', 'ausbildungsbetrieb', 'firma'],
  untisId: ['id', 'externe id', 'untis-id', 'untis id', 'schüler-id'],
};

export function schuelerSpaltenRaten(kopf) {
  const z = spaltenRaten(kopf, REGELN);
  if (z.name !== undefined && z.namevorname !== undefined) delete z.namevorname;
  return z;
}

/** Eine Zelle „Name, Vorname“ oder „Name Vorname“ trennen. Mit Komma ist die Trennung eindeutig. */
export function nameTrennen(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (t.includes(',')) {
    const [n, ...rest] = t.split(',');
    return { name: n.trim(), vorname: rest.join(',').trim() };
  }
  const teile = t.split(' ');
  if (teile.length < 2) return { name: t, vorname: '' };
  return { name: teile[0], vorname: teile.slice(1).join(' ') };
}

function geschlechtNorm(t) {
  const g = String(t || '').trim().toLowerCase();
  if (['m', 'männlich', 'maennlich'].includes(g)) return 'm';
  if (['w', 'weiblich'].includes(g)) return 'w';
  if (['d', 'divers'].includes(g)) return 'd';
  return '';
}

/** Zeilen (ohne Kopfzeile) und Zuordnung -> Liste von Personen-Entwürfen. */
export function schuelerAusZeilen(zeilen, zuordnung) {
  const wert = (z, f) => (zuordnung[f] === undefined || zuordnung[f] === '' ? '' : z[zuordnung[f]]);
  const ergebnis = [];
  for (const z of zeilen) {
    let name = zelle(wert(z, 'name'));
    let vorname = zelle(wert(z, 'vorname'));
    if (!name && !vorname && zuordnung.namevorname !== undefined) {
      ({ name, vorname } = nameTrennen(zelle(wert(z, 'namevorname'))));
    }
    if (!name && !vorname) continue;
    ergebnis.push({
      name,
      vorname,
      geburtstag: datumIso(wert(z, 'geburtstag')),
      geschlecht: geschlechtNorm(zelle(wert(z, 'geschlecht'))),
      betrieb: zelle(wert(z, 'betrieb')),
      untisId: zelle(wert(z, 'untisId')),
    });
  }
  return ergebnis;
}

export function personSchluessel(p) {
  return `${normName(p.name)}|${normName(p.vorname)}`;
}

/** Vergleicht Entwürfe mit der Klasse: neu (anlegen) oder vorhanden (gleicher Name und Vorname, auch Archivierte). */
export function schuelerVergleichen(klasse, entwuerfe) {
  const vorhanden = new Set(klasse.schueler.filter((s) => s.name || s.vorname).map(personSchluessel));
  const gesehen = new Set();
  return entwuerfe.map((e) => {
    const k = personSchluessel(e);
    const schonDa = vorhanden.has(k) || gesehen.has(k);
    gesehen.add(k);
    return { ...e, vorhanden: schonDa };
  });
}

/** Legt die neuen Personen an (leere Zeilen der Klasse werden zuerst gefüllt). Gibt die Zahl der angelegten zurück. */
export function schuelerUebernehmen(klasse, vergleich) {
  let angelegt = 0;
  for (const e of vergleich) {
    if (e.vorhanden) continue;
    const leer = klasse.schueler.find((s) => !s.name && !s.vorname && !s.untisId);
    const s = leer || neuerSchueler();
    s.name = e.name;
    s.vorname = e.vorname;
    s.geburtstag = e.geburtstag || '';
    s.geschlecht = e.geschlecht || '';
    s.untisId = e.untisId || '';
    if (e.betrieb) s.betrieb = { ...s.betrieb, name: e.betrieb };
    if (!leer) klasse.schueler.push(s);
    angelegt += 1;
  }
  return angelegt;
}
