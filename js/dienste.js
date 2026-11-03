// Dienste im Hintergrund: Sperre nach Untätigkeit (SPEC 8.9), Untis-Import-Automatik, Ziehen-und-Ablegen, Teilen-Menü (SPEC 8.6).
import { K } from './kontext.js';
import { h, leeren, toast } from './ui.js';
import { einstellungen, ordnerHandleLaden, ordnerHandleSpeichern, ordnerHandleLoeschen, arbeitskopieSpeichern } from './speicher.js';
import { dateiTyp, neueDateien, abgleichPlanen, abgleichAnwenden } from './untis-eingang.js';
import { icsAbgleichStarten } from './ansichten/stundenplan.js';
import { pruefsumme } from './untis.js';
import { untisAbgleichStarten, vorschlaegeDialog } from './ansichten/untis-dialog.js';
import { onedriveClient, onedriveAngemeldet } from './sync-ui.js';
import { onedriveEingang } from './onedrive.js';
import { datumDeutsch } from './modell.js';

// ---------- Sperre ----------

let sperreTimer = null;
let gesperrt = false;

function sperreZeigen() {
  if (gesperrt || !K.buch || !K.passwort) return;
  gesperrt = true;
  // Arbeitskopie vor dem Sperren sichern (verschlüsselt)
  arbeitskopieSpeichern(K.buch, K.dateiname, K.geaendert, K.passwort).catch(() => {});
  const feld = h('input', { type: 'password', autocomplete: 'off', 'aria-label': 'Passwort zum Entsperren', id: 'entsperren-passwort' });
  const fehler = h('p', { class: 'fehlertext', role: 'alert' });
  const pruefen = () => {
    if (feld.value === K.passwort) {
      box.remove();
      gesperrt = false;
      sperreZuruecksetzen();
    } else {
      fehler.textContent = 'Falsches Passwort.';
      feld.value = '';
    }
  };
  feld.addEventListener('keydown', (e) => e.key === 'Enter' && pruefen());
  const box = h('div', { class: 'sperre', id: 'sperre', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'sperre-box' },
      h('h2', {}, 'Gesperrt'),
      h('p', {}, 'Die Notenverwaltung wurde nach einiger Zeit ohne Bedienung gesperrt. Bitte Passwort erneut eingeben.'),
      feld, fehler,
      h('button', { type: 'button', class: 'knopf primaer', onclick: pruefen }, 'Entsperren')));
  document.body.append(box);
  feld.focus();
}

export function sperreZuruecksetzen() {
  clearTimeout(sperreTimer);
  const min = Number(einstellungen().sperreMinuten);
  if (!(min > 0) || gesperrt) return;
  sperreTimer = setTimeout(sperreZeigen, min * 60 * 1000);
}

/** Für Tests und die Einstellungen: sofort sperren. */
export const sperreJetzt = sperreZeigen;

for (const ereignis of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
  document.addEventListener(ereignis, () => { if (!gesperrt) sperreZuruecksetzen(); }, { passive: true });
}
sperreZuruecksetzen();

// ---------- Untis: Quellen ----------

const HANDLE_NAME = 'untis-ordner';
export const istIcs = (name) => /\.ics$/i.test(String(name));

/** Ordner-Schnittstelle für einen gewählten PC-Ordner (File System Access API). */
export function ordnerAusHandle(handle) {
  return {
    async liste() {
      const out = [];
      for await (const [name, eintrag] of handle.entries()) {
        if (eintrag.kind !== 'file' || !(dateiTyp(name) || istIcs(name))) continue;
        const f = await eintrag.getFile();
        out.push({ name, geaendert: f.lastModified, lesen: () => f.arrayBuffer() });
      }
      return out;
    },
    async loeschen(name) {
      await handle.removeEntry(name);
    },
  };
}

