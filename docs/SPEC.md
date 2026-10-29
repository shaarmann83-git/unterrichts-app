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
- Sonstige Leistungen: **beliebig viele Einträge**, damit nach jeder Unterrichtsstunde kurz etwas notiert werden kann. Ein Eintrag (Termin) hat Datum und optional ein Stichwort (z. B. „Gruppenarbeit Inventur“). Je Schüler:in und Termin: optional eine Dezimalnote mit einer Nachkommastelle von 1,0 bis 6,0 und optional eine kurze Textnotiz. Einträge nur mit Notiz und ohne Note sind erlaubt.

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
- **Einzelgewichte:** Jede Klassenarbeit und jeder sL-Termin hat ein eigenes Gewicht (Standard 1, frei eintragbar, Dezimalzahl ≥ 0), wie die Gewichtszeile im Excel-Blatt „Notenliste gesamt“ (G6:J6 und M6:X6).
- Ø KA = gewichteter Mittelwert der vorhandenen KA-Prozentwerte: Summe(Prozent × Gewicht) / Summe(Gewichte nur der Arbeiten, in denen diese Person einen Wert hat). Leere Arbeiten (oder Attest) zählen weder im Zähler noch im Nenner. Excel: `SUMPRODUCT(G7:J7;G6:J6)/SUMIF(G7:J7;">=0";G6:J6)`.
- Ø sL = gewichteter Mittelwert der vorhandenen sL-Prozentwerte über alle Termine nach derselben Regel. Termine ohne Note und reine Notizen zählen nicht.
- Ist die Summe der Gewichte einer Person 0 (z. B. alle vorhandenen Werte mit Gewicht 0), bleibt der Durchschnitt leer statt eines Fehlers.
- Gesamtprozent = Ø KA × Gewicht schriftlich + Ø sL × Gewicht sonstige. Nur berechnen, wenn beide Werte vorhanden sind, sonst leer.
- Gesamtnote aus Gesamtprozent nach den Notengrenzen. Zwischenwerte nicht runden.

**Prüffall (muss als automatischer Test existieren):**
Gewichtung 50/50. KA 1: 33 von 45 Punkten → 73,3 % → Note 3. KA 2: 46 von 50 → 92,0 % → Note 1. sL-Noten 2,0 und 3,3 → 85,5 % und 68,5 %. Ø KA = 82,65; Ø sL = 77,0; Gesamt = 79,825 % → Note 3.
Gleicher Fall mit Gewichten KA 1 = 1, KA 2 = 2, sL-Termin 1 = 1, sL-Termin 2 = 0,5: Ø KA = 85,7667; Ø sL = 79,8333; Gesamt = 82,8 % → Note 2.
Fehlende Werte: Hat eine Person nur KA 1 (73,3 %) bei Gewichten 1 und 2, ist Ø KA = 73,3 (Nenner nur 1).
Weitere Tests: Grenzwerte 91,5 / 91,4 / 80,5 / 80,4 / 29,5 / 29,4. Abschneiden statt Runden: 70 von 87 Punkten = 80,4597… → 80,4 % → Note 3 (gerundet wären es 80,5 % und Note 2, das wäre falsch).
Beim Abschneiden Gleitkommafehler abfangen (z. B. 0,3 × 100 darf nicht zu 29,9 werden), etwa durch Rechnen in ganzen Zehnteln oder ein kleines Epsilon.

## 5. Ansichten

