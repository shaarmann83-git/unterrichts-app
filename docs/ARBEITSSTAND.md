# Arbeitsstand (Stand 8.11.2026, App-Stand noten-v20)

Zweck: Gedächtnis für neue Sitzungen. Die Anforderung steht in `docs/SPEC.md` (Abschnitte 12.4 bis 12.9 sind die jüngsten Nachträge). Keine echten Schülerdaten in das Repository.

## Zusammenarbeit
- Nutzerin: Sabine, Lehrkraft an der BBS Lingen Wirtschaft (Niedersachsen), keine Programmiererin. Antworten kurz, auf Deutsch, ohne Fachjargon, Wichtigstes zuerst, ehrlich sagen, was geprüft wurde und was nicht.
- Sie testet auf PC (Edge), iPad (Safari) und Android (Chrome) und schickt Beobachtungen. Sammelt sie ein Test-Paket, antwortet Claude nur „Notiert.“ und baut erst nach ihrem „los“.
- Alte offene Fragen stellt Claude nicht von sich aus erneut.
- Rechenregeln (Abschneiden statt Runden, Notengrenzen, Sport-Prüfungsprozent) nie ohne Rückfrage ändern.

## Technik
- Statische PWA ohne Build, ES-Module, Bibliotheken (SheetJS, MSAL) in `lib/`, keine CDNs. GitHub Pages aus `main`: https://shaarmann83-git.github.io/unterrichts-app/
- Tests: `npm test` (244 grün). Browserprüfung mit Playwright gegen `python3 -m http.server`.
- Neue JS-Datei: in `sw.js` (`DATEIEN`) eintragen (ein Test erzwingt das) und mit `git add` aufnehmen, `commit -a` nimmt neue Dateien nicht mit.
- Bei jeder Auslieferung `VERSION` in `sw.js` und `APP_STAND` in `js/ansichten/einstellungen.js` gleich erhöhen. Die Nutzerin sieht den Stand unten in den Einstellungen.
- Veröffentlichung dauert ein bis zwei Minuten; danach in der App „Aktualisieren“ (rechte Maustaste) bzw. Strg+F5. Der Offline-Dienst holt Dateien zuerst vom Netz (ohne HTTP-Zwischenspeicher).
- Commit-Ende: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` und die `Claude-Session`-Zeile. Nach dem Push `git ls-remote origin main` mit `git rev-parse HEAD` vergleichen und `git update-ref refs/remotes/origin/main HEAD`.
- Ansichten: `ansichtRegistrieren(id, {text, bauen, klasse, nurWenn, reihe, klassenWahlSelbst})`, `bauen()` liefert `{el, update}`. Hilfen in `js/ui.js` (`h`, `fuege`, `toast`, `bestaetigen`, `personLink`, `tabelleFixieren`).

## Dateien und Synchronisation
- Verschlüsselte `.noten`-Datei (AES-GCM), lokale Arbeitskopie in IndexedDB. „Speichern“ schreibt in die gewählte Datei (Edge am PC), auf iPad und Android nur Download.
- OneDrive über MSAL/Graph, nur der App-Ordner `Apps/Notenverwaltung` (Berechtigung `Files.ReadWrite.AppFolder`). Anmeldung am PC per Popup, mobil per Weiterleitung. Für drei Geräte empfohlen: immer „Aus OneDrive öffnen“ und Synchronisation an.
- Eigene Dateien außerhalb des App-Ordners werden nicht synchronisiert.

## Umgesetzt (Auswahl, jüngste zuerst)
- Anwesenheit Lernfeld: Spalten aus Stundenplan, Ferien und Feiertage Niedersachsen (`js/rhythmus.js`), Zeichen `. V | E A B P U`, „Alle da“, Datum frei wählbar, selbst angelegte Tage löschbar, „Schuljahr auffüllen“, Tage mit Klassenarbeit gelb („KA n“), Kopfzeilen sowie Nr. und Name beim Scrollen fixiert (auch Sport).
- Untis-Abgleich je Stunde: Stundenraster in den Einstellungen für Einträge mit Stundennummer; Zeiträume mit Uhrzeit (AbsenceList, Format B) werden direkt nach Uhrzeit mit den eigenen Stunden verglichen; einzelne Untis-Einträge lassen sich für die eigene Stunde ignorieren; der Dialog nennt den Grund.
- Fehlzeiten: zeigt standardmäßig alles (Klassenleitung), Spalten Offen, Entschuldigt, davon mit Attest, Nicht entschuldigt, Gesamt, Fehltage, Verspätungen; offene Einträge oben; optionaler Filter „nur meine Tage“; Knopf „Importierte Fehlzeiten löschen“.
- Sport: Schuljahr auffüllen nur für das Halbjahr (außer Zeitraum „ganzes Schuljahr“).
- Drucken: Protokoll (Schwerpunkte mittig, Sonstiges automatisch, Unterschriftszeile automatisch), Korrekturliste blanko und ausgefüllt, Anwesenheitsliste; erreichbar ohne gewählte Klasse; Kopfbilder dort statt im Notenbuch.
- Unterschrift: Zusatzzeile nur bei Note schlechter als 4 (Punkte unter 4). Ausbildung (Klassenname beginnt mit W oder G, oder Betrieb eingetragen; einstellbar): Ausbildungsbetrieb, sonst Erziehungsberechtigte nur unter 18.
- Einstellungen: Notensystem, Notenschlüssel, Punkteschlüssel, Unterschriftszeilen je Klasse. Hilfetexte an Knöpfen (`js/hilfe.js`), auf Touch-Geräten Knopf „Hilfe“.
- Start: lokale Arbeitskopie per Klick auf die Karte öffnen; Import-Knöpfe im Notenbuch.
- Klassenarbeiten: Tabelle als Startansicht, Teilaufgaben, Endergebnis fett, Namen führen zur Personenübersicht (überall, wo Namen stehen).

## Bewusste Entscheidungen
- Zeichenreihenfolge in der Anwesenheit: eigenes Fehlzeichen vor Untis vor eigenem „.“ oder V.
- Fehlzeiten fließen nie in Noten ein.
- Klassenerkennung Ausbildung nur am Namen (W oder G) oder Betrieb, nicht an der Bezeichnung.
- Ohne Geburtstag gilt jemand als minderjährig, solange „volljährig“ nicht angehakt ist.

## Offen / nicht geprüft
- Nicht auf echten Geräten geprüft: Android und iPad (Anmeldung per Weiterleitung, Datei öffnen), Ursache der iPad-Synchronisationsprobleme unbekannt (Details erfragt), Druck auf Papier, Kopfbild-Auswahl im Drucken-Reiter, Mitarbeit-Raster mit fixierten Kopfzeilen.
- End-to-End-Test der OneDrive-Synchronisation mit drei Geräten steht aus.
- Ideen, nicht gewünscht oder nicht entschieden: Lizenz für das Repository, kurze Anleitung, Excel-Import mit freier Spaltenzuordnung, Verhalten beim Klick auf eine Klassenkachel (Empfehlung: zuletzt genutzte Ansicht), Spalte „Entschuldigte Tage“ fürs Zeugnis (Untis rechnet Fehltage und unentschuldigte Tage getrennt, die Nutzerin schreibt fürs Zeugnis ab), Knopf „Tag leeren“ in der Anwesenheit, Anzeige von Dateiname, letzter Speicherung und letzter Synchronisation oben im Notenbuch.

## Gesammelte Wünsche (nicht umgesetzt, erst nach „los“)
- Attest-Häkchen in der Klassenarbeit soll automatisch gesetzt werden, wenn Untis am Termin „entschuldigt mit Attest“ meldet. Zusätzlich soll „kein Attest“ deutlich gekennzeichnet werden, ohne dass daraus automatisch eine 6 wird (Fehlen kann situationsabhängig sein, z. B. Verspätung im ÖPNV). Stand im Code: Das Häkchen (`e.attest`) und der Teilnahme-Status „gefehlt mit Attest, Nachschreiben offen“ bewirken dasselbe (`js/rechnen.js` ergebnisKA); der Status wird schon aus Untis abgeleitet, das Häkchen nicht. Die Nutzerin fragt, ob das Häkchen dort überhaupt Sinn hat.
- In der App soll irgendwo (Start oder Fehlzeiten, beim Import-Knopf) stehen, wo man die Untis-Abwesenheitsliste findet: Klassenbuch, Abwesenheiten, Klasse auswählen, Zeitraum „gesamtes Schuljahr“, dann unter Berichte die Excel-Datei wählen. Die Schülerliste (Klassenimport) steht in Untis unter Stammdaten, Schüler, Klasse auswählen, Berichte, ebenfalls als Excel-Datei. Beide Wege sollen in der App beim jeweiligen Import-Knopf erklärt werden.
