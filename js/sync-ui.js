// Synchronisation im Programm (SPEC 8.8): Anmeldung, Öffnen aus OneDrive, Speichern mit Konfliktabfrage, Autosave, Offline.
import { K } from './kontext.js';
import { einstellungen } from './speicher.js';
import { graphClient, onedriveOrt, anmelden, notendateienListen } from './onedrive.js';
import { syncStarten, syncLaden, syncHochladen, syncStatusText } from './sync.js';
import { inDateitext, ausDateitext } from './krypto.js';
import { dateiname, datumDeutsch } from './modell.js';
import { h, meldung, auswahl, passwortFrage, inhaltDialog, toast } from './ui.js';
import { setzeDokument, passwortSetzen } from './aktionen.js';
import { arbeitskopieSpeichern } from './speicher.js';

let client = null; // Graph-Client nach der Anmeldung (nur im Arbeitsspeicher)
let autosaveTimer = null;
let konfliktOffen = false;

export const onedriveAngemeldet = () => !!client;
/** Für Tests: einen fertigen Client (z. B. mit nachgebauter Schnittstelle) einsetzen. */
export function onedriveClientSetzen(c) {
  client = c;
}
export const onedriveClient = () => client;

export async function onedriveAnmelden() {
  const e = einstellungen();
  const tokenHolen = await anmelden({ clientId: e.onedriveClientId.trim(), tenantId: e.onedriveTenantId.trim() });
  client = graphClient({ tokenHolen });
  K.statusAktualisieren?.();
  return client;
}

export function onedriveAbmelden() {
  client = null;
  K.sync = null;
  K.statusAktualisieren?.();
}

/** Ohne Fenster anmelden, wenn die Anmeldung noch gültig ist. Gibt den Client oder null zurück. */
export async function onedriveStill() {
  if (client) return client;
  const e = einstellungen();
  if (!e.onedriveClientId?.trim() || !e.onedriveTenantId?.trim()) return null;
  try {
    const tokenHolen = await anmelden({ clientId: e.onedriveClientId.trim(), tenantId: e.onedriveTenantId.trim(), still: true });
    client = graphClient({ tokenHolen });
    K.statusAktualisieren?.();
    return client;
  } catch {
    return null;
  }
}

async function clientSicherstellen() {
  if (client) return client;
  try {
    return await onedriveAnmelden();
  } catch (e) {
    await meldung('Anmeldung nicht möglich', e.message);
    return null;
  }
}

K.syncStatus = () => (K.sync ? syncStatusText(K.sync) : '');

/** Notenbuch mit OneDrive verbinden und hochladen. Nur mit Passwort: Microsoft sieht nur verschlüsselte Daten. */
export async function syncEinschalten() {
  if (!K.buch) return;
  if (!K.passwort) {
    await meldung('Passwort nötig', 'Die Synchronisation lädt nur verschlüsselte Dateien hoch. Bitte setzen Sie zuerst ein Passwort.');
    await passwortSetzen();
    if (!K.passwort) return;
  }
  const c = await clientSicherstellen();
  if (!c) return;
  const name = K.dateiname || dateiname(K.buch);
  K.sync = syncStarten(onedriveOrt(c, name));
  try {
    const vorhanden = await syncLaden(K.sync);
    if (vorhanden) {
      const wahl = await auswahl('Datei existiert schon in OneDrive', `„${name}“ gibt es bereits im OneDrive-Ordner der App. Es wird nichts überschrieben.`, [
        { text: 'Abbrechen', wert: 'abbruch', abbruch: true },
        { text: 'Die Fassung aus OneDrive laden', wert: 'laden', klasse: 'knopf primaer' },
      ]);
      if (wahl !== 'laden') {
        K.sync = null;
        return;
      }
      await fassungLaden(vorhanden.text, name);
      return;
    }
    K.buch.einstellungen.sync = { name };
    await syncSpeichern();
    toast('Synchronisation eingeschaltet.');
  } catch (e) {
    K.sync = null;
    await meldung('Synchronisation nicht möglich', e.message);
  }
  K.statusAktualisieren?.();
}

export function syncAusschalten() {
  K.sync = null;
  if (K.buch) delete K.buch.einstellungen.sync;
  K.statusAktualisieren?.();
}

