// Aktionen mit der Notendatei (Notenbuch): neu, öffnen, speichern, schließen, Passwort, Excel-Import, Sicherung.
import { K } from './kontext.js';
import { neuesBuch, dateiname, datumDeutsch, buchHatFotos, pruefeBuch } from './modell.js';
import { inDateitext, ausDateitext, istVerschluesselt, objektEntschluesseln, schluesselVergessen } from './krypto.js';
import {
  dateiOeffnen,
  dateiAlsBytes,
  dateiSpeichern,
  arbeitskopie,
  arbeitskopieSpeichern,
  arbeitskopieLoeschen,
  einstellungen,
  herunterladen,
} from './speicher.js';
import { importiereVorlage } from './excel.js';
import { letztesBildVergessen } from './foto.js';
import { h, meldung, bestaetigen, passwortFrage, auswahl, inhaltDialog, toast } from './ui.js';

export function setzeDokument(buch, { passwort = '', handle = null, name = '', geaendert = false, ziel = 'buch', klasseId = null, pruefen = true } = {}) {
  K.sync = null;
  K.buch = buch;
  K.klasseId = klasseId || null;
  K.passwort = passwort;
  K.handle = handle;
  K.dateiname = name;
  K.geaendert = geaendert;
  K.statusAktualisieren?.();
  K.navigiere(ziel);
  K.neuZeichnen();
  // Arbeitskopie sofort anlegen, damit „zuletzt geöffnet“ stimmt.
  arbeitskopieSpeichern(buch, name, geaendert, passwort).catch(() => {});
  if (pruefen) K.nachOeffnen?.();
}

export async function neueDateiAnlegen() {
  // Eine neue Notendatei ist zunächst ein leeres Notenbuch. Klassen legt man danach im Notenbuch an.
  const jahrFeld = h('label', {}, 'Schuljahr', h('input', { type: 'text', value: '', placeholder: 'z. B. 2026/27', 'aria-label': 'Schuljahr' }));
  const ok = await inhaltDialog('Neue Notendatei', [
    h('p', { class: 'klein' }, 'Die Notendatei ist ein Notenbuch für alle Klassen eines Schuljahres. Klassen legen Sie danach im Notenbuch an.'),
    jahrFeld,
  ], [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: 'Anlegen', wert: true, klasse: 'knopf primaer' },
  ]);
  if (!ok) return;
  const jahr = jahrFeld.querySelector('input').value.trim();
  const buch = neuesBuch(null, jahr);
  setzeDokument(buch, { ziel: 'buch', geaendert: true, name: dateiname(buch) });
}

export async function dateiTextLaden(text, name, handle) {
  let buch;
  let passwort = '';
  try {
    if (istVerschluesselt(text)) {
      for (;;) {
        const pw = await passwortFrage('Passwort eingeben', { hinweis: `Die Datei „${name}“ ist passwortgeschützt.` });
        if (pw === null) return false;
        try {
          buch = await ausDateitext(text, pw);
          passwort = pw;
          break;
        } catch (e) {
          await meldung('Öffnen nicht möglich', e.message);
        }
      }
    } else {
      buch = await ausDateitext(text, '');
    }
  } catch (e) {
    await meldung('Öffnen nicht möglich', e.message);
    return false;
  }
  let geaendert = false;
  const kopie = await arbeitskopie(buch.dokumentId).catch(() => null);
  if (kopie && kopie.geaendert && kopie.zeit > (buch.gespeichertAm || '')) {
    let kopieBuch = null;
    try {
      if (kopie.huelle) kopieBuch = pruefeBuch(await objektEntschluesseln(kopie.huelle, passwort));
      else if (kopie.daten) kopieBuch = pruefeBuch(kopie.daten);
    } catch {
      kopieBuch = null; // andere Verschlüsselung (z. B. anderes Passwort): Arbeitskopie nicht verwendbar
    }
    if (kopieBuch) {
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
        buch = kopieBuch;
        geaendert = true;
      }
    }
  }
  setzeDokument(buch, { passwort, handle, name, geaendert });
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
  let buch;
  let passwort = '';
  if (kopie.huelle) {
    for (;;) {
      const pw = await passwortFrage('Passwort eingeben', { hinweis: `Die lokale Arbeitskopie „${kopie.titel}“ ist verschlüsselt.` });
      if (pw === null) return;
      try {
        buch = pruefeBuch(await objektEntschluesseln(kopie.huelle, pw));
        passwort = pw;
        break;
      } catch (e) {
        await meldung('Öffnen nicht möglich', e.message);
      }
    }
  } else {
    buch = pruefeBuch(kopie.daten);
  }
  setzeDokument(buch, { passwort, name: kopie.dateiname, geaendert: !!kopie.geaendert });
}

