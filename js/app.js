// Start der App: Navigation, Ansichtswechsel, Statusanzeige, Autosave, Offline-Dienst.
import { K } from './kontext.js';
import { h, leeren } from './ui.js';
import { speichern } from './aktionen.js';
import { arbeitskopieSpeichern, einstellungen, einstellungSetzen } from './speicher.js';
import { zeigeStart } from './ansichten/start.js';
import { zeigeGrunddaten } from './ansichten/grunddaten.js';
import { zeigeKlassenarbeit } from './ansichten/klassenarbeit.js';
import { zeigeSonstige } from './ansichten/sonstige.js';
import { zeigeGesamt } from './ansichten/gesamt.js';
import { zeigeDruck } from './ansichten/drucken.js';

const MENUE = [
  ['start', 'Start'],
  ['grunddaten', 'Grunddaten'],
  ['ka', 'Klassenarbeiten'],
  ['sl', 'Sonstige Leistung'],
  ['gesamt', 'Gesamtübersicht'],
  ['druck', 'Drucken'],
];

let aktuell = null; // {el, update}
let autosaveTimer = null;

function pfad() {
  const teile = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return teile.length ? teile : ['start'];
}

function menueZeichnen(aktiv) {
  const nav = document.getElementById('navigation');
  leeren(nav);
  for (const [id, text] of MENUE) {
    const gesperrt = id !== 'start' && !K.daten;
    nav.append(
      h(
        'a',
        {
          href: `#/${id}`,
          class: `menue-punkt${aktiv === id ? ' aktiv' : ''}${gesperrt ? ' gesperrt' : ''}`,
          'aria-current': aktiv === id ? 'page' : null,
        },
        text,
      ),
    );
  }
}

function statusZeichnen() {
  const titel = document.getElementById('dokument-titel');
  const status = document.getElementById('status');
  const knopf = document.getElementById('knopf-speichern');
  if (K.daten) {
    const k = K.daten.kopf;
    titel.textContent = [k.klasse, k.lernfeldNr && `LF ${k.lernfeldNr}`, k.schuljahr].filter(Boolean).join(' · ');
    status.textContent = K.geaendert ? 'Ungespeicherte Änderungen' : 'Gespeichert';
    status.className = `status ${K.geaendert ? 'ungespeichert' : 'gespeichert'}`;
    knopf.hidden = false;
  } else {
    titel.textContent = '';
    status.textContent = '';
    knopf.hidden = true;
  }
}

function zeigeAnsicht() {
  const [bereich, ...rest] = pfad();
  if (bereich !== 'start' && !K.daten) {
    location.hash = '#/start';
    return;
  }
  const ziel = document.getElementById('ansicht');
  leeren(ziel);
  document.body.dataset.ansicht = bereich;
  const ansichten = {
    start: zeigeStart,
    grunddaten: zeigeGrunddaten,
    ka: zeigeKlassenarbeit,
    sl: zeigeSonstige,
    gesamt: zeigeGesamt,
    druck: zeigeDruck,
  };
  const bauen = ansichten[bereich] || zeigeStart;
  aktuell = bauen(rest);
  ziel.append(aktuell.el);
  menueZeichnen(ansichten[bereich] ? bereich : 'start');
  statusZeichnen();
  window.scrollTo(0, 0);
}

K.statusAktualisieren = statusZeichnen;
K.neuZeichnen = zeigeAnsicht;
K.aktualisieren = () => aktuell?.update?.();
K.aenderung = () => {
  K.geaendert = true;
  statusZeichnen();
  K.aktualisieren();
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    if (K.daten) arbeitskopieSpeichern(K.daten, K.dateiname, K.geaendert).catch(() => {});
  }, 600);
};

// ---------- Farbschema ----------
function farbschemaAnwenden() {
  const wahl = einstellungen().farbschema;
  if (wahl === 'auto') document.documentElement.removeAttribute('data-farbe');
  else document.documentElement.dataset.farbe = wahl;
}

document.getElementById('knopf-farbe').addEventListener('click', () => {
  const dunkelJetzt = document.documentElement.dataset.farbe
    ? document.documentElement.dataset.farbe === 'dunkel'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  einstellungSetzen('farbschema', dunkelJetzt ? 'hell' : 'dunkel');
  farbschemaAnwenden();
});

document.getElementById('knopf-speichern').addEventListener('click', () => speichern());

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && K.daten) {
    e.preventDefault();
    speichern();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (K.daten && K.geaendert) {
    e.preventDefault();
    e.returnValue = '';
  }
});

window.addEventListener('hashchange', zeigeAnsicht);

farbschemaAnwenden();
zeigeAnsicht();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