1. **Start:** Notendatei öffnen, neue anlegen, zuletzt geöffnete (nur aus lokaler Arbeitskopie), Excel-Vorlage importieren.
2. **Grunddaten:** Kopfdaten, Gewichtung, Schülerliste (Zeilen hinzufügen, löschen mit Rückfrage, Reihenfolge ändern, alphabetisch sortieren).
3. **Klassenarbeit 1 bis n:** Tabelle wie in Excel (Nr., Name, Aufg. 1…n, ∑, %, Note, Attest). Kopfzeile mit Höchstpunkten. Notenspiegel daneben bzw. darunter. Auf schmalen Bildschirmen: Ansicht „Schüler:in für Schüler:in“ mit Vor/Zurück, damit man am Tablet bequem korrigiert.
4. **Sonstige Leistung:**
   - **Schnelleingabe „Heutige Stunde“** (wichtigste Ansicht, für das Tablet direkt nach dem Unterricht): ein Knopf legt einen Termin mit heutigem Datum an; darunter die Klassenliste mit je einem Notenfeld und einem Notizfeld. Optional Tasten für häufige Noten (z. B. 1,0 / 2,0 / 3,0 / 4,0 / 5,0) und Wiederverwenden der zuletzt benutzten Stichworte. Leere Felder sind normal und werden nicht als Fehler markiert.
   - **Übersicht nach Termin:** Tabelle Termine × Schüler:innen mit Note und Prozent; Notizen als Symbol, Antippen zeigt den Text. Termine bearbeiten und löschen (mit Rückfrage).
   - **Übersicht nach Person:** alle Termine einer Schülerin/eines Schülers untereinander mit Datum, Stichwort, Note, Prozent, Notiz, dazu Ø sL. Hilfreich für Elterngespräche und Zeugniskonferenzen.
5. **Gesamtübersicht:** Nr., Name, Vorname, Gesamtprozent, Gesamtnote, KA-Prozente einzeln, Ø KA, Anzahl sL-Noten, Ø sL. Kopf mit Klasse, Lernfeld, Schuljahr, Gewichtung schriftlich/sonstige und einer Zeile mit den Einzelgewichten der Klassenarbeiten, die direkt dort änderbar sind. Die sL-Gewichte werden je Termin gepflegt (in der Schnelleingabe als Feld „Gewicht“, Standard 1). Antippen einer Person öffnet ihre Übersicht.
6. **Drucken/PDF:**
   - **Protokoll je Klassenarbeit und Schüler:in** (eine Seite pro Person, Sammeldruck aller): Name (Vorname Name), Klasse, Datum der Arbeit; Zeile „Lernfeld <Nr>: <Bezeichnung>“; „Thematische Schwerpunkte der Klassenarbeit Nr. <n>:“ mit dem Freitext; „Sonstiges“ mit dem Freitext der Person; „erreichte Punktzahl: <summe>/<gesamt>“, „Prozentzahl: <p> %“, „Note: <Note in Worten>“; Unterschriftslinien „Korrekturdatum und Unterschrift der Lehrkraft“ und „Unterschrift Ausbilderin/Ausbilder (bei nicht mehr ausreichender Leistung!)“.
   - **Korrekturliste blanko:** Klasse, Lernfeld, Feld Klassenarbeit-Nr., Spalten Nr., Name (Form „Name, V.“), 16 leere Aufgabenspalten, ∑, %, Note, Attest.
   - Gesamtübersicht und Notenspiegel.

## 6. Import und Export

- **Import aus der Excel-Vorlage V4** (Struktur siehe unten), damit vorhandene Listen übernommen werden können. Vorher Vorschau, was übernommen wird.
- Beim Import werden die 12 Spalten „sonst. Leistung“ der Vorlage zu 12 Terminen; leere Spalten werden übersprungen.
- **Export** der Gesamtübersicht als `.xlsx` und `.csv` (Semikolon, deutsche Dezimalkommas). Die `.xlsx` enthält zusätzlich ein Blatt mit allen sL-Einträgen (Datum, Stichwort, Name, Note, Prozent, Notiz).
- Struktur der Vorlage: Blatt „Grunddaten“: D5 Klasse, G5 Lernfeld-Nr., G6 Lernfeld-Bezeichnung, M5 Schuljahr, L12 Gewichtung schriftlich (0–1), C12:C43 Name, D12:D43 Vorname, E12:E43 m/w, F12:F43 Geburtstag. Blätter „KA 1“ bis „KA 4“: D4:X4 Höchstpunkte Aufgabe 1–21, D5:X36 Punkte (Zeile 5 = 1. Person), AA1 Datum, AB5:AB36 Attest. Blatt „sonst. Leistung“: Datum in D3, F3, H3 … Z3, Noten in D5:D36, F5:F36 … Z5:Z36. Blatt „Notenliste gesamt“: Gewichte KA 1–4 in G6:J6, Gewichte sL-Spalten 1–12 in M6:X6 (Standard 1).

