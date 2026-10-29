# Notenverwaltung: Bauanleitung

Ziel ist eine Web-App, die die Excel-Vorlage „Notenliste_Teilzeit_V4.xlsx“ vollständig ersetzt. Sie läuft im Browser auf PC (Windows), Diensttablett und optional Handy, funktioniert offline und speichert keine Daten auf einem fremden Server.

Alle Rechenregeln unten sind aus den Excel-Formeln übernommen. Die Ergebnisse der App müssen exakt mit Excel übereinstimmen.

## 1. Technik

- Rein statische Seite ohne eigenen Server, `index.html` im Wurzelverzeichnis, damit GitHub Pages („Deploy from branch: main, / root“) ohne Build-Schritt funktioniert.
- Kein Build-Werkzeug nötig. Vanilla JavaScript mit ES-Modulen ist bevorzugt. Fremdbibliotheken (z. B. SheetJS für Excel) werden als Datei ins Repository gelegt, nicht zur Laufzeit von einem CDN geladen, damit die App offline funktioniert.
- Progressive Web App: `manifest.webmanifest` und Service Worker, damit sie auf Tablet und PC „installiert“ werden kann und offline startet.
- Oberfläche komplett auf Deutsch, gut bedienbar mit Touch (große Eingabefelder, Ziffernblock bei Zahleneingaben) und mit Tastatur (Tab/Enter springt zur nächsten Zelle wie in Excel).
- Hell- und Dunkelmodus, druckfreundliche Ansichten (`@media print`).

## 2. Datenschutz und Speicherung (verbindlich)

- Niemals echte Schülerdaten ins Repository. Testdaten nur mit erfundenen Namen. `.gitignore` blockiert `*.xlsx`, `*.noten`, `*.noten.json`.
- Die Daten einer Klasse liegen in einer **Notendatei** (`<Klasse>_<Schuljahr>.noten`, JSON). Die Nutzerin legt sie an einem geschützten Ort ab (z. B. verschlüsselter Ordner oder Schul-Cloud).
- Optionaler **Passwortschutz** der Notendatei: AES-GCM über WebCrypto, Schlüssel per PBKDF2 (mind. 310 000 Iterationen, SHA-256, zufälliges Salt). Ohne Passwort ist die Datei nicht lesbar. Kein Passwort-Wiederherstellen möglich, deutlicher Hinweis in der App.
- Öffnen/Speichern: Wo der Browser es kann (Chrome/Edge am PC), über die File System Access API direkt in die Datei speichern („Speichern“ überschreibt die geöffnete Datei). Sonst (iPad/Safari, Firefox) über „Datei öffnen“ (Upload) und „Herunterladen“.
- Arbeitskopie im Browser (IndexedDB) für Autosave ist **abschaltbar** und standardmäßig an. Schalter „Keine Daten auf diesem Gerät behalten“ löscht beim Schließen der Datei die lokale Kopie. Button „Alle lokalen Daten auf diesem Gerät löschen“.
- Hinweis „Ungespeicherte Änderungen“, wenn die Notendatei älter ist als die Arbeitskopie.
- Keine Analyse-, Tracking- oder Schriftarten-Dienste von Dritten. Keine Netzwerkanfragen außer dem Laden der App selbst.

## 3. Datenmodell (eine Notendatei = eine Klasse in einem Lernfeld)

