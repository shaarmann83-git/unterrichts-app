# Notenverwaltung

Eine Web-App für Lehrkräfte, die die Excel-Vorlage „Notenliste_Teilzeit_V4.xlsx“ ersetzt. Sie läuft im Browser (Windows-PC, Tablet, optional Handy), funktioniert offline und sendet **ohne eigene Einrichtung nichts ins Netz**. Die vollständige Anforderung steht in `docs/SPEC.md`.

## Was die App kann

**Stufe 1**
- **Notenbuch:** Eine Notendatei enthält beliebig viele Klassen (Kacheln: Klasse anlegen, umbenennen, löschen, kopieren). Alte Dateien mit einer Klasse werden beim Öffnen automatisch umgewandelt.
- **Grunddaten, Klassenarbeiten, Sonstige Leistung** (Schnelleingabe „Heutige Stunde“), **Gesamtübersicht** mit Einzelgewichten, **Drucken/PDF** (Protokoll je Arbeit und Person, Korrekturliste, Notenspiegel), **Import** der Excel-Vorlage V4, **Export** als `.xlsx` und `.csv`.

**Stufe 2**
- **Schaltbare Bereiche je Klasse:** Dalton, Duales System (Ausbildungsbetrieb), Fotos. Ausgeschaltete Bereiche sind unsichtbar.
- **Dalton:** Aufgaben mit Status, Qualität und Notiz, einstellbare Zuordnung zu Noten, optional mit Anteil (Standard 10 %) in der sonstigen Leistung; Druckblatt „Bewertungskriterien“.
- **Fotos:** nur mit Einwilligung (mit Datum), quadratisch auf höchstens 256 × 256 Pixel verkleinert (JPEG unter 30 KB), nur in der Notendatei, nie in Export und Druck. **Fotos sind nur mit Passwort möglich.**
- **Fehlzeiten** mit Import aus WebUntis, **Nachschreiben** (Teilnahme je Klassenarbeit, Vorschläge zur Bestätigung, Nachschreibliste über alle Klassen).
- **Zwischenstand zum Stichtag** für Halbjahreszeugnisse, **Archiv** statt Löschen, **eigene Listen** (Strich-, Abhak-, Betragsliste), **Schülerliste importieren** (Excel/CSV).
- **Sicherung** als Notendatei, **alles als Excel**, Klasse aus einer anderen Notendatei übernehmen.
- **Sperre** nach Untätigkeit und **verschlüsselte Arbeitskopie** im Browser (bei gesetztem Passwort).
- **Optional: OneDrive-Synchronisation** (nur verschlüsselte Dateien).

Die Rechenregeln stehen in `docs/SPEC.md` (Abschnitt 4 und 8). Kurz: Prozent wird abgeschnitten, nicht gerundet; Notengrenzen 91,5 / 80,5 / 66,5 / 49,5 / 29,5; Durchschnitte sind gewichtet. Angezeigt wird gerundet, gerechnet wird ohne Rundung.

## Öffnen

**Online über GitHub Pages:** Im Repository unter *Settings → Pages* bei „Build and deployment“ die Quelle „Deploy from a branch“ wählen, Branch `main`, Ordner `/ (root)`, speichern. Nach kurzer Zeit zeigt GitHub die Adresse an. Beim ersten Öffnen lädt der Browser alle Dateien. Danach läuft die App auch ohne Internet, und sie kann über das Browsermenü „installiert“ werden.

**Lokal ohne Internet:** Die App braucht einen kleinen Webserver, weil Browser Module von `file://` nicht laden. Im Ordner: `python3 -m http.server 8000` und dann `http://localhost:8000` öffnen.

## Notendateien sicher ablegen

