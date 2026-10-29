// Aktionen mit der Notendatei: neu, öffnen, speichern, schließen, Passwort, Excel-Import.
import { K } from './kontext.js';
import { neueDaten, dateiname, datumDeutsch } from './modell.js';
import { inDateitext, ausDateitext, istVerschluesselt } from './krypto.js';
import {
  dateiOeffnen,
  dateiAlsBytes,
  dateiSpeichern,
  arbeitskopie,
  arbeitskopieSpeichern,
  arbeitskopieLoeschen,
  einstellungen,
} from './speicher.js';
import { importiereVorlage } from './excel.js';
import { h, meldung, bestaetigen, passwortFrage, auswahl, inhaltDialog, toast } from './ui.js';

export function setzeDokument(daten, { passwort = '', handle = null, name = '', geaendert = false, ziel = 'gesamt' } = {}) {
  K.daten = daten;
  K.passwort = passwort;
  K.handle = handle;
  K.dateiname = name;
  K.geaendert = geaendert;
  K.statusAktualisieren?.();
  K.navigiere(ziel);
  // Arbeitskopie sofort anlegen, damit „zuletzt geöffnet“ stimmt.
  arbeitskopieSpeichern(daten, name, geaendert).catch(() => {});
}

export async function neueDateiAnlegen() {
  const feld = (beschriftung, wert = '', platzhalter = '') =>
    h('label', {}, beschriftung, h('input', { type: 'text', value: wert, placeholder: platzhalter }));
  const klasse = feld('Klasse', '', 'z. B. FIA 25');
  const nr = feld('Lernfeld-Nr.', '', 'z. B. 3');
  const bez = feld('Lernfeld-Bezeichnung');
  const jahr = feld('Schuljahr', '', 'z. B. 2025/26');
  const eingaben = [klasse, nr, bez, jahr];
  const ok = await inhaltDialog('Neue Notendatei', eingaben, [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: 'Anlegen', wert: true, klasse: 'knopf primaer' },
  ]);
  if (!ok) return;
  const [k, n, b, j] = eingaben.map((l) => l.querySelector('input').value.trim());
  const daten = neueDaten({ klasse: k, lernfeldNr: n, lernfeldBez: b, schuljahr: j });
  setzeDokument(daten, { ziel: 'grunddaten', geaendert: true, name: dateiname(daten) });
}

export async function dateiTextLaden(text, name, handle) {
  let daten;
  let passwort = '';
  try {
    if (istVerschluesselt(text)) {
      for (;;) {
        const pw = await passwortFrage('Passwort eingeben', { hinweis: `Die Datei „${name}“ ist passwortgeschützt.` });
        if (pw === null) return false;
        try {
          daten = await ausDateitext(text, pw);
          passwort = pw;
          break;
        } catch (e) {
          await meldung('Öffnen nicht möglich', e.message);
        }
      }
    } else {
      daten = await ausDateitext(text, '');
    }
  } catch (e) {
    await meldung('Öffnen nicht möglich', e.message);
    return false;
  }
  let geaendert = false;
  const kopie = await arbeitskopie(daten.dokumentId).catch(() => null);
  if (kopie && kopie.geaendert && kopie.zeit > (daten.gespeichertAm || '')) {
    const stand = new Date(kopie.zeit).toLocaleString('de-DE');
    const wahl = await auswahl(
      'Ungespeicherte Änderungen gefunden',
      `Auf diesem Gerät gibt es eine neuere Arbeitskopie (Stand ${stand}), die noch nicht in der Notendatei gespeichert wurde. Welche Version möchten Sie öffnen?`,
      [
        { text: 'Datei wie gespeichert', wert: 'datei' },
        { text: 'Neuere Arbeitskopie', wert: 'kopie', klasse: 'knopf primaer' },
      ],
    );
    if (wahl === 'kopie') {
      daten = kopie.daten;
      geaendert = true;
    }
  }
  setzeDokument(daten, { passwort, handle, name, geaendert });
  return true;
}

export async function dateiOeffnenAktion() {
  if (!(await verwerfenErlaubt())) return;
  try {
    const d = await dateiOeffnen();
    if (d) await dateiTextLaden(d.text, d.name, d.handle);
  } catch (e) {
    await meldung('Öffnen nicht möglich', e.message);
  }
}

export async function arbeitskopieOeffnen(id) {
  if (!(await verwerfenErlaubt())) return;
  const kopie = await arbeitskopie(id).catch(() => null);
  if (!kopie) return meldung('Nicht gefunden', 'Die lokale Arbeitskopie existiert nicht mehr.');
  setzeDokument(kopie.daten, { name: kopie.dateiname, geaendert: !!kopie.geaendert });
}