- Kopfdaten: Klasse, Lernfeld-Nummer, Lernfeld-Bezeichnung, Schuljahr.
- Gewichtung: schriftlich in Prozent (Standard 50 %), sonstige Leistung = 100 % minus schriftlich. Eingabe 0 bis 100.
- Schüler:innen (Standard bis 32, erweiterbar): Name, Vorname, m/w/d, Geburtstag (optional). Laufende Nummer automatisch. „Volljährig?“ wird aus dem Geburtstag zum heutigen Datum berechnet (ja/nein). Ist kein Geburtstag eingetragen, kann „volljährig“ manuell angehakt werden.
- Klassenarbeiten (Standard 4, erweiterbar): Nummer, Datum, „Thematische Schwerpunkte“ (Freitext), bis zu 21 Aufgaben (erweiterbar) mit Höchstpunktzahl je Aufgabe (Dezimalzahl ≥ 0). Je Schüler:in: Punkte je Aufgabe, Feld „Attest“ (Haken), Feld „Sonstiges“ (Freitext für das Protokoll).
- Sonstige Leistungen (Standard 12 Termine, erweiterbar): Datum je Termin, je Schüler:in eine Dezimalnote mit einer Nachkommastelle von 1,0 bis 6,0.

## 4. Rechenregeln (exakt wie in Excel)

**Notengrenzen** (gelten überall, Prozent p):
p ≥ 91,5 → 1 (sehr gut); p ≥ 80,5 → 2 (gut); p ≥ 66,5 → 3 (befriedigend); p ≥ 49,5 → 4 (ausreichend); p ≥ 29,5 → 5 (mangelhaft); sonst 6 (ungenügend).

**Klassenarbeit**
- Gesamtpunktzahl = Summe der Höchstpunkte aller Aufgaben.
- Eingabe je Aufgabe nur von 0 bis Höchstpunktzahl dieser Aufgabe, sonst Fehlermarkierung.
- Summe Schüler:in = Summe der eingegebenen Punkte; leer, wenn keine Punkte eingetragen sind.
- Prozent = auf 1 Nachkommastelle **abgeschnitten** (nicht gerundet): `trunc(summe * 100 / gesamtpunkte, 1)`.
- Note aus Prozent nach den Notengrenzen.
- Notenspiegel je Arbeit: Anzahl Noten 1 bis 6 und Durchschnitt = Summe(Note × Anzahl) / Anzahl.
- Schüler:innen mit Attest bekommen keine Punkte, keine Note und zählen nicht im Notenspiegel.

**Sonstige Leistung**
- Note wird auf 1 Nachkommastelle gerundet und über das IHK-Schema in Prozent umgerechnet: Prozent = Mittelwert aller Prozentwerte, denen in `docs/ihk-schema.json` diese Note zugeordnet ist (Excel: `AVERAGEIF`). Beispiele: 1,0 → 100; 2,0 → 85,5; 3,3 → 68,5; 6,0 → 2,5.
- Dieser Prozentwert wird in der Gesamtübersicht auf 2 Nachkommastellen abgeschnitten.

**Gesamtnote je Schüler:in**
- Ø KA = Mittelwert der vorhandenen KA-Prozentwerte (alle Arbeiten Gewicht 1, leere zählen nicht).
- Ø sL = Mittelwert der vorhandenen sL-Prozentwerte (Gewicht 1, leere zählen nicht).
- Gesamtprozent = Ø KA × Gewicht schriftlich + Ø sL × Gewicht sonstige. Nur berechnen, wenn beide Werte vorhanden sind, sonst leer.
- Gesamtnote aus Gesamtprozent nach den Notengrenzen. Zwischenwerte nicht runden.

**Prüffall (muss als automatischer Test existieren):**
Gewichtung 50/50. KA 1: 33 von 45 Punkten → 73,3 % → Note 3. KA 2: 46 von 50 → 92,0 % → Note 1. sL-Noten 2,0 und 3,3 → 85,5 % und 68,5 %. Ø KA = 82,65; Ø sL = 77,0; Gesamt = 79,825 % → Note 3.
Weitere Tests: Grenzwerte 91,5 / 91,4 / 80,5 / 80,4 / 29,5 / 29,4. Abschneiden statt Runden: 70 von 87 Punkten = 80,4597… → 80,4 % → Note 3 (gerundet wären es 80,5 % und Note 2, das wäre falsch).
Beim Abschneiden Gleitkommafehler abfangen (z. B. 0,3 × 100 darf nicht zu 29,9 werden), etwa durch Rechnen in ganzen Zehnteln oder ein kleines Epsilon.