/** Liste der Notendateien im OneDrive-App-Ordner und Auswahl zum Öffnen. */
export async function ausOneDriveOeffnen() {
  const c = await clientSicherstellen();
  if (!c) return;
  let dateien;
  try {
    dateien = await notendateienListen(c);
  } catch (e) {
    await meldung('OneDrive nicht erreichbar', e.message);
    return;
  }
  if (dateien.length === 0) {
    await meldung('Keine Notendateien', 'Im OneDrive-Ordner der App liegt noch keine Notendatei. Schalten Sie zuerst bei einem geöffneten Notenbuch die Synchronisation ein.');
    return;
  }
  const wahl = h('select', { 'aria-label': 'Notendatei in OneDrive' }, dateien.map((d) => h('option', { value: d.name }, `${d.name} (geändert ${new Date(d.geaendert).toLocaleString('de-DE')})`)));
  const ok = await inhaltDialog('Aus OneDrive öffnen', [h('label', {}, 'Notendatei', wahl)], [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: 'Öffnen', wert: true, klasse: 'knopf primaer' },
  ]);
  if (!ok) return;
  const name = wahl.value;
  const sync = syncStarten(onedriveOrt(c, name));
  try {
    const r = await syncLaden(sync);
    if (!r) return meldung('Nicht gefunden', 'Die Datei gibt es in OneDrive nicht mehr.');
    await fassungLaden(r.text, name, sync);
  } catch (e) {
    await meldung('Öffnen nicht möglich', e.message);
  }
}

/** Dateitext aus OneDrive öffnen (Passwort wird abgefragt, wenn nötig). */
async function fassungLaden(text, name, sync = K.sync) {
  let pw = K.passwort;
  for (;;) {
    if (!pw) {
      pw = await passwortFrage('Passwort eingeben', { hinweis: `Die Datei „${name}“ aus OneDrive ist passwortgeschützt.` });
      if (pw === null) return false;
    }
    try {
      const buch = await ausDateitext(text, pw);
      buch.einstellungen.sync = { name };
      setzeDokument(buch, { passwort: pw, name, geaendert: false, ziel: 'buch', pruefen: false });
      K.sync = sync;
      K.statusAktualisieren?.();
      return true;
    } catch (e) {
      await meldung('Öffnen nicht möglich', e.message);
      pw = '';
    }
  }
}

/** Speichern in OneDrive mit Konfliktprüfung. Gibt true zurück, wenn gespeichert wurde. */
export async function syncSpeichern({ still = false } = {}) {
  if (!K.buch || !K.sync) return false;
  if (!K.passwort) {
    if (!still) await meldung('Passwort nötig', 'Die Synchronisation lädt nur verschlüsselte Dateien hoch. Bitte setzen Sie ein Passwort.');
    return false;
  }
  const vorher = K.buch.gespeichertAm;
  K.buch.gespeichertAm = new Date().toISOString();
  let text;
  try {
    text = await inDateitext(K.buch, K.passwort);
    await syncHochladen(K.sync, text);
  } catch (e) {
    K.buch.gespeichertAm = vorher;
    if (e.konflikt) {
      K.statusAktualisieren?.();
      return konfliktBehandeln(text);
    }
    // Offline oder anderer Fehler: lokal sichern, später erneut versuchen
    arbeitskopieSpeichern(K.buch, K.dateiname, true, K.passwort).catch(() => {});
    K.statusAktualisieren?.();
    if (!still) toast('OneDrive nicht erreichbar. Die Änderungen sind lokal gesichert und werden beim nächsten Online-Sein hochgeladen.');
    return false;
  }
  K.geaendert = false;
  K.statusAktualisieren?.();
  arbeitskopieSpeichern(K.buch, K.dateiname, false, K.passwort).catch(() => {});
  if (!still) toast(`In OneDrive gespeichert. ${syncStatusText(K.sync)}`);
  return true;
}

