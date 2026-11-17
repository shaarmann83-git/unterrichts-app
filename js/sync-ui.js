// Synchronisation im Programm (SPEC 8.8): Anmeldung, Öffnen aus OneDrive, Speichern mit Konfliktabfrage, Autosave, Offline.
import { K } from './kontext.js';
import { einstellungen } from './speicher.js';
import { graphClient, onedriveOrt, anmelden, notendateienListen } from './onedrive.js';
import { syncStarten, syncLaden, syncHochladen, syncStatusText, syncFremdGeaendert, SICHERUNG_ORDNER, SICHERUNGEN_BEHALTEN, sicherungsName, ueberzaehligeSicherungen } from './sync.js';
import { inDateitext, ausDateitext } from './krypto.js';
import { dateiname, datumDeutsch } from './modell.js';
import { h, meldung, auswahl, bestaetigen, passwortFrage, inhaltDialog, toast } from './ui.js';
import { setzeDokument, passwortSetzen } from './aktionen.js';
import { arbeitskopieSpeichern } from './speicher.js';
import { serverClient } from './server-ort.js';

let client = null; // Graph-Client nach der Anmeldung (nur im Arbeitsspeicher)
let autosaveTimer = null;
let konfliktOffen = false;

/** Speicherort ist der eigene Server statt OneDrive (Einstellung auf diesem Gerät, SPEC 12.14). */
export const serverModus = () => !!einstellungen().serverAn;
export const ortName = () => (serverModus() ? 'Server' : 'OneDrive');
K.syncOrtName = ortName;

export const onedriveAngemeldet = () => !!client;
/** Für Tests: einen fertigen Client (z. B. mit nachgebauter Schnittstelle) einsetzen. */
export function onedriveClientSetzen(c) {
  client = c;
}
export const onedriveClient = () => client;

export async function onedriveAnmelden() {
  const e = einstellungen();
  if (serverModus()) {
    if (!e.serverSchluessel?.trim()) throw new Error('Bitte zuerst den Zugangsschlüssel des Servers in den Einstellungen eintragen.');
    const c = serverClient({ schluessel: e.serverSchluessel.trim() });
    await c.anmelden();
    client = c;
    K.statusAktualisieren?.();
    return client;
  }
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
  if (serverModus()) {
    if (!e.serverSchluessel?.trim()) return null;
    client = serverClient({ schluessel: e.serverSchluessel.trim() });
    K.statusAktualisieren?.();
    return client;
  }
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
      const wahl = await auswahl(`Datei existiert schon in ${ortName()}`, `„${name}“ gibt es bereits im ${ortName()}-Ordner der App. Es wird nichts überschrieben.`, [
        { text: 'Abbrechen', wert: 'abbruch', abbruch: true },
        { text: `Die Fassung aus ${ortName()} laden`, wert: 'laden', klasse: 'knopf primaer' },
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
    await meldung(`${ortName()} nicht erreichbar`, e.message);
    return;
  }
  if (dateien.length === 0) {
    const sicherungen = await c.liste(SICHERUNG_ORDNER).catch(() => []);
    if (sicherungen.length) return sicherungOeffnen(c);
    await meldung('Keine Notendateien', `Im ${ortName()}-Ordner der App liegt noch keine Notendatei. Schalten Sie zuerst bei einem geöffneten Notenbuch die Synchronisation ein.`);
    return;
  }
  const wahl = h('select', { 'aria-label': `Notendatei in ${ortName()}` }, dateien.map((d) => h('option', { value: d.name }, `${d.name} (geändert ${new Date(d.geaendert).toLocaleString('de-DE')})`)));
  const ok = await inhaltDialog(`Aus ${ortName()} öffnen`, [h('label', {}, 'Notendatei', wahl)], [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: 'Sicherungskopie öffnen …', wert: 'sicherung' },
    { text: 'Öffnen', wert: true, klasse: 'knopf primaer' },
  ]);
  if (!ok) return;
  if (ok === 'sicherung') return sicherungOeffnen(c);
  const name = wahl.value;
  const sync = syncStarten(onedriveOrt(c, name));
  try {
    const r = await syncLaden(sync);
    if (!r) return meldung('Nicht gefunden', `Die Datei gibt es in ${ortName()} nicht mehr.`);
    await fassungLaden(r.text, name, sync);
  } catch (e) {
    await meldung('Öffnen nicht möglich', e.message);
  }
}