- Die Daten liegen in einer Notendatei `<Klasse>_<Schuljahr>.noten` (bei mehreren Klassen `Notenbuch_<Schuljahr>.noten`). Legen Sie sie nur an einem geschützten Ort ab (verschlüsselter Ordner oder Schul-Cloud).
- **Passwortschutz:** Unter „Notenbuch“ ein Passwort setzen. Die Datei wird mit AES-GCM verschlüsselt (Schlüssel per PBKDF2, 310 000 Runden, SHA-256). **Ein vergessenes Passwort kann nicht wiederhergestellt werden.**
- **Speichern:** In Chrome und Edge am PC überschreibt „Speichern“ die geöffnete Datei direkt. In Safari (iPad) und Firefox lädt „Speichern“ die Datei herunter, und „Notendatei öffnen“ lädt sie wieder hoch.
- **Arbeitskopie im Browser:** Die App legt zur Sicherheit eine Kopie im Browser ab (IndexedDB). **Mit Passwort ist sie mit demselben Passwort verschlüsselt, ohne Passwort ist sie ungeschützt** (die App weist darauf hin). Enthält das Notenbuch Fotos, wird ohne Passwort gar keine Arbeitskopie gespeichert. Auf fremden oder gemeinsam genutzten Geräten schalten Sie auf der Startseite „Keine Daten auf diesem Gerät behalten“ ein. „Alle lokalen Daten auf diesem Gerät löschen“ entfernt alles.
- **Sperre:** Nach einer einstellbaren Zeit ohne Bedienung (Standard 15 Minuten) verlangt die App das Passwort erneut. Ohne Passwort gibt es nichts zu entsperren.
- **Gesundheitsangaben:** Abwesenheitsgründe wie „krank“ stehen nur in der Personen- und Fehlzeitenansicht und in der vollständigen Excel-Sicherung („Alles als Excel“), nie im Excel/CSV der Gesamtübersicht und nie im Druck.
- Niemals echte Schülerdaten ins Repository legen. `.gitignore` blockiert `*.xlsx`, `*.xls`, `*.noten`, `*.noten.json` und Untis-Berichte (`Absence*`).

## WebUntis: Fehlzeiten und Nachschreiben

Zwei Berichte lassen sich importieren (Format wird an der Kopfzeile erkannt, sonst fragt die App nach der Spaltenzuordnung):

- **`AbsenceList_*.xls`** (je Abwesenheitszeitraum) ist der Hauptweg. Nur hier steht „entschuldigt mit Attest“, und das Attest entscheidet über das Nachschreiben. Der Bericht enthält alle Zeiträume der Klasse (kein Fachfilter in Untis).
- **`AbsencePerStudent_*.xls`** (je Fehlstunde) ist optional und liefert die Fehlstunden je Fach. Beide Dateien lassen sich gemeinsam importieren; eine Fehlstunde mit Status „entsch.“ wird zu „mit Attest“, wenn der Zeitraumbericht für dieselbe Person und denselben Tag ein Attest nennt.

Tipp: In Untis am besten immer das **ganze Schuljahr bis heute** exportieren. Der neue Stand ersetzt die Untis-Einträge im Zeitraum der Datei, manuell erfasste Einträge bleiben. Ein zweiter Import derselben Datei ändert nichts.

Nach dem Import schlägt die App für jede Klassenarbeit die **Teilnahme** vor (z. B. „gefehlt mit Attest, Nachschreiben offen“). Die Vorschläge werden **nie still übernommen**, sondern in einer Liste bestätigt. Hat die Klassenarbeit eine Uhrzeit, muss sie sich mit der Abwesenheit zeitlich überschneiden. Wie „gefehlt ohne Attest“ benotet wird, legt die App nicht fest (Schulregel).