export async function speichern({ neuWaehlen = false } = {}) {
  if (!K.daten) return false;
  const vorher = K.daten.gespeichertAm;
  K.daten.gespeichertAm = new Date().toISOString();
  try {
    const text = await inDateitext(K.daten, K.passwort);
    const erg = await dateiSpeichern(text, {
      handle: K.handle,
      name: K.dateiname || dateiname(K.daten),
      neuWaehlen,
    });
    if (!erg) {
      K.daten.gespeichertAm = vorher;
      return false;
    }
    K.handle = erg.handle;
    K.dateiname = erg.name;
    K.geaendert = false;
    K.statusAktualisieren?.();
    arbeitskopieSpeichern(K.daten, K.dateiname, false).catch(() => {});
    toast(erg.direkt ? `Gespeichert: ${erg.name}` : `Heruntergeladen: ${erg.name}. Bitte an geschütztem Ort ablegen.`);
    return true;
  } catch (e) {
    K.daten.gespeichertAm = vorher;
    await meldung('Speichern nicht möglich', e.message);
    return false;
  }
}

async function verwerfenErlaubt() {
  if (!K.daten || !K.geaendert) return true;
  return bestaetigen(
    'Ungespeicherte Änderungen',
    'Die Notendatei hat Änderungen, die noch nicht gespeichert sind. Trotzdem schließen?',
    'Ohne Speichern schließen',
    true,
  );
}

export async function dateiSchliessen() {
  if (!K.daten) return;
  if (!(await verwerfenErlaubt())) return;
  if (einstellungen().keineDatenBehalten) await arbeitskopieLoeschen(K.daten.dokumentId).catch(() => {});
  K.daten = null;
  K.passwort = '';
  K.handle = null;
  K.dateiname = '';
  K.geaendert = false;
  K.statusAktualisieren?.();
  K.navigiere('start');
}

export async function passwortSetzen() {
  const pw = await passwortFrage(K.passwort ? 'Passwort ändern' : 'Passwort setzen', { neu: true });
  if (pw === null) return;
  K.passwort = pw;
  K.aenderung();
  toast('Passwort gesetzt. Es gilt ab dem nächsten Speichern.');
}

export async function passwortEntfernen() {
  const ja = await bestaetigen(
    'Passwortschutz entfernen',
    'Die Notendatei wird danach unverschlüsselt gespeichert. Namen und Noten wären dann für jeden lesbar, der die Datei findet.',
    'Passwort entfernen',
    true,
  );
  if (!ja) return;
  K.passwort = '';
  K.aenderung();
}

export async function excelImportieren() {
  if (!(await verwerfenErlaubt())) return;
  let d;
  try {
    d = await dateiAlsBytes('.xlsx');
    if (!d) return;
    const { daten, vorschau } = importiereVorlage(d.text);
    const zeilen = [
      ['Klasse', vorschau.klasse || '(leer)'],
      ['Lernfeld', vorschau.lernfeld || '(leer)'],
      ['Schuljahr', vorschau.schuljahr || '(leer)'],
      ['Gewichtung schriftlich', `${vorschau.gewichtSchriftlich} %`],
      ['Schüler:innen', String(vorschau.schueler)],
      [
        'Klassenarbeiten',
        vorschau.klassenarbeiten.length
          ? vorschau.klassenarbeiten
              .map((k) => `KA ${k.nr}: ${k.aufgaben} Aufgaben, ${k.punkte} Punktwerte${k.datum ? `, ${datumDeutsch(k.datum)}` : ''}`)
              .join(' | ')
          : 'keine',
      ],
      ['Sonstige Leistungen', `${vorschau.termine} Termine (${vorschau.termineUebersprungen} leere Spalten übersprungen)`],
    ];
    const tabelle = h(
      'table',
      { class: 'vorschau' },
      zeilen.map(([a, b]) => h('tr', {}, h('th', {}, a), h('td', {}, b))),
    );
    const ok = await inhaltDialog('Import: Das wird übernommen', [tabelle, h('p', {}, 'Die Excel-Datei selbst wird nicht verändert.')], [
      { text: 'Abbrechen', wert: false, abbruch: true },
      { text: 'Übernehmen', wert: true, klasse: 'knopf primaer' },
    ]);
    if (!ok) return;
    setzeDokument(daten, { geaendert: true, name: dateiname(daten) });
  } catch (e) {
    await meldung('Import nicht möglich', e.message);
  }
}