## 7. Qualität

- Automatische Tests für alle Rechenregeln (z. B. mit `node --test`), laufen ohne Installation weiterer Pakete.
- README auf Deutsch: Was die App kann, wie man sie öffnet, wie man Notendateien sicher ablegt, wie man GitHub Pages einschaltet.
- Vor der Fertigmeldung im Browser testen: neue Klasse anlegen, 3 erfundene Schüler:innen, eine Klassenarbeit, zwei sonstige Leistungen, Gesamtnote prüfen, speichern, neu laden, öffnen, Protokoll drucken (Vorschau).

## 8. Erweiterung Stufe 2 (Nachtrag)

Alles aus Abschnitt 1 bis 7 bleibt gültig, sofern hier nichts anderes steht. Bestehende Rechenregeln nicht ändern. Neue Rechenregeln nur wie hier beschrieben.

### 8.1 Mehrere Klassen in einer Notendatei
- Eine Notendatei enthält jetzt ein **Notenbuch** mit beliebig vielen Klassen (z. B. ein Schuljahr). Jede Klasse hat alles aus Abschnitt 3 (Kopfdaten, Gewichtung, Schüler:innen, Klassenarbeiten, sonstige Leistungen) plus die Erweiterungen unten.
- Startseite nach dem Öffnen: Kacheln je Klasse (Klasse, Lernfeld, Schuljahr, Anzahl Schüler:innen). Klasse anlegen, umbenennen, löschen (mit Rückfrage), **kopieren** (übernimmt Kopfdaten, Einstellungen und Schülerliste, aber keine Noten, Fehlzeiten oder Dalton-Einträge).
- Alte Notendateien mit nur einer Klasse (Format aus Stufe 1) werden beim Öffnen automatisch in ein Notenbuch mit einer Klasse umgewandelt. Dateiversion im JSON mitführen.
- Excel-Import der Vorlage V4 legt eine neue Klasse im geöffneten Notenbuch an.

### 8.2 Schaltbare Bereiche je Klasse
In den Grunddaten jeder Klasse drei Schalter. Ist ein Bereich aus, sind seine Felder und Ansichten in dieser Klasse unsichtbar.
- **Dalton** (aus / nur dokumentieren / fließt in die sonstige Leistung ein mit __ %, Standard 10 %)
- **Duales System** (Ausbildungsbetrieb je Person)
- **Fotos**

### 8.3 Dalton
- Beliebig viele **Dalton-Aufgaben** je Klasse: Titel, Ausgabedatum, Abgabedatum, Gewicht (Standard 1).
- Je Person und Dalton-Aufgabe:
  - **Status:** abgegeben / nicht abgegeben / entschuldigt (zählt nicht) / Täuschung (abgeschrieben)
  - **Qualität** (nur bei „abgegeben“): gut / mittel / schlecht
  - **Selbstständig erarbeitet:** ja / nein (nur Dokumentation, keine Auswirkung auf die Note)
  - **Note überschreiben** (optional, Dezimalnote 1,0 bis 6,0): wenn gesetzt, gilt diese statt der Zuordnung unten
  - **Notiz** (Freitext, z. B. Begründung)
