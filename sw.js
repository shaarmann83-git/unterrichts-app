// Offline-Dienst: legt die App-Dateien beim ersten Besuch ab und liefert sie danach ohne Netz.
const VERSION = 'noten-v4';
const DATEIEN = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'lib/xlsx.full.min.js',
  'js/app.js', 'js/registry.js', 'js/start-app.js', 'js/dalton.js', 'js/sport.js', 'js/sport-vorlagen.js', 'js/sport-excel.js', 'js/ical.js', 'js/stundenplan.js', 'js/foto.js', 'js/fehlzeiten.js', 'js/tabelle.js', 'js/sync.js', 'js/onedrive.js', 'lib/msal-browser.min.js', 'js/listen.js', 'js/untis-eingang.js', 'js/untis.js', 'js/nachschreiben.js', 'js/tabelle-datei.js', 'js/schuelerliste.js', 'js/aktionen.js', 'js/excel.js', 'js/ihk-schema.js', 'js/kontext.js', 'js/krypto.js',
  'js/modell.js', 'js/rechnen.js', 'js/speicher.js', 'js/ui.js',
  'js/ansichten/index.js', 'js/ansichten/stundenplan.js', 'js/ansichten/sport-gemeinsam.js', 'js/ansichten/sport-raster.js', 'js/ansichten/sport-nachstunde.js', 'js/ansichten/sport-pruefung.js', 'js/ansichten/sport-reihen.js', 'js/ansichten/sport-gesamt.js', 'js/ansichten/sport-druck.js', 'js/ansichten/sport-person.js', 'js/ansichten/besprechung.js', 'js/ansichten/einstellungen.js', 'js/dienste.js', 'js/sync-ui.js', 'js/ansichten/listen.js', 'js/ansichten/fehlzeiten.js', 'js/ansichten/nachschreiben.js', 'js/ansichten/untis-dialog.js', 'js/ansichten/dalton.js', 'js/ansichten/person.js', 'js/ansichten/archiv.js', 'js/ansichten/buch.js', 'js/ansichten/start.js', 'js/ansichten/grunddaten.js', 'js/ansichten/klassenarbeit.js',
  'js/ansichten/anwesenheit-lf.js',
  'js/ansichten/anwesenheit-druck.js',
  'js/ansichten/bewertung.js',
  'js/hilfe.js',
  'js/rhythmus.js', 'js/ansichten/sonstige.js', 'js/ansichten/gesamt.js', 'js/ansichten/drucken.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Erst Netz (damit Updates ankommen), bei Fehler die gespeicherte Datei.
self.addEventListener('fetch', (e) => {
  const anfrage = e.request;
  // Android-Teilen-Menü (Web Share Target): Untis-Dateien in einer Ablage merken, dann die App öffnen.
  if (anfrage.method === 'POST' && new URL(anfrage.url).pathname.endsWith('/share-target')) {
    e.respondWith(
      (async () => {
        const daten = await anfrage.formData();
        const ablage = await caches.open('untis-eingang');
        let n = 0;
        for (const datei of daten.getAll('untis')) {
          if (!datei || !datei.name) continue;
          const kopf = { 'X-Dateiname': encodeURIComponent(datei.name), 'X-Zeit': String(Date.now()), 'Content-Type': 'application/octet-stream' };
          await ablage.put(new Request(new URL(`eingang/${Date.now()}_${n++}`, self.registration.scope).href), new Response(datei, { headers: kopf }));
        }
        const hatIcs = daten.getAll('untis').some((d) => d && /\.ics$/i.test(d.name || ''));
        return Response.redirect(new URL(hatIcs ? 'index.html#/stundenplan' : 'index.html#/nachschreiben', self.registration.scope).href, 303);
      })(),
    );
    return;
  }
  if (anfrage.method !== 'GET' || new URL(anfrage.url).origin !== location.origin) return;
  e.respondWith(
    fetch(anfrage)
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(VERSION).then((c) => c.put(anfrage, kopie));
        }
        return antwort;
      })
      .catch(() => caches.match(anfrage).then((t) => t || caches.match('index.html'))),
  );
});
