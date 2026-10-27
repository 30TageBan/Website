# Projektprüfung – 24.10.2026

Geprüft wurden Angular-Komponenten und Routing, Portfolio-Editor und öffentliche Karte, API-Routen, Anmeldung/Setup/TOTP, Dateiablage mit Zugriffsprüfung, Kurzlink-Weiterleitungen, Prisma-Konfiguration, Entwicklungsskripte, Compose/Docker sowie installierte Abhängigkeiten.

Korrigiert:

- Der Admin-Editor liest manuelle Profilwerte über eine geschützte API und überschreibt sie nicht mehr versehentlich mit aufgelösten Discord-Werten.
- Nach dem Verlassen der Profilseite starten verspätete Ladeantworten keine Titel-Timer mehr.
- Die externe Linkabfrage setzt ihre Merken-Checkbox für jede neue Abfrage zurück.
- Datei-Uploads berücksichtigen ungültige Keys und die Größenbegrenzung bereits im Formular.
- Nicht mehr vorhandene Datensätze liefern 404 statt 500.
- Der Devserver prüft belegte Ports vor dem Start beider Prozesse.
- Unsichere Secret-Platzhalter verhindern den Produktionsstart; Compose verlangt ein gesetztes SESSION_SECRET.
- PUBLIC_BASE_URL hat Vorrang vor der alten Next.js-Variable.
- Compose-Hostports sind auf localhost begrenzt; der Zugriff von Nginx Proxy Manager über das bestehende Docker-Netz bleibt möglich. Keine laufende Produktionsinstanz wurde verändert.
- Die Speicherleiste verdeckt auf kleinen Bildschirmen keine Formularfelder mehr.
- Ein nach der Einblendanimation beibehaltener Blur-Filter wurde entfernt, der die bewegliche Glaskarte im Browser unscharf machte.

Ergänzt:

- Discord-Logs für Seitenmeldungen, Portfolio-Eintritt, Anmeldungen, Admin-Aktionen und Fehler. Kanal 1563468783497125990 ist lokal konfiguriert; eine echte Testnachricht wurde erfolgreich gesendet.
- Geschützte Log-Verwaltung unter /admin/logs mit Filter und Zustellstatus.
- Sieben weitere Hintergrundeffekte einschließlich eines lokal implementierten Partikelnetzes, mit Dichte und Cursor-Verbindungen.

Prüfergebnisse:

- 49 Regressionstests erfolgreich.
- Angular-Typprüfung und Produktionsbuild erfolgreich.
- npm audit: beim Abgleich keine bekannten Schwachstellen in Produktions- oder Entwicklungsabhängigkeiten.
- Docker-Prüfimage erfolgreich gebaut. Linux-Prisma-Client führte eine reine Leseabfrage gegen die lokale Datenbank erfolgreich aus.
- Browserprüfung mit isolierten Testdaten: neue Effektauswahl, Partikelnetz, Effektwechsel, Log-Oberfläche und mobile Speicherleiste. Keine echten Profilinhalte dabei gespeichert.

Grenzen:

- Keine Veröffentlichung oder Aktualisierung des Live-Servers erfolgt.
- Kein vollständiger Penetrationstest. Produktions-Reverse-Proxy, DNS/TLS, Backups und Wiederherstellung wurden nicht live getestet.
- Bestehende PostgreSQL-Zugangsdaten wurden nicht rotiert. Produktions-Compose enthält weiterhin die bisherigen Datenbank-Zugangsdaten; eine Rotation bestehender Volumes muss gesondert geplant werden.
- Log-Ereignisse sind lokal flüchtig und werden nach bestem Bemühen an Discord zugestellt. Warteschlangenüberlauf, lange Ausfälle und Neustarts können Lücken verursachen.