- **Zuordnung Bewertung → Note**, je Klasse einstellbar, Standard: gut = 2,0; mittel = 3,0; schlecht = 4,0; nicht abgegeben = 6,0; Täuschung = 6,0; entschuldigt = kein Wert. Fehlt der Status, zählt der Eintrag nicht.
- Die Dalton-Note wird wie eine sL-Note über das IHK-Schema in Prozent umgerechnet und auf 2 Stellen abgeschnitten.
- **Ø Dalton** = gewichteter Mittelwert der Dalton-Prozente (Regeln wie Ø sL in Abschnitt 4).
- **Einrechnung in die sonstige Leistung** (nur wenn Schalter „fließt ein“): Ø sL neu = Ø sL(normal) × (1 − d) + Ø Dalton × d, mit d = Dalton-Anteil (z. B. 0,10). Fehlt Ø Dalton, gilt Ø sL(normal) zu 100 %. Fehlt Ø sL(normal), gilt Ø Dalton zu 100 %. Die Gesamtnote nutzt Ø sL neu.
- **Prüffall:** sL-Noten 2,0 und 3,3 (Ø sL normal 77,0); Dalton „gut“ und „schlecht“ (85,5 % und 57,5 %, Ø Dalton 71,5); d = 10 % → Ø sL = 76,45. Mit Ø KA 82,65 und Gewichtung 50/50: Gesamt 79,55 % → Note 3.
- **Ansichten:** Schnelleingabe je Dalton-Aufgabe (Klassenliste, Status und Qualität mit je einem Tipp, wie „Heutige Stunde“); Übersicht Aufgaben × Personen mit Symbolen; Dalton-Block in der Personenübersicht.
- **Druck „Bewertungskriterien Dalton“:** einseitiges Blatt mit Klasse, Anteil an der sonstigen Leistung und der eingestellten Zuordnung (Stufen mit kurzer Beschreibung, die in den Einstellungen editierbar ist; Standardtexte: gut = „vollständig, fachlich überwiegend richtig“, mittel = „vollständig, mehrere fachliche Fehler“, schlecht = „lückenhaft oder überwiegend fehlerhaft“). Zum Aushändigen an die Klasse.

### 8.4 Fotos
- Nur wenn der Schalter Fotos an ist. Je Person: Foto aufnehmen (Kamera am Tablet/Handy) oder Datei wählen, Bildausschnitt quadratisch, verkleinert auf höchstens 256 × 256 Pixel, JPEG, Ziel unter 30 KB. Gespeichert in der Notendatei (also mitverschlüsselt).
- Häkchen „Einwilligung liegt vor“ mit Datum. Ohne Häkchen kein Foto speicherbar. Knopf „Foto löschen“; beim Entfernen des Häkchens wird das Foto nach Rückfrage gelöscht.
- Fotos erscheinen als kleines Rundbild in Listen und groß in der Personenübersicht. Nie im Export, nie im Druck.

### 8.5 Ausbildungsbetrieb (duales System)
- Je Person: Betrieb, Ansprechperson, Telefon, E-Mail, Notiz. Anzeige in der Personenübersicht, Spalten im Excel-Export.

### 8.6 Fehlzeiten mit Import aus WebUntis
- Je Person ein optionales Feld **Untis-ID** (die „Externe Id“/„ID“ aus WebUntis, Text). Wird beim Import automatisch gesetzt und danach zur sicheren Zuordnung genutzt.
- Je Klasse eine Fehlzeitenliste. Ein Eintrag: Person, Datum, Stundennummer (optional), Fehlstunden, Fehlminuten, Fach (Text), Status (**entschuldigt / entschuldigt mit Attest / nicht entschuldigt / offen**), Abwesenheitsgrund (Text), Quelle (Untis / manuell), Notiz.
- **Manuelle Eingabe** in „Heutige Stunde“ (je Person Fehlstunden und Status) und in einer Fehlzeiten-Ansicht.

**Untis-Format A: „AbsencePerStudent_*.xls“** (eine Zeile je Fehlstunde, Blatt `Sheet0`, Kopfzeile in Zeile 1, danach viele leere Zeilen, die zu überspringen sind). Spalten:
`Schüler*innen` (Nachname und Vorname in einer Zelle, durch Leerzeichen getrennt), `Externe Id`, `Text`, `Klasse`, `Datum` (echtes Datum), `Wochentag`, `Fehlstd.` (Zahl), `Fehlmin.` (Zahl), `Lehrkraft`, `Fach` (z. B. „AK3-LF10“), `Abwesenheitsgrund` (z. B. „krank“ oder leer), `Text`, `ENr`, `Erledigt` (Datum oder leer), `Abwesenheit zählt` („true“/„false“), `Entschuldigungstext`, `Stundennr.` (Zahl), `Status` („entsch.“, „nicht entsch.“, „offen“), `Fehltage` (Zahl).
- Achtung: Die Spaltenüberschrift `Text` kommt zweimal vor. Spalten über ihre Position bzw. Reihenfolge auswerten, nicht nur über den Namen.
- Format A unterscheidet **nicht** zwischen „entschuldigt“ und „entschuldigt mit Attest“.
- Zeilen mit `Abwesenheit zählt` = „false“ werden übernommen, aber als „zählt nicht“ markiert und nicht summiert.

