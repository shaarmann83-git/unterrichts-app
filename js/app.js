// Start der App: Navigation, Ansichtswechsel, Statusanzeige, Autosave, Sperre, Offline-Dienst.
import { K } from './kontext.js';
import { h, leeren, toast, meldung } from './ui.js';
import { speichern } from './aktionen.js';
import { arbeitskopieSpeichern, einstellungen, einstellungSetzen } from './speicher.js';
import { anmeldungAbschliessen } from './onedrive.js';
import { hilfeStarten } from './hilfe.js';
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
ansichtRegistrieren('druck', { text: 'Drucken', bauen: zeigeDruck, klasse: true, klassenWahlSelbst: true, reihe: 10 });

/** Steht in der Adresse die Antwort einer Microsoft-Anmeldung? */
export const istAnmeldeAntwort = (hash = location.hash) => /^#(code|error|id_token|access_token|state)=/.test(hash);

let aktuell = null; // {el, update}
let autosaveTimer = null;
let kopieFehlerGemeldet = false;

function pfad() {
  const teile = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return teile.length ? teile : ['start'];
}

function sichtbar(def) {
  if (def.nurWenn && !def.nurWenn()) return false;
  return true;
}

// Gruppen für das aufklappbare Menü (Handy, Tablet hochkant). Am Rechner sind die Überschriften unsichtbar.
function menueGruppe(def) {
  const reihe = def.reihe ?? 50;
  if (reihe < 2) return 'Notenbuch';
  if (reihe < 9) return K.daten ? `Klasse ${K.daten.kopf.klasse || 'ohne Namen'}` : 'Klasse';
  return 'Übergreifend';
}

function menueSchliessen() {
  document.body.classList.remove('menue-offen');
  document.getElementById('knopf-menue')?.setAttribute('aria-expanded', 'false');
}

function menueZeichnen(aktiv) {
  const nav = document.getElementById('navigation');
  leeren(nav);
  const sortiert = Object.entries(ANSICHTEN).sort((a, b) => (a[1].reihe ?? 50) - (b[1].reihe ?? 50));
  let gruppe = '';
  for (const [id, def] of sortiert) {
    if (def.keinMenue || !sichtbar(def)) continue;
    const gesperrt = id !== 'start' && !def.ohneBuch && (!K.buch || (def.klasse && !def.klassenWahlSelbst && !K.daten));
    const g = menueGruppe(def);
    if (g !== gruppe) {
      gruppe = g;
      nav.append(h('span', { class: 'menue-gruppe' }, g));
    }
    nav.append(
      h(
        'a',
        {
          href: `#/${id}`,
          class: `menue-punkt${aktiv === id ? ' aktiv' : ''}${gesperrt ? ' gesperrt' : ''}`,
          'aria-current': aktiv === id ? 'page' : null,
          onclick: menueSchliessen,
        },
        def.text,
      ),
    );
  }
  // Im aufgeklappten Menü stehen auch Hilfe und Hell/Dunkel (die Knöpfe oben sind auf schmalen Bildschirmen ausgeblendet).
  nav.append(
    h('span', { class: 'menue-gruppe' }, 'Anzeige'),
    h('button', { type: 'button', class: 'menue-punkt menue-zusatz', onclick: () => { menueSchliessen(); document.getElementById('knopf-hilfe')?.click(); } }, 'Hilfe zu den Knöpfen an/aus'),
    h('button', { type: 'button', class: 'menue-punkt menue-zusatz', onclick: () => document.getElementById('knopf-farbe')?.click() }, 'Hell/Dunkel wechseln'),
  );
  const aktuell = document.getElementById('menue-aktuell');
  if (aktuell) aktuell.textContent = [ANSICHTEN[aktiv]?.text || 'Menü', ANSICHTEN[aktiv]?.klasse && K.daten?.kopf.klasse].filter(Boolean).join(' · ');
}