## 5. Ansichten

1. **Start:** Notendatei öffnen, neue anlegen, zuletzt geöffnete (nur aus lokaler Arbeitskopie), Excel-Vorlage importieren.
2. **Grunddaten:** Kopfdaten, Gewichtung, Schülerliste (Zeilen hinzufügen, löschen mit Rückfrage, Reihenfolge ändern, alphabetisch sortieren).
3. **Klassenarbeit 1 bis n:** Tabelle wie in Excel (Nr., Name, Aufg. 1…n, ∑, %, Note, Attest). Kopfzeile mit Höchstpunkten. Notenspiegel daneben bzw. darunter. Auf schmalen Bildschirmen: Ansicht „Schüler:in für Schüler:in“ mit Vor/Zurück, damit man am Tablet bequem korrigiert.
4. **Sonstige Leistung:** Tabelle Termine × Schüler:innen, Note eingeben, Prozent daneben.
5. **Gesamtübersicht:** Nr., Name, Vorname, Gesamtprozent, Gesamtnote, KA-Prozente einzeln, Ø KA, sL-Prozente einzeln, Ø sL. Kopf mit Klasse, Lernfeld, Schuljahr, Gewichtung.
6. **Drucken/PDF:**
   - **Protokoll je Klassenarbeit und Schüler:in** (eine Seite pro Person, Sammeldruck aller): Name (Vorname Name), Klasse, Datum der Arbeit; Zeile „Lernfeld <Nr>: <Bezeichnung>“; „Thematische Schwerpunkte der Klassenarbeit Nr. <n>:“ mit dem Freitext; „Sonstiges“ mit dem Freitext der Person; „erreichte Punktzahl: <summe>/<gesamt>“, „Prozentzahl: <p> %“, „Note: <Note in Worten>“; Unterschriftslinien „Korrekturdatum und Unterschrift der Lehrkraft“ und „Unterschrift Ausbilderin/Ausbilder (bei nicht mehr ausreichender Leistung!)“.
   - **Korrekturliste blanko:** Klasse, Lernfeld, Feld Klassenarbeit-Nr., Spalten Nr., Name (Form „Name, V.“), 16 leere Aufgabenspalten, ∑, %, Note, Attest.
   - Gesamtübersicht und Notenspiegel.

## 6. Import und Export

- **Import aus der Excel-Vorlage V4** (Struktur siehe unten), damit vorhandene Listen übernommen werden können. Vorher Vorschau, was übernommen wird.
- **Export** der Gesamtübersicht als `.xlsx` und `.csv` (Semikolon, deutsche Dezimalkommas).
- Struktur der Vorlage: Blatt „Grunddaten“: D5 Klasse, G5 Lernfeld-Nr., G6 Lernfeld-Bezeichnung, M5 Schuljahr, L12 Gewichtung schriftlich (0–1), C12:C43 Name, D12:D43 Vorname, E12:E43 m/w, F12:F43 Geburtstag. Blätter „KA 1“ bis „KA 4“: D4:X4 Höchstpunkte Aufgabe 1–21, D5:X36 Punkte (Zeile 5 = 1. Person), AA1 Datum, AB5:AB36 Attest. Blatt „sonst. Leistung“: Datum in D3, F3, H3 … Z3, Noten in D5:D36, F5:F36 … Z5:Z36.

## 7. Qualität

- Automatische Tests für alle Rechenregeln (z. B. mit `node --test`), laufen ohne Installation weiterer Pakete.
- README auf Deutsch: Was die App kann, wie man sie öffnet, wie man Notendateien sicher ablegt, wie man GitHub Pages einschaltet.
- Vor der Fertigmeldung im Browser testen: neue Klasse anlegen, 3 erfundene Schüler:innen, eine Klassenarbeit, zwei sonstige Leistungen, Gesamtnote prüfen, speichern, neu laden, öffnen, Protokoll drucken (Vorschau).
