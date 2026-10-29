// Offline-Dienst: legt die App-Dateien beim ersten Besuch ab und liefert sie danach ohne Netz.
const VERSION = 'noten-v1';
const DATEIEN = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'lib/xlsx.full.min.js',
  'js/app.js', 'js/registry.js', 'js/start-app.js', 'js/dalton.js', 'js/foto.js', 'js/fehlzeiten.js', 'js/tabelle.js', 'js/listen.js', 'js/untis-eingang.js', 'js/untis.js', 'js/nachschreiben.js', 'js/tabelle-datei.js', 'js/schuelerliste.js', 'js/aktionen.js', 'js/excel.js', 'js/ihk-schema.js', 'js/kontext.js', 'js/krypto.js',
  'js/modell.js', 'js/rechnen.js', 'js/speicher.js', 'js/ui.js',
  'js/ansichten/index.js', 'js/ansichten/listen.js', 'js/ansichten/fehlzeiten.js', 'js/ansichten/nachschreiben.js', 'js/ansichten/untis-dialog.js', 'js/ansichten/dalton.js', 'js/ansichten/person.js', 'js/ansichten/archiv.js', 'js/ansichten/buch.js', 'js/ansichten/start.js', 'js/ansichten/grunddaten.js', 'js/ansichten/klassenarbeit.js',
  'js/ansichten/sonstige.js', 'js/ansichten/gesamt.js', 'js/ansichten/drucken.js',
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