document.getElementById('knopf-menue')?.addEventListener('click', (e) => {
  const offen = document.body.classList.toggle('menue-offen');
  e.currentTarget.setAttribute('aria-expanded', String(offen));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menueSchliessen(); });
document.addEventListener('click', (e) => {
  if (document.body.classList.contains('menue-offen') && !e.target.closest('#kopf')) menueSchliessen();
});

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
    const od = K.sync ? ` · ${K.syncOrtName?.() || 'OneDrive'} ${K.sync.ausstehend ? 'ausstehend' : K.sync.zuletzt ? K.sync.zuletzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}` : '';
    leeren(status);
    status.append(
      h('span', { class: 'nur-breit' }, (K.geaendert ? 'Ungespeicherte Änderungen' : 'Gespeichert') + od),
      h('span', { class: 'nur-schmal' }, (K.geaendert ? 'Ungespeichert' : 'Gespeichert') + (K.sync?.ausstehend ? ' · offline' : '')),
    );
    status.className = `status ${K.geaendert ? 'ungespeichert' : 'gespeichert'}`;
    status.title = sync || '';
    knopf.hidden = false;
  } else {
    leeren(status);
    knopf.hidden = true;
  }
  const warn = document.getElementById('schutz-hinweis');
  if (warn) {
    const zeigen = K.buch && !K.passwort;
    warn.hidden = !zeigen;
    leeren(warn);
    if (zeigen) {
      warn.append(
        h('span', { class: 'nur-breit' }, 'Ohne Passwort ist die lokale Arbeitskopie in diesem Browser ungeschützt. Empfehlung: unter „Notenbuch“ ein Passwort setzen.'),
        h('a', { class: 'nur-schmal', href: '#/buch' }, 'Ohne Passwort ungeschützt. Unter „Notenbuch“ ein Passwort setzen.'),
      );
    }
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
  if (def.klasse && !K.daten && K.buch && !(def.klassenWahlSelbst && K.buch.klassen.length > 1)) {
    // Genau eine Klasse: gleich wählen. Sonst Kacheln.
    if (K.buch.klassen.length === 1) K.klasseId = K.buch.klassen[0].id;
    else {
      location.hash = '#/buch';
      return;
    }
  }
  menueSchliessen();
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
// Arbeitskopie sichern und danach (falls eingeschaltet) die Synchronisation anstoßen.
function autosaveAusfuehren() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  if (!K.buch) return;
  arbeitskopieSpeichern(K.buch, K.dateiname, K.geaendert, K.passwort).then(
    () => { kopieFehlerGemeldet = false; },
    (e) => {
      // Einmal melden, nicht bei jeder Eingabe. Nach einer erfolgreichen Sicherung wird wieder gemeldet.
      if (kopieFehlerGemeldet) return;
      kopieFehlerGemeldet = true;
      meldung('Arbeitskopie nicht gesichert', `Die lokale Arbeitskopie auf diesem Gerät konnte nicht gesichert werden (${e?.message || 'Speicher nicht verfügbar'}). Bitte jetzt speichern, sonst gehen Änderungen beim Schließen der App verloren.`);
    },
  );
  K.nachAenderung?.();
}

K.aenderung = () => {
  K.geaendert = true;
  K.stand = (K.stand || 0) + 1; // zählt Änderungen, damit ein laufender Upload spätere Änderungen nicht als gespeichert meldet
  statusZeichnen();
  K.aktualisieren();
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(autosaveAusfuehren, 600);
};

// Handy und Tablet beenden eine App im Hintergrund ohne Rückfrage. Deshalb die Arbeitskopie sofort sichern,
// sobald die App in den Hintergrund geht, statt die kurze Wartezeit abzuwarten.
function beimVerlassenSichern() {
  if (autosaveTimer) autosaveAusfuehren();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') beimVerlassenSichern(); });
window.addEventListener('pagehide', beimVerlassenSichern);

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
  hilfeStarten();
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
