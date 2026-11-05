// OneDrive über Microsoft Graph (SPEC 8.8). Anmeldung mit MSAL.js (lib/msal-browser.min.js, Authorization Code mit PKCE),
// Berechtigung Files.ReadWrite.AppFolder: die App sieht nur ihren eigenen Ordner „Apps/Notenverwaltung“.
// Der Zugriff steckt hinter der Schnittstelle aus sync.js; `fetchFn` und `tokenHolen` sind austauschbar (Tests).
import { SyncKonflikt } from './sync.js';

export const GRAPH = 'https://graph.microsoft.com/v1.0';
export const BERECHTIGUNG = 'Files.ReadWrite.AppFolder';
export const EINGANG_ORDNER = 'Untis-Eingang';
export const VERARBEITET_ORDNER = 'verarbeitet';
const EINFACH_MAX = 4 * 1024 * 1024 - 1024; // Grenze für einfaches Hochladen (4 MB)
const BLOCK = 320 * 1024 * 10; // Blöcke für Upload-Sitzungen: Vielfaches von 320 KiB

const enc = (pfad) => pfad.split('/').map(encodeURIComponent).join('/');
const appPfad = (pfad) => `${GRAPH}/me/drive/special/approot:/${enc(pfad)}`;

export class GraphFehler extends Error {
  constructor(status, text) {
    super(`OneDrive-Fehler ${status}${text ? `: ${text}` : ''}`);
    this.status = status;
  }
}

