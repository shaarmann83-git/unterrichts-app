// Foto einer Person: quadratischer Ausschnitt, verkleinert auf höchstens 256 × 256 Pixel, JPEG unter 30 KB (SPEC 8.4).
import { h, inhaltDialog, meldung } from './ui.js';

export const FOTO_MAX_SEITE = 256;
export const FOTO_MAX_BYTES = 30 * 1024;

/**
 * Quelle des quadratischen Ausschnitts. ox/oy in −1..1 verschieben den Ausschnitt.
 * Bei zoom < 1 ist der Ausschnitt größer als das Bild: Dann wird das ganze Bild gezeigt
 * und der Rest bleibt weiß. So gehen bereits zugeschnittene Fotos nicht verloren.
 */
export function zuschnitt(breite, hoehe, zoom = 1, ox = 0, oy = 0) {
  const z = Math.max(0.1, zoom);
  const seite = Math.min(breite, hoehe) / z;
  const grenze = (v) => Math.min(Math.max(v, -1), 1);
  const spielX = (breite - seite) / 2;
  const spielY = (hoehe - seite) / 2;
  return { sx: spielX + grenze(ox) * Math.abs(spielX), sy: spielY + grenze(oy) * Math.abs(spielY), seite };
}

/** Zoomwert, bei dem das ganze Bild in das Quadrat passt (bei quadratischen Bildern 1). */
export function ganzBildZoom(breite, hoehe) {
  if (!(breite > 0) || !(hoehe > 0)) return 1;
  return Math.min(breite, hoehe) / Math.max(breite, hoehe);
}

/** Größe der Daten, die ein data-URL im Dateiformat belegt (Bytes). */
export function dataUrlBytes(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** Zeichnet den Ausschnitt auf eine Leinwand der Seitenlänge `seite` und liefert ein JPEG-data-URL. */
function jpegAus(bild, ausschnitt, seite, qualitaet) {
  const c = document.createElement('canvas');
  c.width = seite;
  c.height = seite;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, seite, seite);
  g.drawImage(bild, ausschnitt.sx, ausschnitt.sy, ausschnitt.seite, ausschnitt.seite, 0, 0, seite, seite);
  return c.toDataURL('image/jpeg', qualitaet);
}

/** Verkleinert und komprimiert, bis das Ziel von 30 KB erreicht ist. */
export function fotoKomprimieren(bild, ausschnitt) {
  for (const seite of [FOTO_MAX_SEITE, 192, 128]) {
    for (let q = 0.85; q >= 0.4; q -= 0.1) {
      const url = jpegAus(bild, ausschnitt, seite, q);
      if (dataUrlBytes(url) <= FOTO_MAX_BYTES) return url;
    }
  }
  return jpegAus(bild, ausschnitt, 96, 0.5);
}

function bildLaden(datei) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(datei);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Das Bild konnte nicht gelesen werden.'));
    };
    img.src = url;
  });
}

/** Datei wählen (oder Kamera) und zuschneiden. Gibt ein JPEG-data-URL zurück oder null. */
// Zuletzt geöffnetes Bild dieser Sitzung. Bei Gruppenfotos muss dieselbe Datei
// sonst für jede Person erneut ausgewählt werden. Wird beim Schließen der Datei verworfen.
let letztesBild = null;

/** Gibt es ein Bild aus einem vorherigen Zuschnitt dieser Sitzung? */
export const letztesBildVorhanden = () => !!letztesBild;

/** Verwirft das gemerkte Bild (beim Schließen einer Notendatei). */
export function letztesBildVergessen() {
  letztesBild = null;
}

/** Zuschnitt aus dem zuletzt verwendeten Bild, ohne erneute Dateiauswahl. */
export async function fotoAusLetztem() {
  if (!letztesBild) return null;
  return ausschnittWaehlen(letztesBild);
}

export async function fotoErstellen(datei) {
  let bild;
  try {
    bild = await bildLaden(datei);
  } catch (e) {
    await meldung('Foto nicht möglich', e.message);
    return null;
  }
  letztesBild = bild;
  return ausschnittWaehlen(bild);
}

