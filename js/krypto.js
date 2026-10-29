// Passwortschutz der Notendatei: AES-GCM, Schlüssel per PBKDF2 (SHA-256, zufälliges Salt).
import { pruefeDaten } from './modell.js';

export const PBKDF2_ITERATIONEN = 310000;
const FORMAT_VERSCHLUESSELT = 'noten-verschluesselt';

function inBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function ausBase64(text) {
  const s = atob(text);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function schluesselAbleiten(passwort, salt, iterationen) {
  const subtle = globalThis.crypto.subtle;
  const basis = await subtle.importKey('raw', new TextEncoder().encode(passwort), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iterationen, hash: 'SHA-256' },
    basis,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Notendaten -> Dateitext. Mit Passwort verschlüsselt, sonst Klartext-JSON. */
export async function inDateitext(daten, passwort) {
  const json = JSON.stringify(daten);
  if (!passwort) return JSON.stringify(daten, null, 1);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const schluessel = await schluesselAbleiten(passwort, salt, PBKDF2_ITERATIONEN);
  const chiffre = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    schluessel,
    new TextEncoder().encode(json),
  );
  return JSON.stringify({
    format: FORMAT_VERSCHLUESSELT,
    version: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterationen: PBKDF2_ITERATIONEN, salt: inBase64(salt) },
    verfahren: 'AES-GCM',
    iv: inBase64(iv),
    daten: inBase64(new Uint8Array(chiffre)),
  });
}

/** Sagt, ob ein Dateitext verschlüsselt ist (ohne Passwort zu brauchen). */
export function istVerschluesselt(text) {
  try {
    return JSON.parse(text).format === FORMAT_VERSCHLUESSELT;
  } catch {
    return false;
  }
}

/** Dateitext -> Notendaten. Wirft bei falschem Passwort oder falschem Format. */
export async function ausDateitext(text, passwort) {
  let roh;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine gültige Notendatei.');
  }
  if (roh.format === FORMAT_VERSCHLUESSELT) {
    if (!passwort) throw new Error('Diese Datei ist passwortgeschützt.');
    const { kdf } = roh;
    // Untergrenze schützt vor manipulierten Dateien mit absichtlich schwachem Schlüssel.
    if (!kdf || kdf.iterationen < PBKDF2_ITERATIONEN) {
      throw new Error('Die Datei hat eine zu schwache Verschlüsselung und wird nicht geöffnet.');
    }
    const schluessel = await schluesselAbleiten(passwort, ausBase64(kdf.salt), kdf.iterationen);
    let klartext;
    try {
      klartext = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ausBase64(roh.iv) },
        schluessel,
        ausBase64(roh.daten),
      );
    } catch {
      throw new Error('Falsches Passwort oder beschädigte Datei.');
    }
    return pruefeDaten(JSON.parse(new TextDecoder().decode(klartext)));
  }
  return pruefeDaten(roh);
}