**Untis-Format B: „AbsenceList_*.xls“** (eine Zeile je Abwesenheitszeitraum, Blatt `Sheet0`). Spalten:
`Langname` (Nachname), `Vorname`, `ID`, `Klasse`, `Beginndatum` und `Enddatum` (Text „TT.MM.JJJJ“), `Beginnzeit` und `Endzeit` (Text „HH:MM“), `Unterbrechungen`, `Abwesenheitsgrund`, `Text/Grund`, `Entschuldigungsnummer` (Zahl), `Status` („entschuldigt“, „entschuldigt mit Attest“, „nicht entschuldigt“, ggf. „offen“), `Entschuldigungstext`, `gemeldet von Schüler*in` („true“/„false“).
- Format B enthält den Attest-Status, aber keine Fehlstunden je Fach.

**Import-Ablauf**
- Die App erkennt das Format an der Kopfzeile. Kann sie es nicht erkennen, öffnet sich der Zuordnungsdialog (Spalten selbst zuordnen), damit auch spätere geänderte Untis-Berichte nutzbar bleiben.
- Beide Dateien können **gemeinsam** importiert werden (Mehrfachauswahl oder nacheinander). Empfohlener Weg: Format A liefert die Fehlstunden, Format B ergänzt den Attest. Regel: Eine Fehlstunde aus A mit Status „entsch.“ wird zu „entschuldigt mit Attest“, wenn es in B einen Eintrag derselben Person (gleiche ID) mit Status „entschuldigt mit Attest“ gibt, dessen Zeitraum Beginndatum bis Enddatum das Datum der Fehlstunde einschließt.
- Wird nur Format B importiert: je Abwesenheitszeitraum ein Eintrag mit Datum von/bis und Status, ohne Stundenzahl (Anzeige als Zeitraum). Wird später A importiert, ersetzt A diese Einträge für dieselben Tage.
- **Fachfilter:** Enthält die Datei mehrere Fächer, wählt die Nutzerin im Vorschaudialog, welche Fächer für diese Klasse übernommen werden (Auswahl wird je Klasse gespeichert). Ebenso Filter auf die Spalte `Klasse`.
- **Zuordnung der Personen:** zuerst über die Untis-ID; sonst über den Namen (Format A: Zelle „Nachname Vorname“ mit „Name Vorname“ der Person vergleichen, Groß-/Kleinschreibung und doppelte Leerzeichen egal; Format B: Langname und Vorname). Bei Erfolg die Untis-ID an der Person speichern. Nicht zuordenbare oder mehrdeutige Zeilen werden in der Vorschau rot angezeigt; die Nutzerin kann sie per Auswahlliste einer Person zuordnen oder überspringen.
- Wiederholter Import desselben Zeitraums erzeugt keine Doppelungen: Untis-Einträge im importierten Datumsbereich werden ersetzt, manuelle Einträge bleiben.

