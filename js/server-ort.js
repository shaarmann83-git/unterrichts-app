// Eigener Server als Speicherort (Variante ohne OneDrive, siehe server/server.mjs und SPEC 12.14).
// Bietet dieselben Funktionen wie der OneDrive-Zugriff in onedrive.js (meta, lesen, liste, hochladen, …),
// damit Synchronisation, Konfliktprüfung und Sicherungskopien unverändert damit arbeiten.
import { SyncKonflikt } from './sync.js';

export class ServerFehler extends Error {
  constructor(status, text) {
    super(status === 401 ? 'Der Zugangsschlüssel für den Server stimmt nicht.' : `Server-Fehler ${status}${text ? `: ${text}` : ''}`);
    this.status = status;
  }
}

const enc = (pfad) => pfad.split('/').map(encodeURIComponent).join('/');

/** `basis`: Adresse der Schnittstelle (Standard: „api/“ neben der App), `schluessel`: Zugangsschlüssel des Servers. */
export function serverClient({ schluessel, basis = new URL('api/', globalThis.location?.href || 'http://localhost/').href, fetchFn = (...a) => globalThis.fetch(...a) }) {
  const anfrage = (weg, optionen = {}) => fetchFn(basis + weg, { ...optionen, cache: 'no-store', headers: { Authorization: `Bearer ${schluessel}`, ...(optionen.headers || {}) } });
  async function pruefen(antwort) {
    if (antwort.ok) return antwort;
    let text = '';
    try {
      text = (await antwort.json())?.error?.message || '';
    } catch {
      /* kein JSON */
    }
    throw new ServerFehler(antwort.status, text);
  }
  const client = {
    /** Prüft Adresse und Zugangsschlüssel. */
    async anmelden() {
      const j = await (await pruefen(await anfrage('info'))).json().catch(() => null);
      if (!j?.notenserver) throw new Error('Unter dieser Adresse antwortet kein Noten-Server.');
    },
    async meta(pfad) {
      const a = await anfrage(`datei/${enc(pfad)}`, { method: 'HEAD' });
      if (a.status === 404) return null;
      await pruefen(a);
      return { eTag: a.headers.get('ETag') };
    },
    async lesen(pfad) {
      const a = await anfrage(`datei/${enc(pfad)}`);
      if (a.status === 404) return null;
      return pruefen(a);
    },
    async liste(ordner) {
      const j = await (await pruefen(await anfrage(`dateien?ordner=${encodeURIComponent(ordner || '')}`))).json();
      return (j.value || []).map((x) => ({ name: x.name, groesse: x.groesse, geaendert: x.geaendert }));
    },
    async hochladen(pfad, bytes, erwartet = null) {
      const kopf = { 'Content-Type': 'application/octet-stream' };
      if (erwartet) kopf['If-Match'] = erwartet;
      const a = await anfrage(`datei/${enc(pfad)}`, { method: 'PUT', headers: kopf, body: bytes });
      if (a.status === 412 || a.status === 409) throw new SyncKonflikt();
      return (await pruefen(a)).json();
    },
    async ordnerSicherstellen() {
      return {}; // der Server legt Ordner beim Hochladen selbst an
    },
    async loeschen(pfad) {
      const a = await anfrage(`datei/${enc(pfad)}`, { method: 'DELETE' });
      if (a.status !== 404) await pruefen(a);
    },
  };
  return client;
}