/** Dateitext aus OneDrive öffnen (Passwort wird abgefragt, wenn nötig). */
async function fassungLaden(text, name, sync = K.sync, { klasseId = null, ziel = 'buch' } = {}) {
  let pw = K.passwort;
  for (;;) {
    if (!pw) {
      pw = await passwortFrage('Passwort eingeben', { hinweis: `Die Datei „${name}“ aus ${ortName()} ist passwortgeschützt.` });
      if (pw === null) return false;
    }
    try {
      const buch = await ausDateitext(text, pw);
      buch.einstellungen.sync = { name };
      setzeDokument(buch, { passwort: pw, name, geaendert: false, ziel, klasseId: buch.klassen.some((k) => k.id === klasseId) ? klasseId : null, pruefen: false });
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
  const stand = K.stand;
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
    if (!still) toast(`${ortName()} nicht erreichbar. Die Änderungen sind lokal gesichert und werden beim nächsten Online-Sein hochgeladen.`);
    return false;
  }
  // Wurde während des Hochladens weitergearbeitet, ist nur der Stand von vorher in OneDrive: nicht als gespeichert melden.
  const unveraendert = K.stand === stand;
  if (unveraendert) K.geaendert = false;
  K.statusAktualisieren?.();
  arbeitskopieSpeichern(K.buch, K.dateiname, K.geaendert, K.passwort).catch(() => {});
  if (!unveraendert) autosaveAnstossen();
  tagesSicherung(text);
  if (!still) toast(`In ${ortName()} gespeichert. ${syncStatusText(K.sync)}`);
  return true;
}

// ---------- Tägliche Sicherungskopie (SPEC 12.13) ----------

const SICHERUNG_MERKER = 'notenverwaltung-sicherungstag';
const heuteLokal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function sicherungstage() {
  try {
    return JSON.parse(localStorage.getItem(SICHERUNG_MERKER) || '{}');
  } catch {
    return {};
  }
}

/**
 * Beim ersten Speichern eines Tages legt die App die gerade gespeicherte (verschlüsselte) Fassung zusätzlich im Ordner
 * „Sicherungen“ ab und räumt ältere Kopien auf. Schlägt das fehl, wird es beim nächsten Speichern erneut versucht.
 */
async function tagesSicherung(text) {
  if (!client || !K.buch || !K.sync || !einstellungen().onedriveSicherung) return;
  const id = K.buch.dokumentId;
  const tag = heuteLokal();
  const name = K.sync.ort.name;
  const tage = sicherungstage();
  if (tage[id] === tag) return;
  const c = client;
  try {
    await c.ordnerSicherstellen(SICHERUNG_ORDNER);
    try {
      await c.hochladen(`${SICHERUNG_ORDNER}/${sicherungsName(name, tag)}`, new TextEncoder().encode(text), null);
    } catch (e) {
      if (!e.konflikt) throw e; // Konflikt heißt hier: Ein anderes Gerät hat die Kopie von heute schon angelegt.
    }
    tage[id] = tag;
    try {
      localStorage.setItem(SICHERUNG_MERKER, JSON.stringify(tage));
    } catch {
      /* Speicher blockiert: dann prüft die App eben bei jedem Speichern */
    }
    const namen = (await c.liste(SICHERUNG_ORDNER)).map((d) => d.name);
    for (const n of ueberzaehligeSicherungen(namen, name)) await c.loeschen(`${SICHERUNG_ORDNER}/${n}`);
  } catch {
    /* Die Sicherungskopie ist ein Zusatz und darf das Speichern nie stören. */
  }
}

/** Eine Sicherungskopie aus OneDrive öffnen. Sie ersetzt die aktuelle Fassung erst beim nächsten Speichern. */
export async function sicherungOeffnen(c = client) {
  if (!c) c = await clientSicherstellen();
  if (!c) return;
  let dateien;
  try {
    dateien = (await c.liste(SICHERUNG_ORDNER)).filter((d) => /_\d{4}-\d{2}-\d{2}\.noten$/i.test(d.name)).sort((a, b) => (a.name < b.name ? 1 : -1));
  } catch (e) {
    await meldung(`${ortName()} nicht erreichbar`, e.message);
    return;
  }
  if (dateien.length === 0) {
    await meldung('Keine Sicherungskopien', `Im ${ortName()}-Ordner „${SICHERUNG_ORDNER}“ liegt noch keine Sicherungskopie. Die App legt beim ersten Speichern eines Tages eine an und behält die letzten ${SICHERUNGEN_BEHALTEN}.`);
    return;
  }
  const wahl = h('select', { 'aria-label': 'Sicherungskopie' }, dateien.map((d) => h('option', { value: d.name }, d.name.replace(/\.noten$/i, ''))));
  const ok = await inhaltDialog('Sicherungskopie öffnen', [
    h('p', { class: 'klein' }, 'Der Name endet mit dem Tag der Sicherung. Die Kopie zeigt den Stand beim ersten Speichern an diesem Tag.'),
    h('label', {}, 'Sicherungskopie', wahl),
  ], [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: 'Öffnen', wert: true, klasse: 'knopf primaer' },
  ]);
  if (!ok) return;
  const name = wahl.value;
  const ziel = name.replace(/_\d{4}-\d{2}-\d{2}\.noten$/i, '.noten');
  const sicher = await bestaetigen('Sicherungskopie wiederherstellen', `Die Sicherungskopie wird geöffnet. In ${ortName()} ändert sich zunächst nichts. Erst wenn Sie speichern oder etwas ändern, ersetzt dieser ältere Stand die aktuelle Fassung „${ziel}“. Schließen Sie das Notenbuch ohne zu speichern, wenn Sie nur nachsehen möchten.`, 'Öffnen');
  if (!sicher) return;
  try {
    const antwort = await c.lesen(`${SICHERUNG_ORDNER}/${name}`);
    if (!antwort) return meldung('Nicht gefunden', `Die Sicherungskopie gibt es in ${ortName()} nicht mehr.`);
    const text = await antwort.text();
    const sync = syncStarten(onedriveOrt(c, ziel));
    await syncLaden(sync); // merkt sich den Stand der aktuellen Fassung, damit das Speichern sie ersetzen darf
    if (await fassungLaden(text, ziel, sync)) {
      K.geaendert = true;
      K.statusAktualisieren?.();
      toast('Sicherungskopie geöffnet. Sie gilt erst nach dem Speichern.');
    }
  } catch (e) {
    await meldung('Öffnen nicht möglich', e.message);
  }
}

