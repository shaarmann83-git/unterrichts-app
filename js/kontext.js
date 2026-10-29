// Gemeinsamer Zustand der geöffneten Notendatei. Wird von app.js mit Funktionen befüllt.
export const K = {
  daten: null, // aktuell geöffnete Notendaten
  passwort: '', // nur im Arbeitsspeicher, nie gespeichert
  handle: null, // Dateizugriff (File System Access API), falls vorhanden
  dateiname: '',
  geaendert: false, // ungespeicherte Änderungen gegenüber der Notendatei
  /** Nach jeder Änderung am Datenmodell aufrufen. */
  aenderung() {},
  /** Berechnete Anzeigen der aktuellen Ansicht neu zeichnen. */
  aktualisieren() {},
  /** Aktuelle Ansicht komplett neu aufbauen (z. B. nach Löschen). */
  neuZeichnen() {},
  navigiere(pfad) {
    location.hash = `#/${pfad}`;
  },
};
