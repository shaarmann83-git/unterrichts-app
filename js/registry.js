// Verzeichnis der Ansichten (Menü und Routen). Eigenes Modul ohne Abhängigkeiten, damit Ansichten sich anmelden können,
// ohne dass sich Module gegenseitig im Kreis laden.
export const ANSICHTEN = {};

/** def: { text, bauen(params), klasse (braucht gewählte Klasse), reihe (Menüreihenfolge), keinMenue, nurWenn() } */
export function ansichtRegistrieren(id, def) {
  ANSICHTEN[id] = def;
}