/** Graph-Client. `tokenHolen()` liefert ein Zugriffstoken (Text). */
export function graphClient({ tokenHolen, fetchFn = (...a) => globalThis.fetch(...a) }) {
  async function anfrage(url, optionen = {}) {
    const token = await tokenHolen();
    const antwort = await fetchFn(url, { ...optionen, headers: { Authorization: `Bearer ${token}`, ...(optionen.headers || {}) } });
    return antwort;
  }
  async function pruefen(antwort) {
    if (antwort.ok) return antwort;
    let text = '';
    try {
      text = (await antwort.json())?.error?.message || '';
    } catch {
      /* kein JSON */
    }
    throw new GraphFehler(antwort.status, text);
  }

  const client = {
    /** Metadaten einer Datei im App-Ordner oder null. */
    async meta(pfad) {
      const a = await anfrage(appPfad(pfad));
      if (a.status === 404) return null;
      return (await pruefen(a)).json();
    },
    async lesen(pfad) {
      const a = await anfrage(`${appPfad(pfad)}:/content`);
      if (a.status === 404) return null;
      return pruefen(a);
    },
    /** Dateien eines Ordners (Name, Größe, geändert, eTag), ohne Unterordner. */
    async liste(ordner) {
      const a = await anfrage(`${appPfad(ordner)}:/children?$top=200`);
      if (a.status === 404) return [];
      const j = await (await pruefen(a)).json();
      return (j.value || []).filter((x) => x.file).map((x) => ({ name: x.name, id: x.id, groesse: x.size, geaendert: Date.parse(x.lastModifiedDateTime) || 0, etag: x.eTag }));
    },
    /** Hochladen. `erwartet`: eTag der bekannten Fassung (null = Datei darf noch nicht existieren). Wirft SyncKonflikt bei 412/409. */
    async hochladen(pfad, bytes, erwartet = null) {
      if (bytes.length > EINFACH_MAX) return client.hochladenGross(pfad, bytes, erwartet);
      const kopf = { 'Content-Type': 'application/octet-stream' };
      let url = `${appPfad(pfad)}:/content`;
      if (erwartet) kopf['If-Match'] = erwartet;
      else url += '?@microsoft.graph.conflictBehavior=fail';
      const a = await anfrage(url, { method: 'PUT', headers: kopf, body: bytes });
      if (a.status === 412 || a.status === 409) throw new SyncKonflikt();
      return (await pruefen(a)).json();
    },
    async hochladenGross(pfad, bytes, erwartet) {
      const kopf = { 'Content-Type': 'application/json' };
      if (erwartet) kopf['If-Match'] = erwartet;
      const s = await anfrage(`${appPfad(pfad)}:/createUploadSession`, {
        method: 'POST',
        headers: kopf,
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': erwartet ? 'replace' : 'fail' } }),
      });
      if (s.status === 412 || s.status === 409) throw new SyncKonflikt();
      const { uploadUrl } = await (await pruefen(s)).json();
      let ergebnis = null;
      for (let start = 0; start < bytes.length; start += BLOCK) {
        const ende = Math.min(start + BLOCK, bytes.length);
        // Die Upload-URL ist vorab autorisiert: kein Authorization-Header senden.
        const teil = await fetchFn(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${start}-${ende - 1}/${bytes.length}`, 'Content-Length': String(ende - start) }, body: bytes.slice(start, ende) });
        if (teil.status === 412 || teil.status === 409) throw new SyncKonflikt();
        await pruefen(teil);
        if (ende === bytes.length) ergebnis = await teil.json();
      }
      return ergebnis;
    },
    async ordnerSicherstellen(pfad) {
      const m = await client.meta(pfad);
      if (m) return m;
      const teile = pfad.split('/');
      const name = teile.pop();
      const eltern = teile.join('/');
      const url = eltern ? `${appPfad(eltern)}:/children` : `${GRAPH}/me/drive/special/approot/children`;
      const a = await anfrage(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) });
      if (a.status === 409) return client.meta(pfad);
      return (await pruefen(a)).json();
    },
    async verschieben(pfad, zielOrdnerPfad) {
      const ziel = await client.ordnerSicherstellen(zielOrdnerPfad);
      const a = await anfrage(appPfad(pfad), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentReference: { id: ziel.id } }) });
      await pruefen(a);
    },
    async loeschen(pfad) {
      const a = await anfrage(appPfad(pfad), { method: 'DELETE' });
      if (a.status !== 404) await pruefen(a);
    },
  };
  return client;
}

/** Speicherort für sync.js: eine Datei im App-Ordner. */
export function onedriveOrt(client, name) {
  return {
    name,
    async laden() {
      const m = await client.meta(name);
      if (!m) return null;
      const a = await client.lesen(name);
      if (!a) return null;
      return { text: await a.text(), etag: m.eTag };
    },
    async speichern(text, erwartet) {
      const r = await client.hochladen(name, new TextEncoder().encode(text), erwartet);
      return { etag: r.eTag };
    },
  };
}

/** Untis-Eingang im App-Ordner als Ordner-Schnittstelle für die Import-Automatik (SPEC 8.6 Stufe 2). */
export function onedriveEingang(client) {
  return {
    async liste() {
      const dateien = await client.liste(EINGANG_ORDNER);
      return dateien.map((d) => ({ name: d.name, geaendert: d.geaendert, lesen: async () => (await (await client.lesen(`${EINGANG_ORDNER}/${d.name}`)).arrayBuffer()) }));
    },
    async verarbeitet(name) {
      await client.verschieben(`${EINGANG_ORDNER}/${name}`, `${EINGANG_ORDNER}/${VERARBEITET_ORDNER}`);
    },
    async loeschen(name) {
      await client.loeschen(`${EINGANG_ORDNER}/${name}`);
    },
  };
}

/** Notendateien im App-Ordner (ohne Eingangsordner). */
export async function notendateienListen(client) {
  const dateien = await client.liste('');
  return dateien.filter((d) => /\.noten$/i.test(d.name));
}

// ---------- Anmeldung (MSAL.js) ----------

function skriptLaden(src) {
  return new Promise((resolve, reject) => {
    if (globalThis.msal) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Die Anmelde-Bibliothek (MSAL) konnte nicht geladen werden.'));
    document.head.append(s);
  });
}

/**
 * Adresse, auf die Microsoft nach der Anmeldung zurückleitet. Immer mit index.html, egal ob die App über
 * die Ordneradresse (Handy-Verknüpfung) oder über index.html (PC) gestartet wurde. So genügt ein Eintrag in Entra.
 */
export function weiterleitungsAdresse(loc = globalThis.location) {
  const pfad = loc.pathname.endsWith('/') ? `${loc.pathname}index.html` : loc.pathname;
  return loc.origin + pfad;
}

/**
 * Meldet mit dem dienstlichen Konto an (Popup) und liefert eine Funktion, die Zugriffstokens holt.
 * `einstellung`: { clientId, tenantId }. Nichts davon ist im Code fest verdrahtet.
 */
export async function anmelden({ clientId, tenantId, still = false }) {
  if (!clientId || !tenantId) throw new Error('Bitte zuerst Client-ID und Tenant-ID in den Einstellungen eintragen.');
  await skriptLaden('lib/msal-browser.min.js');
  const app = new globalThis.msal.PublicClientApplication({
    auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId}`, redirectUri: weiterleitungsAdresse() },
    // localStorage: die Anmeldung übersteht das Schließen von Browser oder App (sessionStorage ging dabei verloren)
    cache: { cacheLocation: 'localStorage' },
  });
  await app.initialize?.();
  const anfrage = { scopes: [BERECHTIGUNG] };
  let konto = app.getAllAccounts()[0];
  if (still) {
    // ohne Fenster: nur, wenn schon angemeldet und das Token still erneuert werden kann
    if (!konto) throw new Error('Nicht angemeldet.');
    await app.acquireTokenSilent({ ...anfrage, account: konto });
  }
  if (!konto) konto = (await app.loginPopup(anfrage)).account;
  return async () => {
    try {
      return (await app.acquireTokenSilent({ ...anfrage, account: konto })).accessToken;
    } catch {
      return (await app.acquireTokenPopup({ ...anfrage, account: konto })).accessToken;
    }
  };
}