**Vorrang von Format B und Nachschreiben (wichtigster Anwendungsfall)**
- Die Nutzerin wird in der Regel **nur Format B** importieren, weil nur dort „entschuldigt mit Attest“ steht und das Attest das Kriterium für das Nachschreiben einer Klassenarbeit ist. Format B lässt sich in Untis nicht nach Fach filtern; es enthält alle Abwesenheitszeiträume der Klasse. Das ist für den Abgleich mit Klassenarbeiten richtig so. Der Import von Format B muss daher allein voll funktionsfähig sein; Format A ist optional.
- Klassenarbeiten bekommen ein optionales Feld **Uhrzeit von/bis**. Abgleich: Eine Person gilt am KA-Termin als abwesend, wenn ein Zeitraum aus Format B das KA-Datum einschließt und sich, falls KA-Uhrzeit und Zeitraum-Uhrzeiten vorhanden sind, zeitlich mit der Arbeit überschneidet. Ohne KA-Uhrzeit genügt das Datum.
- Je Person und Klassenarbeit ein Feld **Teilnahme**: mitgeschrieben (Standard) / gefehlt mit Attest, Nachschreiben offen / nachgeschrieben am (Datum) / gefehlt ohne Attest / gefehlt, Entschuldigung offen.
- Nach dem Import schlägt die App für jede Klassenarbeit die Teilnahme vor: Zeitraum mit „entschuldigt mit Attest“ → „gefehlt mit Attest, Nachschreiben offen“; „entschuldigt“ ohne Attest oder „nicht entschuldigt“ → „gefehlt ohne Attest“; „offen“ → „gefehlt, Entschuldigung offen“. Vorschläge in einer Liste mit Haken bestätigen, nie still übernehmen. Ein späterer Import aktualisiert offene Fälle (z. B. „offen“ → „mit Attest“) und zeigt, was sich geändert hat.
- „Gefehlt mit Attest, Nachschreiben offen“ wirkt wie das Excel-Feld „Attest“ (keine Note, zählt nicht im Notenspiegel). Werden später Punkte eingetragen, fragt die App „Nachgeschrieben am …?“ (Standard heute) und wertet die Punkte dann normal.
- Wie „gefehlt ohne Attest“ benotet wird, legt die App **nicht** fest (Schulregel). Die Person bleibt ohne Note und wird deutlich markiert, bis die Nutzerin Punkte oder eine Entscheidung einträgt.
- **Nachschreibliste:** eigene Ansicht über alle Klassen: wer welche Arbeit noch nachschreiben muss (Klasse, Arbeit, Datum, Person), mit Feld Nachschreibtermin und Druck als Liste. Zusätzlich je Arbeit „Teilnahme“ als Spalte bzw. Symbol in der Tabelle.

**Automatischer Abgleich mit WebUntis**
- Nicht Teil dieser Version. Der offizielle Weg (WebUntis-Plattform) setzt eine bei Untis registrierte Plattform-Applikation und die Aktivierung durch die Schuladministration voraus; inoffizielle Schnittstellen würden Zugangsdaten über einen eigenen Server leiten und sind nicht stabil. Stattdessen den Datei-Import so schnell wie möglich machen: Knopf „Untis-Liste laden“ direkt in Klassenarbeits- und Nachschreib-Ansicht, Ziehen-und-Ablegen am PC, Dateiauswahl aus „Dateien“/OneDrive am iPad und Android, Format und Klassenzuordnung merken, nach dem Import sofort die Vorschlagsliste zeigen.

**Auswertung**
- Summen je Person: Fehlstunden entschuldigt, davon mit Attest, nicht entschuldigt, offen, gesamt; Fehltage; Verspätungen (Einträge mit Fehlminuten unter einer vollen Stunde, falls vorhanden). Anzeige in Personenübersicht, Gesamtübersicht (Spalten ein-/ausblendbar) und Excel-Export.
- **Attest bei Klassenarbeiten:** Gibt es für eine Person am Datum einer Klassenarbeit eine Fehlzeit „entschuldigt mit Attest“, zeigt die Klassenarbeits-Ansicht einen Hinweis und bietet an, das Feld „Attest“ zu setzen. Nie automatisch ohne Bestätigung. Bei „nicht entschuldigt“ am KA-Datum ebenfalls ein Hinweis.
- Fehlzeiten fließen **nicht** in Noten ein.
- Abwesenheitsgründe wie „krank“ sind Gesundheitsangaben: nur in der Personen- und Fehlzeitenansicht zeigen, nicht im Excel-Export der Gesamtübersicht, nicht im Druck (außer in einer ausdrücklich gewählten Fehlzeitenliste).

**Testdaten:** Für Tests eigene Beispieldateien mit genau diesen Kopfzeilen und erfundenen Namen/IDs erzeugen (als `.xls` über SheetJS schreiben). Echte Untis-Dateien niemals ins Repository legen.

