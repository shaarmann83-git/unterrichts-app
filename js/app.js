// Start der App: Navigation, Ansichtswechsel, Statusanzeige, Autosave, Sperre, Offline-Dienst.
import { K } from './kontext.js';
import { h, leeren, toast } from './ui.js';
import { speichern } from './aktionen.js';
import { arbeitskopieSpeichern, einstellungen, einstellungSetzen } from './speicher.js';
import { anmeldungAbschliessen } from './onedrive.js';
import { buchTitel, buchHatFotos } from './modell.js';
import { ANSICHTEN, ansichtRegistrieren } from './registry.js';
import { zeigeStart } from './ansichten/start.js';
import { zeigeBuch } from './ansichten/buch.js';
import { zeigeGrunddaten } from './ansichten/grunddaten.js';
import { zeigeKlassenarbeit } from './ansichten/klassenarbeit.js';
import { zeigeSonstige } from './ansichten/sonstige.js';
import { zeigeGesamt } from './ansichten/gesamt.js';
import { zeigeDruck } from './ansichten/drucken.js';

// Kernansichten (weitere melden sich in ansichten/index.js an)
ansichtRegistrieren('start', { text: 'Start', bauen: zeigeStart, klasse: false, reihe: 0 });
ansichtRegistrieren('buch', { text: 'Notenbuch', bauen: zeigeBuch, klasse: false, reihe: 1 });
ansichtRegistrieren('grunddaten', { text: 'Grunddaten', bauen: zeigeGrunddaten, klasse: true, reihe: 2 });
const lernfeld = () => !K.daten || K.daten.fachtyp !== 'sport';
ansichtRegistrieren('ka', { text: 'Klassenarbeiten', bauen: zeigeKlassenarbeit, klasse: true, reihe: 3, nurWenn: lernfeld });
ansichtRegistrieren('sl', { text: 'Sonstige Leistung', bauen: zeigeSonstige, klasse: true, reihe: 4, nurWenn: lernfeld });
ansichtRegistrieren('gesamt', { text: 'Gesamtübersicht', bauen: zeigeGesamt, klasse: true, reihe: 8, nurWenn: lernfeld });
ansichtRegistrieren('druck', { text: 'Drucken', bauen: zeigeDruck, klasse: true, reihe: 10 });

/** Steht in der Adresse die Antwort einer Microsoft-Anmeldung? */
export const istAnmeldeAntwort = (hash = location.hash) => /^#(code|error|id_token|access_token|state)=/.test(hash);

let aktuell = null; // {el, update}
let autosaveTimer = null;

function pfad() {
  const teile = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return teile.length ? teile : ['start'];
}

function sichtbar(def) {
  if (def.nurWenn && !def.nurWenn()) return false;
  return true;
}

function menueZeichnen(aktiv) {
  const nav = document.getElementById('navigation');
  leeren(nav);
  const sortiert = Object.entries(ANSICHTEN).sort((a, b) => (a[1].reihe ?? 50) - (b[1].reihe ?? 50));
  for (const [id, def] of sortiert) {
    if (def.keinMenue || !sichtbar(def)) continue;
    const gesperrt = id !== 'start' && !def.ohneBuch && (!K.buch || (def.klasse && !K.daten));
    nav.append(
      h(
        'a',
        {
          href: `#/${id}`,
          class: `menue-punkt${aktiv === id ? ' aktiv' : ''}${gesperrt ? ' gesperrt' : ''}`,
          'aria-current': aktiv === id ? 'page' : null,
        },
        def.text,
      ),
    );
  }
}

function klassenWahlZeichnen() {
  const ziel = document.getElementById('dokument-titel');
  leeren(ziel);
  if (!K.buch) return;
  if (K.buch.klassen.length === 0) {
    ziel.textContent = buchTitel(K.buch);
    return;
  }
  const auswahl = h(
    'select',
    {
      class: 'klassenwahl',
      'aria-label': 'Klasse wählen',
      onchange: (e) => {
        K.klasseId = e.target.value || null;
        const [bereich] = pfad();
        if (!K.klasseId) K.navigiere('buch');
        else if (ANSICHTEN[bereich]?.klasse) K.neuZeichnen();
        else K.navigiere('grunddaten');
        statusZeichnen();
      },
    },
    h('option', { value: '' }, `Notenbuch (${K.buch.klassen.length} ${K.buch.klassen.length === 1 ? 'Klasse' : 'Klassen'})`),
    K.buch.klassen.map((k) =>
      h('option', { value: k.id, selected: k.id === K.klasseId }, [k.kopf.klasse || 'Ohne Namen', k.kopf.lernfeldNr && `LF ${k.kopf.lernfeldNr}`, k.kopf.schuljahr].filter(Boolean).join(' · ')),
    ),
  );
  ziel.append(auswahl);
}