So kommt die Untis-Datei in die App:
1. **PC (Chrome/Edge):** Unter „Einstellungen“ einmalig den Ordner wählen, in dem der Browser die Untis-Dateien speichert. Die App prüft ihn beim Öffnen und danach jede Minute, solange sie sichtbar ist, und fragt „Neue Untis-Liste gefunden – jetzt abgleichen?“. Optional gleicht sie automatisch ab. Untis-Dateien nicht dauerhaft im Downloads-Ordner liegen lassen; die Einstellung „Datei nach dem Import löschen“ hilft dabei.
2. **OneDrive-Eingang:** Ist die OneDrive-Anbindung eingerichtet, prüft die App den Ordner `Untis-Eingang` im App-Ordner und verschiebt verarbeitete Dateien nach `verarbeitet`.
3. **Android:** Als installierte App erscheint „Notenverwaltung“ im Teilen-Menü (Untis-Datei teilen, dann startet der Abgleich).
4. **iPad und sonst:** Knopf „Untis-Liste laden“ (in Klassenarbeiten, Fehlzeiten und Nachschreiben) oder Datei in die App ziehen.

Eine direkte Schnittstelle zu WebUntis gibt es bewusst nicht.

## OneDrive-Synchronisation einrichten (optional, für die Schul-IT)

Ohne diese Einrichtung sendet die App nichts ins Netz. Die Synchronisation lädt **nur verschlüsselte** Notendateien (Passwort nötig) in den eigenen App-Ordner des dienstlichen OneDrive hoch. Die App bekommt nur die kleinste Berechtigung `Files.ReadWrite.AppFolder` und sieht keine anderen Dateien.

Was die Schul-IT in Microsoft Entra ID einrichtet (Bezeichnungen im Portal können abweichen):
1. App-Registrierung anlegen, Name z. B. „Notenverwaltung“, nur Konten im eigenen Verzeichnis. Der OneDrive-Ordner heißt später `Apps/<Name der Registrierung>`.
2. Plattform **Single-Page-Anwendung** hinzufügen. Als Weiterleitungs-URI die Adresse der App eintragen, genau so, wie sie in den Einstellungen unter „Redirect-URI“ angezeigt wird.
3. Unter API-Berechtigungen Microsoft Graph, **delegiert**, `Files.ReadWrite.AppFolder` hinzufügen und bei Bedarf die Administratorzustimmung erteilen.
4. **Anwendungs-(Client-)ID** und **Verzeichnis-(Mandanten-)ID** kopieren und in der App unter „Einstellungen“ eintragen.

Ablauf: Anmelden, Notenbuch öffnen, „Synchronisation einschalten“. Speichern lädt hoch (Autosave abschaltbar). Hat sich die Datei inzwischen auf einem anderen Gerät geändert, überschreibt die App nichts, sondern fragt: „Andere Fassung laden“ oder „Meine Fassung als Kopie speichern“. Offline arbeiten ist möglich, beim nächsten Online-Sein wird mit Konfliktprüfung hochgeladen. Die Anmeldebibliothek MSAL.js liegt in `lib/` und wird nur geladen, wenn Sie sich anmelden.

## Entwicklung und Tests

Keine Installation nötig, nur Node.js ab Version 20:

```bash
npm test
```

Die Tests prüfen alle Rechenregeln (Prüffälle aus `docs/SPEC.md`, Grenzwerte, Abschneiden statt Runden, Dalton, Zwischenstand), Verschlüsselung der Notendatei und der Arbeitskopie, Umwandlung alter Dateien, Sicherung, Excel-Import und -Export, den Untis-Import (Format A, B, kombiniert, Zuordnung, Doppelimport), die Import-Automatik mit einer Ordner-Attrappe, Nachschreib-Vorschläge, eigene Listen, Schülerlisten-Import, Archiv sowie die Synchronisation gegen eine Attrappe und eine nachgebaute Graph-Schnittstelle.

Bibliotheken liegen im Repository und werden nicht von einem CDN geladen: SheetJS 0.18.5 (`lib/xlsx.full.min.js`, Apache-2.0, Lizenz in `lib/xlsx.LICENSE`) und MSAL Browser 2.38.3 (`lib/msal-browser.min.js`, MIT, Lizenz in `lib/msal.LICENSE`).

`js/ihk-schema.js` enthält dieselben Werte wie `docs/ihk-schema.json`; ein Test stellt sicher, dass beide übereinstimmen.
