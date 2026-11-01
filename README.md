# Lernplaner

Smarter Lernplaner für Vincenzo: Hausaufgaben, Tests und Prüfungen eintragen, der Plan entsteht automatisch.

- **Heute**: was jetzt zu lernen ist, mit Fokus-Timer und Lerntipp je Einheit
- **Woche**: Plan der nächsten 14 Tage inkl. Terminen
- **Einträge**: Hausaufgaben, Tests, Prüfungen, Projekte verwalten
- **Mehr**: Lernzeit pro Wochentag, freie Tage, Backup

## Wie plant die App?

- Tests/Prüfungen werden auf mehrere Tage **verteilt** (Stoff erarbeiten → Üben & Abfragen → Wiederholen am Vortag).
- Lerneinheiten sind kurz (Standard 40 Min); schwierige Fächer kommen am Tag zuerst.
- Nähere Termine haben Vorrang. Reicht die Lernzeit nicht, warnt die App.
- Gelernte Zeit wird abgehakt; der Plan passt sich automatisch neu an.

## Technik

Reine statische Web-App (HTML/CSS/JS, keine Abhängigkeiten, als App installierbar). Daten liegen im `localStorage` des Browsers; Backup/Import über „Mehr“.

Lokal testen: `python -m http.server` und `http://localhost:8000` öffnen.