function statusZeichnen() {
  menueZeichnen(pfad()[0]);
  const status = document.getElementById('status');
  const knopf = document.getElementById('knopf-speichern');
  klassenWahlZeichnen();
  if (K.buch) {
    const sync = K.syncStatus?.();
    const od = K.sync ? ` · OneDrive ${K.sync.ausstehend ? 'ausstehend' : K.sync.zuletzt ? K.sync.zuletzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}` : '';
    status.textContent = (K.geaendert ? 'Ungespeicherte Änderungen' : 'Gespeichert') + od;
    status.className = `status ${K.geaendert ? 'ungespeichert' : 'gespeichert'}`;
    status.title = sync || '';
    knopf.hidden = false;
  } else {
    status.textContent = '';
    knopf.hidden = true;
  }
  const warn = document.getElementById('schutz-hinweis');
  if (warn) {
    const zeigen = K.buch && !K.passwort;
    warn.hidden = !zeigen;
    warn.textContent = zeigen
      ? 'Ohne Passwort ist die lokale Arbeitskopie in diesem Browser ungeschützt. Empfehlung: unter „Notenbuch“ ein Passwort setzen.'
      : '';
  }
}

function zeigeAnsicht() {
  // Antwort der Microsoft-Anmeldung (#code=…): Adresse nicht anfassen, sonst findet MSAL die Antwort nicht mehr
  if (istAnmeldeAntwort()) return;
  const [bereich, ...rest] = pfad();
  const def = ANSICHTEN[bereich];
  if (!def) {
    location.hash = '#/start';
    return;
  }
  if (bereich !== 'start' && !K.buch && !def.ohneBuch) {
    location.hash = '#/start';
    return;
  }
  // Ansichten, die für den Fachtyp der gewählten Klasse nicht passen: zur passenden Startansicht
  if (def.klasse && K.daten && def.nurWenn && !def.nurWenn()) {
    location.hash = K.daten.fachtyp === 'sport' ? '#/nachstunde' : '#/gesamt';
    return;
  }
  if (def.klasse && !K.daten && K.buch) {
    // Genau eine Klasse: gleich wählen. Sonst Kacheln.
    if (K.buch.klassen.length === 1) K.klasseId = K.buch.klassen[0].id;
    else {
      location.hash = '#/buch';
      return;
    }
  }
  const ziel = document.getElementById('ansicht');
  leeren(ziel);
  document.body.dataset.ansicht = bereich;
  aktuell = def.bauen(rest);
  ziel.append(aktuell.el);
  menueZeichnen(bereich);
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
    if (K.buch) {
      arbeitskopieSpeichern(K.buch, K.dateiname, K.geaendert, K.passwort).catch(() => {});
      K.nachAenderung?.();
    }
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
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && K.buch) {
    e.preventDefault();
    speichern();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (K.buch && K.geaendert) {
    e.preventDefault();
    e.returnValue = '';
  }
});

window.addEventListener('hashchange', zeigeAnsicht);

export function appStarten() {
  farbschemaAnwenden();
  if (istAnmeldeAntwort()) {
    // Rückkehr von der Microsoft-Anmeldung (Handy, Tablet): abschließen, MSAL leitet danach auf die Seite zurück
    const e = einstellungen();
    anmeldungAbschliessen({ clientId: e.onedriveClientId?.trim(), tenantId: e.onedriveTenantId?.trim() })
      .catch(() => {})
      .finally(() => {
        if (istAnmeldeAntwort()) { history.replaceState(null, '', location.pathname); zeigeAnsicht(); }
        import('./sync-ui.js').then((m) => m.onedriveStill()).then((c) => { if (c) toast('Bei OneDrive angemeldet.'); }).catch(() => {});
      });
  } else {
    zeigeAnsicht();
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
