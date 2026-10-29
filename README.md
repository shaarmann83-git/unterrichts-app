# Notenverwaltung

Eine Web-App für Lehrkräfte, die die Excel-Vorlage „Notenliste_Teilzeit_V4.xlsx“ ersetzt. Sie läuft im Browser (Windows-PC, Tablet, optional Handy), funktioniert offline und sendet keine Daten an einen Server.

## Was die App kann

- **Grunddaten:** Klasse, Lernfeld, Schuljahr, Gewichtung schriftlich/sonstige, Schülerliste (Reihenfolge ändern, alphabetisch sortieren, Löschen mit Rückfrage).
- **Klassenarbeiten:** Tabelle wie in Excel (Tab und Enter zum Weiterspringen), Höchstpunkte je Aufgabe, Fehlermarkierung bei zu hohen Punkten, Attest, Notenspiegel. Auf schmalen Bildschirmen „Schüler:in für Schüler:in“ mit Vor/Zurück.
- **Sonstige Leistung:** „Heutige Stunde“ zur Schnelleingabe nach dem Unterricht (Note, Notiz, Tasten für 1 bis 5), Übersicht nach Termin, Übersicht nach Person.
- **Gesamtübersicht:** Gesamtprozent, Gesamtnote, Einzelgewichte der Klassenarbeiten direkt änderbar, Export als `.xlsx` und `.csv`.
- **Drucken:** Protokoll je Klassenarbeit und Schüler:in (einzeln oder Sammeldruck), Korrekturliste blanko, Gesamtübersicht, Notenspiegel. Über den Druckdialog auch als PDF.
- **Import** der Excel-Vorlage V4 mit Vorschau.

Die Rechenregeln stehen in `docs/SPEC.md` (Abschnitt 4). Kurz: Prozent wird abgeschnitten, nicht gerundet; Notengrenzen 91,5 / 80,5 / 66,5 / 49,5 / 29,5; Durchschnitte sind gewichtet. Angezeigt wird gerundet, gerechnet wird ohne Rundung.

## Öffnen

**Online über GitHub Pages:** Im Repository unter *Settings → Pages* bei „Build and deployment“ die Quelle „Deploy from a branch“ wählen, Branch `main`, Ordner `/ (root)`, speichern. Nach kurzer Zeit zeigt GitHub die Adresse an. Beim ersten Öffnen lädt der Browser alle Dateien. Danach läuft die App auch ohne Internet, und sie kann über das Browsermenü „installiert“ werden.

**Lokal ohne Internet:** Die App braucht einen kleinen Webserver, weil Browser Module von `file://` nicht laden. Im Ordner: `python3 -m http.server 8000` und dann `http://localhost:8000` öffnen.

## Notendateien sicher ablegen

- Die Daten einer Klasse liegen in einer Notendatei `<Klasse>_<Schuljahr>.noten`. Legen Sie sie nur an einem geschützten Ort ab (verschlüsselter Ordner oder Schul-Cloud).
- **Passwortschutz:** Unter „Grunddaten“ können Sie ein Passwort setzen. Die Datei wird dann mit AES-GCM verschlüsselt (Schlüssel per PBKDF2, 310 000 Runden, SHA-256). **Ein vergessenes Passwort kann nicht wiederhergestellt werden.**
- **Speichern:** In Chrome und Edge am PC überschreibt „Speichern“ die geöffnete Datei direkt. In Safari (iPad) und Firefox lädt „Speichern“ die Datei herunter, und „Notendatei öffnen“ lädt sie wieder hoch.
- **Arbeitskopie im Browser:** Die App legt zur Sicherheit eine Kopie in Ihrem Browser ab (IndexedDB). Diese Kopie ist **nicht** durch das Passwort der Notendatei geschützt. Auf fremden oder gemeinsam genutzten Geräten schalten Sie auf der Startseite „Keine Daten auf diesem Gerät behalten“ ein. Mit „Alle lokalen Daten auf diesem Gerät löschen“ entfernen Sie alles.
- Niemals echte Schülerdaten ins Repository legen. `.gitignore` blockiert `*.xlsx`, `*.noten`, `*.noten.json`.

## Entwicklung und Tests

Keine Installation nötig, nur Node.js ab Version 20:

```bash
npm test
```

Die Tests prüfen alle Rechenregeln (inklusive Prüffall, Grenzwerte, Abschneiden statt Runden), Verschlüsselung, Excel-Import/-Export und dass keine Fremdserver eingebunden sind. Die Excel-Bibliothek SheetJS (`lib/xlsx.full.min.js`, Version 0.18.5, Apache-2.0-Lizenz in `lib/xlsx.LICENSE`) liegt im Repository und wird nicht von einem CDN geladen.

`js/ihk-schema.js` enthält dieselben Werte wie `docs/ihk-schema.json`; ein Test stellt sicher, dass beide übereinstimmen.