/** Konflikt: nie still überschreiben (SPEC 8.8). */
async function konfliktBehandeln(meinText) {
  if (konfliktOffen) return false;
  konfliktOffen = true;
  try {
    const wahl = await auswahl(
      'Datei wurde auf einem anderen Gerät geändert',
      'In OneDrive liegt eine neuere Fassung. Ihre Fassung wird nicht darübergeschrieben. Was möchten Sie tun?',
      [
        { text: 'Abbrechen', wert: 'abbruch', abbruch: true },
        { text: 'Andere Fassung laden', wert: 'laden' },
        { text: 'Meine Fassung als Kopie speichern', wert: 'kopie', klasse: 'knopf primaer' },
      ],
    );
    if (wahl === 'abbruch') return false;
    if (wahl === 'kopie') {
      const basis = (K.dateiname || 'Notenbuch').replace(/\.noten$/i, '');
      const stempel = new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '');
      const kopieName = `${basis} (Kopie ${stempel}).noten`;
      try {
        await syncHochladen(syncStarten(onedriveOrt(client, kopieName)), meinText);
        toast(`Ihre Fassung wurde in OneDrive als „${kopieName}“ gespeichert.`);
      } catch (e) {
        await meldung('Kopie nicht möglich', `${e.message} Ihre Fassung bleibt in der lokalen Arbeitskopie erhalten.`);
        return false;
      }
    } else {
      // „Andere Fassung laden“ verwirft die eigenen Änderungen: vorher bestätigen lassen
      const sicher = await auswahl('Eigene Änderungen verwerfen?', 'Ihre nicht synchronisierten Änderungen gehen verloren. Speichern Sie sie vorher lieber als Kopie.', [
        { text: 'Abbrechen', wert: 'nein', abbruch: true },
        { text: 'Verwerfen und andere Fassung laden', wert: 'ja', klasse: 'knopf gefahr' },
      ]);
      if (sicher !== 'ja') return false;
    }
    const r = await syncLaden(K.sync);
    if (!r) return false;
    await fassungLaden(r.text, K.sync.ort.name, K.sync);
    return false;
  } finally {
    konfliktOffen = false;
  }
}

/** Autosave nach Änderungen mit kurzer Verzögerung (abschaltbar in den Einstellungen). */
function autosaveAnstossen() {
  if (!K.sync || !einstellungen().onedriveAutosave || !K.geaendert) return;
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => syncSpeichern({ still: true }), 4000);
}
K.nachAenderung = autosaveAnstossen;
K.syncSpeichern = () => syncSpeichern();

// Beim nächsten Online-Sein erneut versuchen (mit Konfliktprüfung)
window.addEventListener('online', () => {
  if (K.sync?.ausstehend || (K.sync && K.geaendert)) syncSpeichern({ still: true });
});

/** Beim Öffnen einer lokalen Datei, die synchronisiert wird: neuere Fassung in OneDrive anbieten. */
export async function neuereFassungPruefen() {
  if (!K.buch?.einstellungen.sync?.name || K.sync) return;
  if (!client && !(await onedriveStill())) {
    // Anmeldung abgelaufen: ein Klick (Benutzeraktion) erlaubt das Anmeldefenster
    const e = einstellungen();
    if (!e.onedriveClientId?.trim()) return;
    const wahl = await auswahl('OneDrive-Anmeldung nötig', 'Dieses Notenbuch wird mit OneDrive synchronisiert, aber die Anmeldung ist abgelaufen. Jetzt anmelden?', [
      { text: 'Jetzt nicht', wert: 'nein', abbruch: true },
      { text: 'Anmelden', wert: 'ja', klasse: 'knopf primaer' },
    ]);
    if (wahl !== 'ja' || !(await clientSicherstellen())) return;
  }
  try {
    const sync = syncStarten(onedriveOrt(client, K.buch.einstellungen.sync.name));
    const r = await syncLaden(sync);
    if (!r) return;
    const text = r.text;
    let remote;
    try {
      remote = await ausDateitext(text, K.passwort);
    } catch {
      return;
    }
    if (remote.dokumentId === K.buch.dokumentId && (remote.gespeichertAm || '') > (K.buch.gespeichertAm || '')) {
      const wahl = await auswahl('Neuere Fassung in OneDrive', `In OneDrive liegt eine neuere Fassung (Stand ${datumDeutsch(remote.gespeichertAm.slice(0, 10))}). Laden?`, [
        { text: 'Jetzt nicht', wert: 'nein', abbruch: true },
        { text: 'Neuere Fassung laden', wert: 'ja', klasse: 'knopf primaer' },
      ]);
      if (wahl === 'ja') await fassungLaden(text, K.buch.einstellungen.sync.name, sync);
    } else {
      K.sync = sync;
      K.statusAktualisieren?.();
    }
  } catch {
    /* offline: kein Hinweis nötig */
  }
}

K.nachOeffnen = () => {
  neuereFassungPruefen();
};
