// Gemeinsamer Zustand der geöffneten Notendatei (Notenbuch). Wird von app.js mit Funktionen befüllt.
export const K = {
  buch: null, // geöffnetes Notenbuch
  klasseId: null, // gewählte Klasse
  passwort: '', // nur im Arbeitsspeicher, nie gespeichert
  handle: null, // Dateizugriff (File System Access API), falls vorhanden
  dateiname: '',
  geaendert: false, // ungespeicherte Änderungen gegenüber der Notendatei
  /** Die aktuell gewählte Klasse (der bisherige „Datenblock“); null, wenn keine gewählt ist. */
  get daten() {
    return this.buch?.klassen.find((k) => k.id === this.klasseId) || null;
  },
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