/** Ablage der geteilten Dateien (Android-Teilen-Menü: der Service Worker legt sie im Cache ab). */
export function teilenOrdner() {
  return {
    async liste() {
      if (!globalThis.caches) return [];
      const c = await caches.open('untis-eingang');
      const out = [];
      for (const anfrage of await c.keys()) {
        const antwort = await c.match(anfrage);
        const name = decodeURIComponent(antwort.headers.get('X-Dateiname') || '');
        if (!name) continue;
        out.push({ name, geaendert: Number(antwort.headers.get('X-Zeit')) || 0, lesen: async () => (await c.match(anfrage)).arrayBuffer(), _key: anfrage });
      }
      return out;
    },
    async loeschen(name) {
      const c = await caches.open('untis-eingang');
      for (const anfrage of await c.keys()) {
        const antwort = await c.match(anfrage);
        if (decodeURIComponent(antwort.headers.get('X-Dateiname') || '') === name) await c.delete(anfrage);
      }
    },
    async verarbeitet(name) {
      return this.loeschen(name);
    },
  };
}

export async function ordnerErlaubnis(handle, schreiben) {
  const modus = { mode: schreiben ? 'readwrite' : 'read' };
  if ((await handle.queryPermission?.(modus)) === 'granted') return true;
  return false;
}

export async function ordnerWaehlen() {
  const handle = await globalThis.showDirectoryPicker({ id: 'untis', mode: einstellungen().untisLoeschen ? 'readwrite' : 'read' });
  await ordnerHandleSpeichern(HANDLE_NAME, handle);
  return handle;
}
export const ordnerEntfernen = () => ordnerHandleLoeschen(HANDLE_NAME);
export const gemerkterOrdner = () => ordnerHandleLaden(HANDLE_NAME).catch(() => null);

/** Alle Quellen, die gerade lesbar sind: PC-Ordner, OneDrive-Eingang, geteilte Dateien. */
export async function quellen() {
  const q = [];
  const handle = await gemerkterOrdner();
  if (handle && (await ordnerErlaubnis(handle, false))) q.push({ art: 'ordner', ordner: ordnerAusHandle(handle) });
  if (onedriveAngemeldet() && einstellungen().onedriveEingang) q.push({ art: 'onedrive', ordner: onedriveEingang(onedriveClient()) });
  q.push({ art: 'teilen', ordner: teilenOrdner() });
  return q;
}

// ---------- Untis: Hinweisleiste und Abgleich ----------

let pruefLaeuft = false;
let hinweisFuer = '';

function hinweisLeiste() {
  let el = document.getElementById('untis-hinweis');
  if (!el) {
    el = h('div', { id: 'untis-hinweis', class: 'hinweisleiste', role: 'status', hidden: true });
    document.getElementById('schutz-hinweis')?.after(el);
  }
  return el;
}

function hinweisAus() {
  const el = hinweisLeiste();
  el.hidden = true;
  leeren(el);
}

function standText(neu) {
  const s = neu.map((d) => d.stand).sort().at(-1) || '';
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  return m ? `${datumDeutsch(`${m[1]}-${m[2]}-${m[3]}`)} ${m[4]}:${m[5]}` : '';
}

async function nachImport(quelle, namen) {
  const e = einstellungen();
  for (const name of namen) {
    try {
      if (quelle.ordner.verarbeitet) await quelle.ordner.verarbeitet(name);
      else if (e.untisLoeschen && quelle.ordner.loeschen) await quelle.ordner.loeschen(name);
    } catch {
      /* Datei bleibt liegen: unkritisch, sie gilt als verarbeitet (Prüfsumme) */
    }
  }
}

