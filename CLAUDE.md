# Hinweise für Claude

- Den aktuellen Arbeitsstand (Zusammenarbeit, Technik, Offenes) liest du zuerst in `docs/ARBEITSSTAND.md`.
- Die vollständige Anforderung steht in `docs/SPEC.md`. Lies sie zuerst ganz und halte dich daran. Das IHK-Schema liegt in `docs/ihk-schema.json`.
- Die Nutzerin ist Lehrkraft, keine Programmiererin. Erkläre Entscheidungen kurz auf Deutsch, ohne Fachjargon.
- Niemals echte Schülerdaten committen. Testdaten nur mit erfundenen Namen.
- Rechenergebnisse müssen exakt der Excel-Vorlage entsprechen (Abschneiden statt Runden, Notengrenzen laut SPEC). Ändere keine Rechenregel ohne Rückfrage.
- Keine Laufzeit-Abhängigkeit von CDNs oder Drittdiensten; Bibliotheken liegen im Repository.
- Vor „fertig“: Tests laufen lassen und den Prüffall aus SPEC Abschnitt 4 im Browser nachvollziehen. Sag ehrlich, was du geprüft hast und was nicht.