// ---------- Änderung auf einem anderen Gerät bemerken, sobald die App wieder vorn ist (SPEC 12.13) ----------

let pruefungLaeuft = false;

export async function fremdeAenderungPruefen() {
  if (!K.buch || !K.sync || !client || konfliktOffen || pruefungLaeuft) return;
  if (document.querySelector('dialog[open]')) return; // mitten in einer Eingabe nichts austauschen
  pruefungLaeuft = true;
  try {
    const sync = K.sync;
    if (!(await syncFremdGeaendert(sync)) || K.sync !== sync) return;
    // Eigene Änderungen offen: wie beim Speichern (eigene Fassung wird erkannt, sonst Konfliktabfrage)
    if (K.geaendert || sync.ausstehend) {
      await syncSpeichern({ still: true });
      return;
    }
    const r = await sync.ort.laden();
    if (!r || K.sync !== sync || K.geaendert || document.querySelector('dialog[open]')) return;
    sync.etag = r.etag;
    sync.zuletzt = new Date();
    const ziel = location.hash.replace(/^#\/?/, '') || 'buch';
    if (await fassungLaden(r.text, sync.ort.name, sync, { klasseId: K.klasseId, ziel })) {
      toast(`Neuere Fassung aus ${ortName()} geladen (auf einem anderen Gerät geändert).`);
    }
  } catch {
    /* offline: beim nächsten Mal */
  } finally {
    pruefungLaeuft = false;
  }
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fremdeAenderungPruefen(); });
setInterval(() => { if (document.visibilityState === 'visible') fremdeAenderungPruefen(); }, 2 * 60 * 1000);

/** Konflikt: nie still überschreiben (SPEC 8.8). */
async function konfliktBehandeln(meinText) {
  if (konfliktOffen) return false;
  konfliktOffen = true;
  try {
    const wahl = await auswahl(
      'Datei wurde auf einem anderen Gerät geändert',
      `In ${ortName()} liegt eine neuere Fassung. Ihre Fassung wird nicht darübergeschrieben. Was möchten Sie tun?`,
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
        toast(`Ihre Fassung wurde in ${ortName()} als „${kopieName}“ gespeichert.`);
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
  else fremdeAenderungPruefen();
});

/** Beim Öffnen einer lokalen Datei, die synchronisiert wird: neuere Fassung in OneDrive anbieten. */
export async function neuereFassungPruefen() {
  if (!K.buch?.einstellungen.sync?.name || K.sync) return;
  if (!client && !(await onedriveStill())) {
    // Anmeldung abgelaufen: ein Klick (Benutzeraktion) erlaubt das Anmeldefenster
    const e = einstellungen();
    if (!serverModus() && !e.onedriveClientId?.trim()) return;
    const wahl = await auswahl(`${ortName()}-Anmeldung nötig`, `Dieses Notenbuch wird mit ${ortName()} synchronisiert, aber die Anmeldung ist abgelaufen. Jetzt anmelden?`, [
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
    if (remote.dokumentId !== K.buch.dokumentId) {
      // Gleicher Dateiname, aber ein anderes Notenbuch: nicht verbinden, sonst würde es beim Speichern überschrieben.
      await meldung(`Anderes Notenbuch in ${ortName()}`, `In ${ortName()} liegt unter dem Namen „${K.buch.einstellungen.sync.name}“ ein anderes Notenbuch. Damit nichts überschrieben wird, bleibt die Synchronisation für dieses Notenbuch aus.`);
      return;
    }
    if ((remote.gespeichertAm || '') > (K.buch.gespeichertAm || '')) {
      const lokal = K.geaendert ? ` Achtung: Auf diesem Gerät gibt es Änderungen, die noch nicht in ${ortName()} sind. Sie gehen beim Laden verloren.` : '';
      const wahl = await auswahl(`Neuere Fassung in ${ortName()}`, `In ${ortName()} liegt eine neuere Fassung (Stand ${datumDeutsch(remote.gespeichertAm.slice(0, 10))}). Laden?${lokal}`, [
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