/** Abgleich ohne Vorschau (Einstellung „automatisch abgleichen“): Änderungen anwenden, dann Vorschlagsliste zeigen. */
async function automatischAbgleichen(neu) {
  const plan = abgleichPlanen(K.buch, neu);
  if (plan.klassen.length === 0) {
    toast(plan.unbekannteKlassen.length ? `Untis-Liste: keine passende Klasse (${plan.unbekannteKlassen.join(', ')}).` : 'Untis-Liste: nichts abzugleichen.');
    abgleichAnwenden(K.buch, plan);
    return;
  }
  const zahlen = abgleichAnwenden(K.buch, plan);
  K.aenderung();
  K.neuZeichnen();
  const text = zahlen.map((z) => `${z.klasse}: ${z.neu} neu, ${z.geaendert} geändert, ${z.weggefallen} weggefallen`).join(' · ');
  const offen = plan.klassen.reduce((n, k) => n + k.plan.unzugeordnet.length, 0);
  toast(`Untis abgeglichen. ${text}${offen ? ` · ${offen} Person(en) nicht zuordenbar` : ''}${plan.unbekannteKlassen.length ? ` · unbekannte Klassen ignoriert: ${plan.unbekannteKlassen.join(', ')}` : ''}`);
  await vorschlaegeDialog(plan.klassen.map((k) => k.klasse));
}

export async function untisJetztAbgleichen(quelle, neu, { automatisch = false } = {}) {
  const dateien = neu.map((d) => ({ bytes: d.bytes, name: d.name }));
  if (automatisch) await automatischAbgleichen(neu);
  else {
    const ergebnis = await untisAbgleichStarten(dateien, { klasse: K.daten });
    if (ergebnis === -1) return false; // abgebrochen: nichts als verarbeitet markieren
  }
  await nachImport(quelle, neu.map((d) => d.name));
  return true;
}

/** Prüft alle Quellen auf neue Untis-Dateien und zeigt die Hinweisleiste (oder gleicht automatisch ab). */
export async function untisPruefen() {
  if (pruefLaeuft || !K.buch) return;
  pruefLaeuft = true;
  try {
    for (const quelle of await quellen()) {
      let r;
      try {
        r = await neueDateien(quelle.ordner, K.buch);
      } catch {
        continue; // Quelle gerade nicht lesbar
      }
      if (r.neu.length === 0) continue;
      const schluessel = r.neu.map((d) => d.pruefsumme).join(',');
      if (K.buch.einstellungen.untisOrdnerAutomatisch) {
        await untisJetztAbgleichen(quelle, r.neu, { automatisch: true });
        hinweisAus();
        return;
      }
      if (schluessel === hinweisFuer && !hinweisLeiste().hidden) return;
      hinweisFuer = schluessel;
      const el = hinweisLeiste();
      leeren(el);
      const stand = standText(r.neu);
      el.append(
        h('span', {}, `Neue Untis-Liste${stand ? ` vom ${stand}` : ''} gefunden – jetzt abgleichen?`),
        h('button', { type: 'button', class: 'knopf primaer', id: 'untis-abgleichen', onclick: async () => { hinweisAus(); await untisJetztAbgleichen(quelle, r.neu); } }, 'Jetzt abgleichen'),
        h('button', { type: 'button', class: 'knopf', onclick: () => { hinweisAus(); } }, 'Später'),
      );
      el.hidden = false;
      return;
    }
  } finally {
    pruefLaeuft = false;
  }
}

// ---------- Stundenplan (.ics) in denselben Quellen (SPEC 10.1) ----------

let icsLaeuft = false;
let icsHinweisFuer = '';

function icsHinweisLeiste() {
  let el = document.getElementById('ics-hinweis');
  if (!el) {
    el = h('div', { id: 'ics-hinweis', class: 'hinweisleiste', role: 'status', hidden: true });
    (document.getElementById('untis-hinweis') || document.getElementById('schutz-hinweis'))?.after(el);
  }
  return el;
}

/** Neueste .ics-Datei je Quelle, die noch nicht verarbeitet wurde (Prüfsumme). */
export async function neueIcsDateien(ordner, buch) {
  const alle = (await ordner.liste()).filter((d) => istIcs(d.name)).sort((a, b) => (b.geaendert || 0) - (a.geaendert || 0) || (a.name < b.name ? 1 : -1));
  if (alle.length === 0) return null;
  const neueste = alle[0];
  const bytes = await neueste.lesen();
  const summe = await pruefsumme(bytes);
  if ((buch.einstellungen.untisDateien || []).some((x) => x.pruefsumme === summe)) return null;
  return { name: neueste.name, bytes, pruefsumme: summe, geaendert: neueste.geaendert };
}