async function ausschnittWaehlen(bild) {
  const b = bild.naturalWidth;
  const hh = bild.naturalHeight;
  const vorschau = document.createElement('canvas');
  vorschau.width = 256;
  vorschau.height = 256;
  vorschau.className = 'foto-vorschau';
  const regler = (beschriftung, min, max, wert, schritt) => {
    const el = h('input', { type: 'range', min, max, step: schritt, value: wert, 'aria-label': beschriftung });
    return { el, label: h('label', {}, beschriftung, el) };
  };
  // Voreinstellung: das ganze Bild ist sichtbar, nichts wird abgeschnitten.
  // Der große Zoombereich ist für Gruppenfotos nötig, aus denen ein Gesicht geschnitten wird.
  const start = ganzBildZoom(b, hh);
  const zoom = regler('Zoom', 0.3, 20, start, 0.05);
  const xs = regler('Ausschnitt links/rechts', -1, 1, 0, 0.05);
  const ys = regler('Ausschnitt oben/unten', -1, 1, 0, 0.05);
  const zeichnen = () => {
    const a = zuschnitt(b, hh, Number(zoom.el.value), Number(xs.el.value), Number(ys.el.value));
    const g = vorschau.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 256, 256);
    g.drawImage(bild, a.sx, a.sy, a.seite, a.seite, 0, 0, 256, 256);
  };
  for (const r of [zoom, xs, ys]) r.el.addEventListener('input', zeichnen);

  // Ausschnitt mit der Maus oder dem Finger verschieben und mit dem Mausrad zoomen.
  vorschau.classList.add('ziehbar');
  let zieht = null;
  const schieben = (dx, dy) => {
    const a = zuschnitt(b, hh, Number(zoom.el.value), 0, 0);
    const spielX = Math.abs((b - a.seite) / 2);
    const spielY = Math.abs((hh - a.seite) / 2);
    const proPixel = a.seite / 256;
    if (spielX > 0) xs.el.value = String(Math.min(1, Math.max(-1, Number(xs.el.value) - (dx * proPixel) / spielX)));
    if (spielY > 0) ys.el.value = String(Math.min(1, Math.max(-1, Number(ys.el.value) - (dy * proPixel) / spielY)));
    zeichnen();
  };
  vorschau.addEventListener('pointerdown', (ev) => {
    zieht = { x: ev.clientX, y: ev.clientY };
    vorschau.setPointerCapture(ev.pointerId);
  });
  vorschau.addEventListener('pointermove', (ev) => {
    if (!zieht) return;
    schieben(ev.clientX - zieht.x, ev.clientY - zieht.y);
    zieht = { x: ev.clientX, y: ev.clientY };
  });
  const loslassen = (ev) => {
    zieht = null;
    try { vorschau.releasePointerCapture(ev.pointerId); } catch { /* schon freigegeben */ }
  };
  vorschau.addEventListener('pointerup', loslassen);
  vorschau.addEventListener('pointercancel', loslassen);
  vorschau.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const neu = Number(zoom.el.value) * (ev.deltaY < 0 ? 1.1 : 1 / 1.1);
    zoom.el.value = String(Math.min(20, Math.max(0.3, neu)));
    zeichnen();
  }, { passive: false });
  zeichnen();
  const setzen = (z) => { zoom.el.value = String(z); xs.el.value = '0'; ys.el.value = '0'; zeichnen(); };
  const knoepfe = h('div', { class: 'knopfreihe' },
    h('button', { type: 'button', class: 'knopf klein', onclick: () => setzen(start) }, 'Ganzes Bild'),
    h('button', { type: 'button', class: 'knopf klein', onclick: () => setzen(1) }, 'Quadrat füllen'));
  const ok = await inhaltDialog('Bildausschnitt wählen', [
    h('p', { class: 'klein' }, 'Bei einem Gruppenfoto: hineinzoomen und das Bild mit der Maus oder dem Finger verschieben, bis das Gesicht im Quadrat liegt.'),
    vorschau, knoepfe, zoom.label, xs.label, ys.label], [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: 'Foto übernehmen', wert: true, klasse: 'knopf primaer' },
  ]);
  if (!ok) return null;
  return fotoKomprimieren(bild, zuschnitt(b, hh, Number(zoom.el.value), Number(xs.el.value), Number(ys.el.value)));
}
