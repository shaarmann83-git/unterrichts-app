// Eigener Server für die Notenverwaltung (Variante ohne OneDrive).
// Er liefert die App aus und bewahrt die Notendateien auf. Die Dateien kommen bereits verschlüsselt an:
// Der Server sieht weder Namen noch Noten und kennt das Passwort der Notendatei nicht.
// Keine Fremdpakete, nur Node.js (ab Version 20).  Start:  NOTEN_SCHLUESSEL=… node server/server.mjs
import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, stat, unlink } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ORDNER = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 64 * 1024 * 1024;
// Nur diese Teile der App werden ausgeliefert (nicht: server/, daten/, tests/, docs/, .git)
const APP_PFADE = /^(index\.html|style\.css|sw\.js|manifest\.webmanifest|(js|lib|icons)\/[A-Za-z0-9._\/-]+)$/;
const TYPEN = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.LICENSE': 'text/plain; charset=utf-8' };
// Erlaubt: „Name.noten“ oder „Ordner/Name.noten“, ohne Punkte am Anfang, ohne Rückwärtsschritte
const NAME = /^[^\/\\\0<>:"|?*]{1,150}$/;

export const etagVon = (bytes) => `"${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}"`;

function pfadPruefen(pfad) {
  const teile = String(pfad || '').split('/');
  if (teile.length < 1 || teile.length > 2) return null;
  for (const t of teile) if (!NAME.test(t) || t.startsWith('.') || t === '..') return null;
  if (!/\.noten$/i.test(teile.at(-1))) return null;
  return teile;
}
function ordnerPruefen(ordner) {
  if (!ordner) return [];
  return NAME.test(ordner) && !ordner.startsWith('.') ? [ordner] : null;
}

/**
 * Erzeugt den Server. `schluessel`: Zugangsschlüssel (mindestens 16 Zeichen), `daten`: Ordner für die Notendateien.
 */
export function notenServer({ schluessel, daten, appOrdner = APP_ORDNER }) {
  if (!schluessel || schluessel.length < 16) throw new Error('Der Zugangsschlüssel (NOTEN_SCHLUESSEL) fehlt oder ist kürzer als 16 Zeichen.');
  const datenOrdner = resolve(daten);
  const soll = createHash('sha256').update(schluessel).digest();
  const sperren = new Map(); // je Datei nacheinander schreiben, damit die eTag-Prüfung stimmt

  const berechtigt = (anfrage) => {
    const m = /^Bearer (.+)$/.exec(anfrage.headers.authorization || '');
    return !!m && timingSafeEqual(createHash('sha256').update(m[1]).digest(), soll);
  };
  const json = (antwort, status, inhalt, kopf = {}) => {
    antwort.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...kopf });
    antwort.end(JSON.stringify(inhalt));
  };
  const fehler = (antwort, status, text) => json(antwort, status, { error: { message: text } });
  const koerper = (anfrage) => new Promise((fertig, abbruch) => {
    const teile = [];
    let groesse = 0;
    anfrage.on('data', (t) => {
      groesse += t.length;
      if (groesse > MAX_BYTES) { abbruch(Object.assign(new Error('Datei zu groß'), { status: 413 })); anfrage.destroy(); } else teile.push(t);
    });
    anfrage.on('end', () => fertig(Buffer.concat(teile)));
    anfrage.on('error', abbruch);
  });
  const nacheinander = (schluesselName, aufgabe) => {
    const lauf = (sperren.get(schluesselName) || Promise.resolve()).catch(() => {}).then(aufgabe);
    sperren.set(schluesselName, lauf);
    return lauf.finally(() => { if (sperren.get(schluesselName) === lauf) sperren.delete(schluesselName); });
  };
  const lesen = (datei) => readFile(datei).catch((e) => { if (e.code === 'ENOENT') return null; throw e; });

  async function api(anfrage, antwort, url) {
    if (!berechtigt(anfrage)) {
      await new Promise((r) => setTimeout(r, 400)); // bremst das Durchprobieren von Schlüsseln
      return fehler(antwort, 401, 'Der Zugangsschlüssel stimmt nicht.');
    }
    const weg = decodeURIComponent(url.pathname.replace(/^\/api\//, ''));
    if (weg === 'info' && anfrage.method === 'GET') return json(antwort, 200, { notenserver: 1 });
    if (weg === 'dateien' && anfrage.method === 'GET') {
      const ordner = ordnerPruefen(url.searchParams.get('ordner') || '');
      if (!ordner) return fehler(antwort, 400, 'Ungültiger Ordnername.');
      const wo = join(datenOrdner, ...ordner);
      const namen = await readdir(wo).catch((e) => { if (e.code === 'ENOENT') return []; throw e; });
      const liste = [];
      for (const name of namen) {
        if (!/\.noten$/i.test(name)) continue;
        const s = await stat(join(wo, name));
        if (s.isFile()) liste.push({ name, groesse: s.size, geaendert: s.mtimeMs });
      }
      return json(antwort, 200, { value: liste });
    }
    if (weg.startsWith('datei/')) {
      const teile = pfadPruefen(weg.slice('datei/'.length));
      if (!teile) return fehler(antwort, 400, 'Ungültiger Dateiname.');
      const datei = join(datenOrdner, ...teile);
      if (!datei.startsWith(datenOrdner + sep)) return fehler(antwort, 400, 'Ungültiger Dateiname.');
      if (anfrage.method === 'GET' || anfrage.method === 'HEAD') {
        const bytes = await lesen(datei);
        if (!bytes) return fehler(antwort, 404, 'Datei nicht gefunden.');
        antwort.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length, ETag: etagVon(bytes), 'Cache-Control': 'no-store' });
        return antwort.end(anfrage.method === 'HEAD' ? undefined : bytes);
      }
      if (anfrage.method === 'PUT') {
        const neu = await koerper(anfrage);
        return nacheinander(datei, async () => {
          const alt = await lesen(datei);
          const erwartet = anfrage.headers['if-match'];
          // Mit If-Match: nur ersetzen, wenn die bekannte Fassung noch da ist. Ohne: Die Datei darf noch nicht existieren.
          if (erwartet ? !alt || etagVon(alt) !== erwartet : !!alt) return fehler(antwort, 412, 'Die Datei wurde inzwischen geändert.');
          await mkdir(dirname(datei), { recursive: true });
          const vorlaeufig = `${datei}.${process.pid}.${Date.now()}.tmp`;
          await writeFile(vorlaeufig, neu);
          await rename(vorlaeufig, datei); // erst vollständig schreiben, dann austauschen
          return json(antwort, 200, { eTag: etagVon(neu) }, { ETag: etagVon(neu) });
        });
      }
      if (anfrage.method === 'DELETE') {
        await unlink(datei).catch((e) => { if (e.code !== 'ENOENT') throw e; });
        return json(antwort, 200, {});
      }
    }
    return fehler(antwort, 404, 'Unbekannte Adresse.');
  }

  async function app(anfrage, antwort, url) {
    if (anfrage.method !== 'GET' && anfrage.method !== 'HEAD') return fehler(antwort, 405, 'Nicht erlaubt.');
    let weg = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    if (!APP_PFADE.test(weg) || weg.includes('..')) return fehler(antwort, 404, 'Nicht gefunden.');
    const bytes = await lesen(join(appOrdner, weg));
    if (!bytes) return fehler(antwort, 404, 'Nicht gefunden.');
    antwort.writeHead(200, { 'Content-Type': TYPEN[extname(weg)] || 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    antwort.end(anfrage.method === 'HEAD' ? undefined : bytes);
  }

  return createServer((anfrage, antwort) => {
    const url = new URL(anfrage.url, 'http://server');
    const lauf = url.pathname.startsWith('/api/') ? api(anfrage, antwort, url) : app(anfrage, antwort, url);
    lauf.catch((e) => {
      if (!antwort.headersSent) fehler(antwort, e.status || (e instanceof URIError ? 400 : 500), e.status ? e.message : 'Fehler auf dem Server.');
      else antwort.destroy();
    });
  });
}

// Direkt gestartet: Einstellungen aus der Umgebung
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  const adresse = process.env.NOTEN_ADRESSE || '127.0.0.1';
  const daten = process.env.NOTEN_DATEN || join(APP_ORDNER, 'daten');
  try {
    notenServer({ schluessel: process.env.NOTEN_SCHLUESSEL, daten }).listen(port, adresse, () => {
      console.log(`Notenverwaltung läuft auf http://${adresse}:${port} (Notendateien in ${daten})`);
    });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