export async function icsPruefen() {
  if (icsLaeuft || !K.buch) return;
  icsLaeuft = true;
  try {
    for (const quelle of await quellen()) {
      let datei;
      try {
        datei = await neueIcsDateien(quelle.ordner, K.buch);
      } catch {
        continue;
      }
      if (!datei) continue;
      const markieren = () => {
        K.buch.einstellungen.untisDateien ||= [];
        if (!K.buch.einstellungen.untisDateien.some((x) => x.pruefsumme === datei.pruefsumme)) K.buch.einstellungen.untisDateien.push({ pruefsumme: datei.pruefsumme, name: datei.name, zeit: new Date().toISOString() });
        K.aenderung();
      };
      const abgleichen = async (automatisch) => {
        const fertig = await icsAbgleichStarten([{ bytes: datei.bytes, name: datei.name }], { automatisch });
        if (fertig) {
          markieren();
          await nachImport(quelle, [datei.name]);
        }
        return fertig;
      };
      if (K.buch.einstellungen.untisOrdnerAutomatisch) {
        if (await abgleichen(true)) { const el = icsHinweisLeiste(); el.hidden = true; return; }
      }
      if (datei.pruefsumme === icsHinweisFuer && !icsHinweisLeiste().hidden) return;
      icsHinweisFuer = datei.pruefsumme;
      const el = icsHinweisLeiste();
      leeren(el);
      const zeit = datei.geaendert ? new Date(datei.geaendert).toLocaleString('de-DE') : '';
      el.append(
        h('span', {}, `Neuer Stundenplan${zeit ? ' vom ' + zeit : ''} gefunden – jetzt abgleichen?`),
        h('button', { type: 'button', class: 'knopf primaer', id: 'ics-abgleichen', onclick: async () => { el.hidden = true; await abgleichen(false); } }, 'Jetzt abgleichen'),
        h('button', { type: 'button', class: 'knopf', onclick: () => { el.hidden = true; } }, 'Später'));
      el.hidden = false;
      return;
    }
  } finally {
    icsLaeuft = false;
  }
}

// Beim Öffnen der App bzw. eines Notenbuchs und danach jede Minute, solange die App sichtbar ist
let untisTimer = null;
export function untisUeberwachungStarten() {
  clearInterval(untisTimer);
  untisTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && K.buch && !gesperrt) { untisPruefen(); icsPruefen(); }
  }, 60 * 1000);
}
const nachOeffnenAlt = K.nachOeffnen;
K.nachOeffnen = () => {
  nachOeffnenAlt?.();
  untisPruefen();
  icsPruefen();
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { untisPruefen(); icsPruefen(); } });

// ---------- Ziehen und Ablegen ----------

document.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
});
document.addEventListener('drop', async (e) => {
  const alleDateien = [...(e.dataTransfer?.files || [])];
  const ics = alleDateien.filter((f) => istIcs(f.name));
  const dateien = alleDateien.filter((f) => /\.(xls|xlsx|csv)$/i.test(f.name));
  if (dateien.length === 0 && ics.length === 0) return;
  e.preventDefault();
  if (ics.length) {
    if (!K.buch) { toast('Bitte zuerst eine Notendatei öffnen, dann den Stundenplan (.ics) hineinziehen.'); return; }
    await icsAbgleichStarten(await Promise.all(ics.map(async (f) => ({ bytes: await f.arrayBuffer(), name: f.name }))));
    if (dateien.length === 0) return;
  }
  if (!K.buch) {
    toast('Bitte zuerst eine Notendatei öffnen, dann die Untis-Liste hineinziehen.');
    return;
  }
  const geladen = await Promise.all(dateien.map(async (f) => ({ bytes: await f.arrayBuffer(), name: f.name })));
  await untisAbgleichStarten(geladen, { klasse: K.daten });
});
