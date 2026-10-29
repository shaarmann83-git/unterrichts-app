// Dateien öffnen/speichern, lokale Arbeitskopie (IndexedDB) und Einstellungen.
const DB_NAME = 'notenverwaltung';
const STORE = 'arbeitskopien';
const EINSTELLUNGEN = 'notenverwaltung-einstellungen';

// ---------- Einstellungen (localStorage) ----------

export function einstellungen() {
  try {
    return { keineDatenBehalten: false, farbschema: 'auto', ...JSON.parse(localStorage.getItem(EINSTELLUNGEN) || '{}') };
  } catch {
    return { keineDatenBehalten: false, farbschema: 'auto' };
  }
}

export function einstellungSetzen(schluessel, wert) {
  const e = einstellungen();
  e[schluessel] = wert;
  try {
    localStorage.setItem(EINSTELLUNGEN, JSON.stringify(e));
  } catch {
    /* Speicher blockiert: Einstellung gilt nur bis zum Neuladen nicht – unkritisch */
  }
}

// ---------- Arbeitskopie (IndexedDB) ----------

function dbOeffnen() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB nicht verfügbar'));
    const anfrage = indexedDB.open(DB_NAME, 1);
    anfrage.onupgradeneeded = () => anfrage.result.createObjectStore(STORE, { keyPath: 'id' });
    anfrage.onsuccess = () => resolve(anfrage.result);
    anfrage.onerror = () => reject(anfrage.error);
  });
}

async function transaktion(modus, aktion) {
  const db = await dbOeffnen();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, modus);
      const ergebnis = aktion(t.objectStore(STORE));
      t.oncomplete = () => resolve(ergebnis.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

/** Speichert die Arbeitskopie – nicht, wenn „Keine Daten auf diesem Gerät behalten“ aktiv ist. */
export async function arbeitskopieSpeichern(daten, dateiname, geaendert) {
  if (einstellungen().keineDatenBehalten) return false;
  const eintrag = {
    id: daten.dokumentId,
    titel: [daten.kopf.klasse, daten.kopf.lernfeldNr && `LF ${daten.kopf.lernfeldNr}`, daten.kopf.schuljahr]
      .filter(Boolean)
      .join(' · ') || 'Ohne Titel',
    dateiname,
    zeit: new Date().toISOString(),
    geaendert,
    daten,
  };
  await transaktion('readwrite', (s) => s.put(eintrag));
  return true;
}

export async function arbeitskopien() {
  const alle = await transaktion('readonly', (s) => s.getAll());
  return alle.sort((a, b) => (a.zeit < b.zeit ? 1 : -1));
}

export function arbeitskopie(id) {
  return transaktion('readonly', (s) => s.get(id));
}

export function arbeitskopieLoeschen(id) {
  return transaktion('readwrite', (s) => s.delete(id));
}

export async function alleLokalenDatenLoeschen() {
  await transaktion('readwrite', (s) => s.clear());
  try {
    localStorage.removeItem(EINSTELLUNGEN);
  } catch {
    /* ignorieren */
  }
}

// ---------- Dateien ----------

export const kannDirektSpeichern = () => typeof globalThis.showSaveFilePicker === 'function';

const DATEITYP = {
  description: 'Notendatei',
  accept: { 'application/json': ['.noten', '.json'] },
};

/** Datei öffnen. Gibt {text, name, handle} zurück oder null bei Abbruch. */
export async function dateiOeffnen() {
  if (typeof globalThis.showOpenFilePicker === 'function') {
    try {
      const [handle] = await showOpenFilePicker({ types: [DATEITYP], multiple: false });
      const datei = await handle.getFile();
      return { text: await datei.text(), name: datei.name, handle };
    } catch (e) {
      if (e.name === 'AbortError') return null;
      throw e;
    }
  }
  return dateiPerUpload('.noten,.json,application/json', (d) => d.text());
}

export async function dateiAlsBytes(endungen) {
  return dateiPerUpload(endungen, (d) => d.arrayBuffer());
}

function dateiPerUpload(accept, lesen) {
  return new Promise((resolve, reject) => {
    const eingabe = document.createElement('input');
    eingabe.type = 'file';
    eingabe.accept = accept;
    eingabe.addEventListener('change', async () => {
      const datei = eingabe.files[0];
      if (!datei) return resolve(null);
      try {
        resolve({ text: await lesen(datei), name: datei.name, handle: null });
      } catch (e) {
        reject(e);
      }
    });
    eingabe.addEventListener('cancel', () => resolve(null));
    eingabe.click();
  });
}

export function herunterladen(inhalt, name, typ = 'application/octet-stream') {
  const blob = new Blob([inhalt], { type: typ });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * In die geöffnete Datei schreiben (falls möglich), sonst herunterladen.
 * Gibt {handle, name, direkt} zurück oder null bei Abbruch.
 */
export async function dateiSpeichern(text, { handle, name, neuWaehlen = false }) {
  if (kannDirektSpeichern()) {
    try {
      if (!handle || neuWaehlen) {
        handle = await showSaveFilePicker({ suggestedName: name, types: [DATEITYP] });
      }
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      return { handle, name: handle.name, direkt: true };
    } catch (e) {
      if (e.name === 'AbortError') return null;
      throw e;
    }
  }
  herunterladen(text, name, 'application/json');
  return { handle: null, name, direkt: false };
}
