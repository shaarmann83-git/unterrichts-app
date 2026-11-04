// Foto einer Person: quadratischer Ausschnitt, verkleinert auf höchstens 256 × 256 Pixel, JPEG unter 30 KB (SPEC 8.4).
import { h, inhaltDialog, meldung } from './ui.js';

export const FOTO_MAX_SEITE = 256;
export const FOTO_MAX_BYTES = 30 * 1024;

/** Quelle des quadratischen Ausschnitts. zoom ≥ 1, ox/oy in −1..1 (Verschiebung). */
export function zuschnitt(breite, hoehe, zoom = 1, ox = 0, oy = 0) {
  const z = Math.max(1, zoom);
  const seite = Math.min(breite, hoehe) / z;
  const klemme = (v, max) => Math.min(Math.max(v, 0), max);
  const sx = klemme((breite - seite) / 2 + ox * ((breite - seite) / 2), breite - seite);
  const sy = klemme((hoehe - seite) / 2 + oy * ((hoehe - seite) / 2), hoehe - seite);
  return { sx, sy, seite };
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
export async function fotoErstellen(datei) {
  let bild;
  try {
    bild = await bildLaden(datei);
  } catch (e) {
    await meldung('Foto nicht möglich', e.message);
    return null;
  }
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
  const zoom = regler('Zoom', 1, 4, 1, 0.05);
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
  zeichnen();
  const ok = await inhaltDialog('Bildausschnitt wählen', [vorschau, zoom.label, xs.label, ys.label], [
    { text: 'Abbrechen', wert: false, abbruch: true },
    { text: 'Foto übernehmen', wert: true, klasse: 'knopf primaer' },
  ]);
  if (!ok) return null;
  return fotoKomprimieren(bild, zuschnitt(b, hh, Number(zoom.el.value), Number(xs.el.value), Number(ys.el.value)));
}