/** Mit Fotos darf nie ohne Passwort gespeichert werden (SPEC 8.4/8.9). Fragt bei Bedarf nach einem Passwort. */
export async function passwortFuerFotosSicherstellen() {
  if (!K.buch || !buchHatFotos(K.buch) || K.passwort) return true;
  await meldung(
    'Passwort nötig',
    'Das Notenbuch enthält Fotos. Fotos dürfen nur in einer passwortgeschützten Notendatei gespeichert werden. Bitte setzen Sie jetzt ein Passwort.',
  );
  await passwortSetzen();
  return !!K.passwort;
}

export async function speichern({ neuWaehlen = false } = {}) {
  if (!K.buch) return false;
  if (!(await passwortFuerFotosSicherstellen())) return false;
  // Synchronisation eingeschaltet: Speichern geht nach OneDrive (verschlüsselt, mit Konfliktprüfung)
  if (K.sync && K.syncSpeichern && !neuWaehlen) return K.syncSpeichern();
  const vorher = K.buch.gespeichertAm;
  K.buch.gespeichertAm = new Date().toISOString();
  try {
    const text = await inDateitext(K.buch, K.passwort);
    const erg = await dateiSpeichern(text, {
      handle: K.handle,
      name: K.dateiname || dateiname(K.buch),
      neuWaehlen,
    });
    if (!erg) {
      K.buch.gespeichertAm = vorher;
      return false;
    }
    K.handle = erg.handle;
    K.dateiname = erg.name;
    K.geaendert = false;
    K.statusAktualisieren?.();
    arbeitskopieSpeichern(K.buch, K.dateiname, false, K.passwort).catch(() => {});
    K.nachSpeichern?.(text);
    toast(erg.direkt ? `Gespeichert: ${erg.name}` : `Heruntergeladen: ${erg.name}. Bitte an geschütztem Ort ablegen.`);
    return true;
  } catch (e) {
    K.buch.gespeichertAm = vorher;
    await meldung('Speichern nicht möglich', e.message);
    return false;
  }
}

/** Sicherung exportieren (SPEC 8.7): ganzes Notenbuch als Notendatei, mit oder ohne Passwort nach Wahl. */
export async function sicherungExportieren() {
  if (!K.buch) return;
  const hatFotos = buchHatFotos(K.buch);
  const wahl = await auswahl(
    'Sicherung exportieren',
    hatFotos
      ? 'Das Notenbuch enthält Fotos. Eine Sicherung mit Fotos wird nur mit Passwort exportiert.'
      : 'Mit Passwort wird die Sicherung verschlüsselt. Ohne Passwort ist sie für jeden lesbar, der die Datei findet.',
    [
      { text: 'Abbrechen', wert: null, abbruch: true },
      !hatFotos && { text: 'Ohne Passwort', wert: 'ohne' },
      { text: K.passwort ? 'Mit aktuellem Passwort' : 'Mit Passwort …', wert: 'mit', klasse: 'knopf primaer' },
    ].filter(Boolean),
  );
  if (!wahl) return;
  let pw = '';
  if (wahl === 'mit') {
    pw = K.passwort || (await passwortFrage('Passwort für die Sicherung', { neu: true }));
    if (!pw) return;
  }
  const text = await inDateitext(K.buch, pw);
  const name = dateiname(K.buch).replace(/\.noten$/, `_Sicherung_${new Date().toISOString().slice(0, 10)}.noten`);
  herunterladen(text, name, 'application/json');
  toast(`Sicherung heruntergeladen: ${name}`);
}