### 8.7 Vollständiger Export und Import
- **Sicherung exportieren:** das komplette Notenbuch als Notendatei (mit oder ohne Passwort, Nutzerin wählt). **Sicherung importieren:** stellt alles wieder her; vorher Hinweis, dass der aktuelle Stand ersetzt wird.
- **Alles als Excel exportieren:** eine `.xlsx` je Notenbuch mit je Klasse den Blättern Grunddaten, Klassenarbeiten (Punkte je Aufgabe), Sonstige Leistung (alle Einträge), Dalton (falls an), Fehlzeiten, Gesamtübersicht. Fotos nicht.
- Einzelne Klasse aus einem anderen Notenbuch übernehmen (Datei wählen, Klasse auswählen).

### 8.8 Synchronisation über OneDrive (Microsoft 365 der Schule)
- **Optional.** Ohne Einrichtung funktioniert die App wie bisher mit Dateien.
- Anmeldung mit dem dienstlichen Microsoft-Konto über **MSAL.js** (Bibliothek lokal in `lib/`, kein CDN), Ablauf „Authorization Code mit PKCE“ für Single-Page-Apps. Zugriff über Microsoft Graph mit der **kleinsten nötigen Berechtigung `Files.ReadWrite.AppFolder`** (App-Ordner, kein Zugriff auf andere Dateien), alternativ `Files.ReadWrite`, falls der App-Ordner nicht nutzbar ist.
- **Client-ID und Tenant-ID** werden in den Einstellungen eingetragen (nicht im Code fest verdrahtet). Die README erklärt in einfachen Schritten, was die Schul-IT in Microsoft Entra ID einrichten muss (App-Registrierung „Single-Page Application“, Redirect-URI = Adresse der App, Berechtigung, ggf. Administratorzustimmung).
- **Nur verschlüsselt hochladen:** Synchronisation ist nur mit gesetztem Passwort möglich. Die Datei wird im Browser verschlüsselt und erst dann hochgeladen. Microsoft sieht nur verschlüsselte Daten.
- Ablauf: Beim Öffnen die neueste Fassung aus OneDrive laden. Speichern lädt hoch (Autosave nach Änderungen mit kurzer Verzögerung, abschaltbar). Anzeige „zuletzt synchronisiert um …“.
- **Konflikte:** Vor dem Hochladen den Stand (eTag) prüfen. Hat sich die Datei inzwischen auf einem anderen Gerät geändert, nicht überschreiben, sondern fragen: „Andere Fassung laden“ / „Meine Fassung als Kopie speichern“. Keine stillen Überschreibungen.
- Offline arbeiten bleibt möglich; beim nächsten Online-Sein wird mit Konfliktprüfung hochgeladen.
- Testbar machen: OneDrive-Zugriff hinter einer Schnittstelle kapseln, damit Tests ohne echtes Konto laufen (Attrappe für Laden, Speichern, eTag-Konflikt).

### 8.9 Arbeitskopie im Browser verschlüsseln
- Die Arbeitskopie (IndexedDB) wird mit demselben Passwort verschlüsselt wie die Notendatei. Ist kein Passwort gesetzt, Hinweis, dass die Arbeitskopie ungeschützt ist, und Empfehlung, eins zu setzen. Mit Fotos oder OneDrive ist ein Passwort Pflicht.
- Nach 15 Minuten ohne Bedienung sperrt sich die App (Passwort erneut eingeben), Zeit einstellbar.

### 8.10 Tests und Prüfung Stufe 2
- Tests für: Nachschreib-Vorschläge aus Format B allein (Attest, ohne Attest, offen; mit und ohne KA-Uhrzeit; Zeitraum über mehrere Tage) und Aktualisierung bei erneutem Import; Umwandlung Stufe-1-Datei → Notenbuch; Dalton-Zuordnung und Prüffall 8.3; Untis-Import Format A, Format B und beide kombiniert (Attest-Zuordnung über ID und Zeitraum), Fachfilter, Zuordnung über ID und über Namen, doppelte Spalte „Text“, inklusive Doppelimport; Sicherung exportieren und wieder importieren ergibt identische Daten; Verschlüsselung der Arbeitskopie; Synchronisations-Konflikt mit der Attrappe.
- Im Browser prüfen: zwei Klassen anlegen, eine mit Dalton 10 %, Prüffall 8.3 nachvollziehen, Foto hochladen (Testbild), Klasse kopieren, alles als Excel exportieren.

### 8.11 Ganzjahresnote und Zwischenstand
- Grundsätzlich gibt es eine **Ganzjahresnote** je Klasse; die bisherige Berechnung bleibt unverändert.
- Zusätzlich (für die wenigen Halbjahreszeugnisse) in der Gesamtübersicht ein optionaler **Zwischenstand zum Stichtag**: Datumsfeld; berechnet wird nach denselben Regeln, aber nur mit Klassenarbeiten, sL-Terminen und Dalton-Aufgaben mit Datum bis einschließlich Stichtag. Einträge ohne Datum zählen mit. Ohne Stichtag: Ganzjahresnote. Druck und Export zeigen deutlich, welcher Stand gemeint ist („Zwischenstand zum TT.MM.JJJJ“).

### 8.12 Schülerliste aus WebUntis importieren
- In den Grunddaten „Schülerliste importieren“ aus einer Excel- oder CSV-Datei (z. B. Export aus WebUntis). Gleicher Zuordnungsdialog wie in 8.6 (Spalten Name, Vorname bzw. „Name, Vorname“, optional Geburtstag, Geschlecht, Ausbildungsbetrieb).
- Vorschau: neue Personen grün, bereits vorhandene (gleicher Name und Vorname) grau und nicht doppelt angelegt. Nichts wird ohne Bestätigung übernommen.

### 8.13 Archivieren statt Löschen
- Personen können **archiviert** werden (z. B. Ausbildungsabbruch, Klassenwechsel) mit Datum und optionalem Grund. Archivierte erscheinen nicht mehr in Eingabelisten, Schnelleingabe, Notenspiegel und Druck, ihre Daten bleiben aber erhalten.
- Ansicht „Archiv“ je Klasse mit Wiederherstellen. Endgültiges Löschen nur dort, mit deutlicher Rückfrage.
- Gesamtübersicht und Excel-Export können Archivierte auf Wunsch einblenden (gekennzeichnet).

### 8.14 Eigene Listen (Strich-, Abhak- und Betragslisten)
- Je Klasse beliebig viele **eigene Listen**, frei benennbar (z. B. „Hausaufgaben vergessen“, „Material vergessen“, „Praktikumsbericht abgegeben“, „Klassenfahrt bezahlt“). Klassen ohne Listen zeigen nichts davon an.
- Drei Listenarten, beim Anlegen wählbar:
  - **Strichliste:** je Person und Datum ein Strich (+1), Rücknahme möglich; Summe je Person.
  - **Abhakliste:** einmalig je Person erledigt ja/nein mit Datum (z. B. Unterlagen abgegeben); Anzeige, wer noch fehlt.
  - **Betragsliste:** Sollbetrag je Person, gezahlte Beträge mit Datum; offener Rest je Person und Summe.
- Listen umbenennen, ausblenden, löschen (mit Rückfrage), beim Kopieren einer Klasse optional mit übernehmen (ohne Einträge).
- In „Heutige Stunde“ erscheinen Strich- und Abhaklisten der Klasse als Tipp-Felder je Person.
- Eigene Listen fließen **nicht** in Noten ein. Sie erscheinen in der Personenübersicht und als eigenes Blatt im Excel-Export.

### 8.15 Tests zu 8.11 bis 8.14
- Zwischenstand: Prüffall aus Abschnitt 4, KA 2 nach dem Stichtag → Ø KA = 73,3; Gesamt = 73,3 × 0,5 + 77,0 × 0,5 = 75,15 % → Note 3.
- Schülerlisten-Import ohne Doppelungen; Archivieren und Wiederherstellen ändert keine Noten; Strichliste zählen und zurücknehmen; Betragsliste Rest richtig.