/** Sicherung importieren (SPEC 8.7): ersetzt den aktuellen Stand nach Rückfrage. */
export async function sicherungImportieren() {
  const d = await dateiOeffnen();
  if (!d) return;
  if (K.buch) {
    const ja = await bestaetigen(
      'Sicherung importieren',
      'Der aktuelle Stand des Notenbuchs wird vollständig durch die Sicherung ersetzt. Nicht gesicherte Änderungen gehen verloren.',
      'Ersetzen',
      true,
    );
    if (!ja) return;
  }
  K.geaendert = false; // Rückfrage oben hat das bereits geklärt
  await dateiTextLaden(d.text, d.name, null);
  if (K.buch) {
    K.geaendert = true;
    K.statusAktualisieren?.();
  }
}

async function verwerfenErlaubt() {
  if (!K.buch || !K.geaendert) return true;
  return bestaetigen(
    'Ungespeicherte Änderungen',
    'Die Notendatei hat Änderungen, die noch nicht gespeichert sind. Trotzdem schließen?',
    'Ohne Speichern schließen',
    true,
  );
}

export async function dateiSchliessen() {
  letztesBildVergessen();
  if (!K.buch) return;
  if (!(await verwerfenErlaubt())) return;
  if (einstellungen().keineDatenBehalten) await arbeitskopieLoeschen(K.buch.dokumentId).catch(() => {});
  K.buch = null;
  K.klasseId = null;
  K.passwort = '';
  K.handle = null;
  K.dateiname = '';
  K.geaendert = false;
  K.sync = null;
  schluesselVergessen();
  K.statusAktualisieren?.();
  K.navigiere('start');
  K.neuZeichnen();
}

export async function passwortSetzen() {
  const pw = await passwortFrage(K.passwort ? 'Passwort ändern' : 'Passwort setzen', { neu: true });
  if (pw === null) return;
  K.passwort = pw;
  K.aenderung();
  toast('Passwort gesetzt. Es gilt ab dem nächsten Speichern.');
}

export async function passwortEntfernen() {
  if (K.buch && buchHatFotos(K.buch)) {
    await meldung('Nicht möglich', 'Das Notenbuch enthält Fotos. Mit Fotos ist ein Passwort Pflicht. Löschen Sie zuerst alle Fotos.');
    return;
  }
  const ja = await bestaetigen(
    'Passwortschutz entfernen',
    'Die Notendatei wird danach unverschlüsselt gespeichert. Namen und Noten wären dann für jeden lesbar, der die Datei findet. Auch die lokale Arbeitskopie im Browser wäre danach ungeschützt.',
    'Passwort entfernen',
    true,
  );
  if (!ja) return;
  K.passwort = '';
  schluesselVergessen();
  K.aenderung();
}

/** Excel-Vorlage V4 importieren: legt eine neue Klasse im geöffneten Notenbuch an (SPEC 8.1). */
export async function excelImportieren() {
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
    const ziel = K.buch ? 'Es wird als neue Klasse im geöffneten Notenbuch angelegt.' : 'Es wird ein neues Notenbuch mit dieser Klasse angelegt.';
    const ok = await inhaltDialog('Import: Das wird übernommen', [tabelle, h('p', {}, `${ziel} Die Excel-Datei selbst wird nicht verändert.`)], [
      { text: 'Abbrechen', wert: false, abbruch: true },
      { text: 'Übernehmen', wert: true, klasse: 'knopf primaer' },
    ]);
    if (!ok) return;
    if (K.buch) {
      K.buch.klassen.push(daten);
      K.klasseId = daten.id;
      K.aenderung();
      K.navigiere('gesamt');
      K.neuZeichnen();
    } else {
      const buch = neuesBuch(daten);
      setzeDokument(buch, { geaendert: true, name: dateiname(buch), klasseId: daten.id, ziel: 'gesamt' });
    }
  } catch (e) {
    await meldung('Import nicht möglich', e.message);
  }
}
