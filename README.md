# chris-g.dev

Angular 21 mit einer Express-API, PostgreSQL und Prisma. Portfolio, Login/Setup,
Dateien, Kurzlinks, Statistiken und Sicherheitseinstellungen laufen in Angular.
Die API übernimmt Datenbank, Sitzungen, 2FA und Dateizugriff.

GitHub-Upload und automatische Docker-Updates über GitHub Actions/GHCR und
Portainer: [GITHUB-PORTAINER.md](GITHUB-PORTAINER.md).

## Lokal unter Windows

Voraussetzungen: Node.js 24, npm und Docker Desktop (Linux-Container).

```powershell
npm install
npm run db:local:start
npm run db:generate
npm run db:migrate:deploy
npm run dev
```

Website: http://localhost:3000 · interne Entwicklungs-API: http://127.0.0.1:3001.
`npm run dev` startet beide Prozesse. Mit Strg+C werden beide beendet.
Bei einem belegten Port zuerst den bisherigen Devserver stoppen.

Die lokale PostgreSQL-Datenbank läuft separat auf `127.0.0.1:5433`,
im Compose-Projekt `chrisg-website-dev`, mit eigenem persistentem Volume.
`npm run db:local:stop` stoppt sie und erhält die Daten.

### Lokale Konfiguration

Die eingerichteten Dateien sind durch `.gitignore` ausgeschlossen:

- `.env.development.local`: `LOCAL_DB_PASSWORD` für die lokale Docker-Datenbank.
- `packages/db/.env`: `DATABASE_URL` für Prisma-CLI und Migrationen.
- `apps/web/.env.local`: dieselbe `DATABASE_URL`, `SESSION_SECRET` (mindestens 32
  Zeichen), `DATA_DIR` (lokaler absoluter Pfad) und optional `PUBLIC_BASE_URL`.

Die API liest zuerst `apps/web/.env.local`, danach `packages/db/.env` und `.env`.
Explizite Prozessvariablen haben Vorrang. `NEXT_PUBLIC_BASE_URL` bleibt aus der
bisherigen Konfiguration kompatibel; neue Konfigurationen verwenden `PUBLIC_BASE_URL`.
Für eine neue Installation müssen diese Dateien zunächst passend angelegt werden.
Keine Zugangsdaten committen. Prisma wählt seine native Engine automatisch aus.

Beim Erststart unter `/setup` den Adminzugang anlegen. Danach `/login` und `/admin`.
Optionales Standard-Portfolio: `npm run db:seed`.

## Portfolio und Plattformfarben

Bei einem Link erkennt „Automatisch anhand der URL“ z.B. Twitch, Discord,
YouTube, Spotify, GitHub, X, Instagram oder TikTok. Alternativ lässt sich die
Plattform explizit wählen. Icon und Farbe werden sofort als Vorschau angezeigt.
Twitch verwendet `#9146FF`, Discord `#5865F2`.

Ohne eigene Farbe wird die Plattformfarbe auch bei bestehenden Links verwendet.
Bereits gespeicherte eigene Farben bleiben erhalten. Bei neuen Links kann
„Eigene Farbe verwenden“ die Automatik überschreiben.

Bestehende Links lassen sich über „Bearbeiten“ ändern: Plattform, Beschriftung,
URL, Reihenfolge und eigene/automatische Farbe. „Abbrechen“ verwirft den Linkentwurf.
Profilentwürfe bleiben beim Speichern eines Links erhalten.

Im Profilformular sind außerdem die Buttons (Beschriftung, Ziel und Reihenfolge)
sowie die Überschrift und die einzelnen Leistungen des WebServices-Bereichs
bearbeitbar. Interne Pfade, Abschnittsanker und HTTP(S)-Ziele sind erlaubt.
Eine leere Button- oder Leistungsliste blendet den entsprechenden Bereich aus.
Der Adminbereich übernimmt das gespeicherte Hintergrund-Preset samt Abdunklung,
Unschärfe und Vignette. Nach dem Speichern wird der Admin-Hintergrund aktualisiert.

### Spotify-Wiedergabe

„Spotify beim Betreten automatisch starten“ aktiviert einen Startversuch über
die offizielle Spotify iFrame API. Standardmäßig ist die Option ausgeschaltet.
Browser können Autoplay trotz Betreten-Klick blockieren; der sichtbare Player
und ein manueller Start bleiben verfügbar. Beim Verlassen der Profilseite wird
der API-Player entfernt. Falls das API-Script nicht lädt, erscheint der normale Embed.

Vollständige Songs werden von Spotify abhängig von Wiedergabesitzung, Verfügbarkeit
und Browser-Unterstützung angeboten. Die Website kann Vorschau-Beschränkungen
nicht aufheben. `encrypted-media` bleibt erlaubt; „In Spotify öffnen“ bietet einen
direkten Weg zum Track. Die Spotify-Anmeldung erfolgt ausschließlich bei Spotify.
Details: [Spotify iFrame API](https://developer.spotify.com/documentation/embeds/references/iframe-api)
und [Embed-Troubleshooting](https://developer.spotify.com/documentation/embeds/tutorials/troubleshooting).

## Funktionen und URLs

- `/`: Portfolio mit Hintergrund-Presets, Avatar, Banner, Spotify und SEO.
- `/admin/portfolio`: Profil und Links.
- `/admin/files`: Uploads bis 50 MB, öffentlich/privat, Löschen.
- `/f/<key>`: Angular-Dateiviewer; `/f/<key>/raw`: Original inklusive Byte-Ranges.
- `/admin/shortlinks`: Erstellen, Bearbeiten, Ablaufdatum, Aufruflimit und Countdown.
- `/s/<key>`: Kurzlink. Bots und HEAD zählen nicht. Gesteuerte Weiterleitungen
  verwenden die Angular-Seite `/go/<key>` mit signierter Freigabe.
- `/admin/stats`: Top-Links, Top-Dateien und letzte Dateizugriffe.
- `/admin/security`: Passwortwechsel (meldet alle Sitzungen ab), TOTP ein/aus.

Die API schützt Adminzugriffe serverseitig; Angular-Routenschutz allein genügt
nicht. Schreibzugriffe verwenden Angulars XSRF-Cookie/-Header. Uploads legen
Dateien exklusiv an und überschreiben auch bei parallelen Requests keine Daten.
Private Dateien liefern ohne Anmeldung 404. Raw-Aufrufe zählen keine Views.

## Build und Prüfung

```powershell
npm test
npm run typecheck
npm run build
npm start
```

`npm start` liefert den Angular-Produktionsbuild und die API gemeinsam aus.
Lokal standardmäßig auf Port 3001; bei `NODE_ENV=production` auf Port 3000.
Der Produktionsserver liefert die Portfolio-Metadaten bereits im HTML für
Social-Vorschauen. Der Seiteninhalt selbst wird von Angular im Browser gerendert.

## Docker / Produktion

```sh
docker compose up -d --build
```

Die vorhandene `docker-compose.yml` verwendet weiterhin PostgreSQL 16, Netzwerk
`npm_local`, Port 3000 und die Datenablage `./data`. Nginx Proxy Manager leitet an
`app:3000` weiter. Das Netzwerk muss bereits existieren.

Vor dem Start `SESSION_SECRET` als dauerhaftes zufälliges Secret setzen.
Ein bestehendes Secret beibehalten, damit verschlüsselte TOTP-Schlüssel und
Sitzungen weiter funktionieren. Ein Wechsel des Secrets macht diese ungültig.
Uploads und Datenbank bleiben in den bestehenden Volumes. Neue konfigurierbare
Portfolio-Inhalte verwenden die additive Migration `20261024000100_portfolio_content`.
Bestehende Profile behalten zunächst ihre bisherigen Standard-Buttons und Leistungen.
Lokal `npm run db:migrate:deploy` und `npm run db:generate` ausführen und danach
den Devserver neu starten. Unter Windows den Devserver vor `db:generate` stoppen,
damit die Prisma-DLL nicht gesperrt ist. Der Docker-Entrypoint wendet Migrationen
automatisch an. Eine Neuinitialisierung der Datenbank ist nicht nötig.

## Quellstruktur

- `apps/web`: Angular, Standalone-Komponenten, Router und HttpClient.
- `apps/api`: Express-API und Produktionsserver.
- `packages/db`: bestehendes Prisma-Schema, Migrationen und Seed.
- `shared`: Plattform-Erkennung und Farben, gemeinsam für API und Angular.
- `tests`: API- und Speicher-Regressionstests mit temporären Testdaten.

Der vorherige Next.js-Quellstand liegt lokal unter
`.migration-backup/next-original` (inklusive alter Konfiguration und Lockfile,
ohne Daten und Secrets). Er ist vom Docker-Build und von Git ausgeschlossen.

## Effekte, Musik und externe Links

Unter Admin → Portfolio gibt es jetzt 12 Hintergrund-Presets, acht Animationsmodi
(einschließlich „Keine“) und sechs Cursor-Optionen (einschließlich „Standard“).
Hintergrund, Animation und Geschwindigkeit lassen sich kombinieren; eigene Bilder
oder stumme Videos sind über eine HTTP(S)- oder `/f/<key>/raw`-URL möglich.
„Effekte voranzeigen“ zeigt den Entwurf im Adminbereich ohne Speichern. Beim
Verlassen der Seite wird das gespeicherte Design wiederhergestellt. Auf Touch
und bei „Bewegung reduzieren“ werden Cursor-Effekte deaktiviert; Hintergrund-
animationen werden bei reduzierter Bewegung angehalten.

Externe Profil-Links und externe Profil-Buttons öffnen zunächst eine Rückfrage
mit Ziel-Domain, „Link öffnen“, „Abbrechen“ und „Nicht erneut fragen“.
Die letzte Option gilt lokal für diesen Browser und wird erst beim Bestätigen
übernommen. Über „Link-Rückfragen wieder aktivieren“ lässt sie sich zurücksetzen.
Interne Pfade und Abschnittsanker bleiben direkt bedienbar.

Die öffentliche Kurzlink-Warteseite und Bot-Vorschau zeigen kein Weiterleitungsziel.
Auch der GET-Endpunkt zur Vorbereitung enthält weder Ziel-Host noch Ziel-URL.
Nach Bestätigung erfolgt die normale Weiterleitung; die endgültige URL ist dabei
im Browser sichtbar. Im geschützten Adminbereich bleibt das Ziel editierbar.

Für einen eigenen Musikplayer kann im Profil eine öffentliche MP3-, OGG-, WAV-
oder M4A-Datei hochgeladen oder deren URL eingetragen werden. Der Upload ist
öffentlich abspielbar; das Profil muss danach gespeichert werden. Der Player
unterstützt Play/Pause, Zeitposition und Lautstärke und ersetzt bei konfigurierter
Audio-URL den Spotify-Embed. Es gibt keine künstliche Vorschau-Begrenzung für
diese eigene Audiodatei. Verwende nur Dateien, für deren Nutzung du berechtigt bist.
Autoplay ist weiterhin von der Browserfreigabe abhängig. Spotify-Inhalte werden
nicht heruntergeladen oder über diesen Player umgeleitet.

## Discord-Profil und animierte Titel

Unter Admin → Portfolio → Discord-Profil können globaler Avatar, globales Banner
und Anzeigename einzeln von Discord synchronisiert werden. Die Abfrage verwendet
die offizielle Discord-API mit einem Bot-Token, der ausschließlich auf dem Server
bleibt. Es wird kein persönlicher Discord-Benutzertoken verwendet.

Lokale Einrichtung:

1. Den bestehenden Bot-Token als `DISCORD_BOT_TOKEN` in `apps/web/.env.local`
   hinterlegen (nicht ins Frontend, nicht in Git und nicht in ein Formular).
2. Die API bzw. `npm run dev` neu starten.
3. In Discord den Entwicklermodus aktivieren und die Benutzer-ID des gewünschten
   Profils kopieren. Die ID im Adminformular eintragen.
4. „Discord-Vorschau laden“ prüfen. Bei Bedarf die Werte einmalig übernehmen oder
   die gewünschten Synchronisierungsfelder aktivieren und das Portfolio speichern.

Für Docker wird `DISCORD_BOT_TOKEN` aus der Compose-Umgebung an die API übergeben.
Die Ergebnisse werden fünf Minuten zwischengespeichert und beim nächsten Abruf
aktualisiert. Bei Discord-Ausfällen oder fehlender Konfiguration werden weiterhin
die manuellen Profilwerte ausgeliefert. Animierte Discord-Avatare und Banner
bleiben als GIF erhalten. Server-spezifische Profile, Bio und Online-Status sind
nicht Teil dieser Benutzerabfrage.

Profil-Titel bieten Farbverlauf, Glow, Schimmer, Schweben und Schreibmaschine.
Der Browser-Tab-Titel kann separat eine Schreibmaschine oder einen Lauftext nutzen.
Die Livevorschau ändert keine gespeicherten Werte. Reduzierte Bewegung deaktiviert
die Animationen; der vollständige Profilname bleibt für Screenreader verfügbar.

„Click to enter“ erscheint bei jedem Öffnen, Neuladen und erneuten Aufrufen der
Portfolio-Seite. Auch bei einer Wiederherstellung aus dem Browser-Back/Forward-Cache
wird der Einstieg zurückgesetzt. Die frühere SessionStorage-Freigabe wird nicht
mehr gelesen oder geschrieben.

Portfolio: Die öffentliche Karte zeigt Banner mit Aufrufzähler, Profil, Musik, Social-Links und Buttons in dieser Reihenfolge. Social-Links starten als Icons; unter Admin → Portfolio → Inhalte lässt sich der Text zuschalten. Unter Design sind die Kartenanimationen (Lebendig/Dezent/Aus) einstellbar. Die Systemeinstellung für reduzierte Bewegung wird beachtet. Aufrufe werden erst nach „Click to enter“ gezählt, bekannte Bots übersprungen und wiederholte Besuche mit signiertem 30-Minuten-Cookie zusammengefasst. Dies ist kein eindeutiger Personenzähler; bisherige Besuche lassen sich nicht rückwirkend zählen.
Der Einstieg reagiert magnetisch auf Mausbewegungen (Vergrößerung und Versatz). Die Portfolio-Karte schwebt und kippt mit perspektivischem Lichtreflex; bei Verlassen kehrt sie weich zurück. Dezent reduziert die Stärke, Aus und reduzierte Bewegung deaktivieren sie. Touch-Eingaben lösen keine Kippbewegung aus.
Unter Portfolio → Inhalte lassen sich bis zu zwölf weitere Bereiche mit Titel, Text, Liste und bis zu zehn Buttons anlegen und sortieren. Öffentliche Discord-Abzeichen werden anhand von public_flags angezeigt und lassen sich im Discord-Bereich abschalten; Nitro und Boost werden nicht aus anderen Merkmalen abgeleitet. Die Kartenreaktion reicht 220 px seitlich und 180 px vertikal über die Karte hinaus. Die Glasfläche verwendet nun ungefähr 57–60 % Deckkraft.

## Discord-Logs

`DISCORD_LOG_CHANNEL_ID` legt den Zielkanal für den vorhandenen `DISCORD_BOT_TOKEN` fest. Lokal steht die Kanal-ID in `apps/web/.env.local`; für Docker beide Variablen in der Produktionsumgebung setzen. Der Bot braucht Kanalansicht und Schreibrechte. Die API sendet zusammengefasste Nachrichten ohne Pings.

`/admin/logs` zeigt Zustellstatus und die letzten 100 Ereignisse: Seitenbesuche, Portfolio-Eintritt, erfolgreiche und fehlgeschlagene Logins, Abmeldung, Setup, Admin-Schreibaktionen, Backend- und Browser-Laufzeitfehler sowie Discord-Verbindungsprobleme. Seite, Client-IP, Browser, Betriebssystem und Gerätetyp werden im Adminbereich und im Discord-Kanal protokolliert. Fehlertexte, Bodies, Passwörter, Tokens und konkrete Datei-/Kurzlink-Keys werden nicht versendet. Browserfehler enthalten deshalb nur Kategorie und normalisierte Route. Seitenaufrufe sind clientseitige Meldungen und kein manipulationssicherer Besucherzähler.

Lokale Ereignisse bleiben nur bis zum API-Neustart im Arbeitsspeicher; die Discord-Nachrichten bleiben im Zielkanal. Der Versand läuft unabhängig von Nutzeranfragen mit begrenzter Warteschlange (200), bis zu drei Wiederholungen bei Verbindungsproblemen und Wartezeit bei Discord-Rate-Limits. Nicht zugestellte/verdrängte Ereignisse werden gezählt. Es besteht keine Garantie einer lückenlosen Zustellung. Eine Testnachricht lässt sich in der Log-Verwaltung senden.

## Zusätzliche Hintergründe

Unter Portfolio → Design stehen jetzt auch Partikelnetz (mit Cursor-Verbindungen), Sternbilder, Blasen, Funken, Meteore, Lichtwellen und digitaler Regen zur Verfügung. Die Canvas-Effekte sind lokal implementiert und benötigen kein extern geladenes particles.js-Script. Farbe, Geschwindigkeit, Partikeldichte und Cursor-Verbindung sind einstellbar. Partikelanzahl und Auflösung sind begrenzt, in verdeckten Tabs pausiert die Schleife; reduzierte Bewegung zeigt eine statische Variante. Eigene Hintergründe bleiben kombinierbar.

### Projektprüfung und Betrieb

Der Portfolio-Editor liest manuelle Profilwerte aus der geschützten Admin-API; die öffentliche Discord-Auflösung überschreibt diese Rückfallwerte nicht mehr. Beim schnellen Verlassen der Profilseite startet eine verspätete Antwort keine neue Titelanimation. Die mobile Speicherleiste überdeckt keine Eingabefelder mehr. Fehlende Datensätze liefern 404 statt eines allgemeinen Serverfehlers. Belegte Entwicklungsports werden vor dem Start beider Prozesse erkannt.

Der Produktions-Compose-Stack verlangt jetzt explizit `SESSION_SECRET`; bekannte Platzhalter werden serverseitig abgelehnt. `PUBLIC_BASE_URL` hat Vorrang vor dem älteren `NEXT_PUBLIC_BASE_URL`. Die Host-Ports von App und Datenbank sind auf `127.0.0.1` begrenzt. Nginx Proxy Manager erreicht die App weiterhin über `npm_local` und `app:3000`. Diese Änderungen werden erst beim nächsten eigenen Compose-Deployment wirksam. Bestehende Datenbankpasswörter und Datenvolumes wurden nicht verändert; der bestehende Produktionsstack verwendet weiterhin die in Compose hinterlegten Datenbank-Zugangsdaten. Eine Passwortrotation bestehender PostgreSQL-Volumes ist ein gesonderter Schritt.
Die Prüfung vom 24.10.2026 und ihre Grenzen sind in PROJECT-REVIEW.md dokumentiert. Die Einblendanimation der Glaskarte behält keinen Blur-Filter mehr bei.

## SCSS, Formatierung und fensterweite Bewegung

Der globale SCSS-Einstieg ist `apps/web/src/styles.scss`. Er bindet die Bereiche `base`, `scene`, `editor`, `portfolio`, `interaction` und `extensions` aus `apps/web/src/styles/` in der bisherigen Kaskaden-Reihenfolge ein. Neue Angular-Komponenten verwenden standardmäßig SCSS. Nach einer Änderung des globalen Style-Einstiegs muss ein bereits laufender Devserver neu gestartet werden.

`npm run format` formatiert Quellcode, Templates, Styles und Konfiguration; `npm run format:check` prüft das Format ohne Änderungen. Die gemeinsame Konfiguration steht in `.prettierrc.json`. Secrets, Datenverzeichnisse, Build-Ausgaben und Sicherungskopien sind ausgeschlossen.

Einstieg und Karte reagieren auf Mauspositionen im gesamten sichtbaren Fenster (100 vw × 100 vh). Die Mitte ist neutral; Versatz und Neigung steigen bis zum Rand an und passen sich bei geänderter Fenstergröße an. Die Strecke ist begrenzt, damit die Karte bedienbar bleibt. Dezent, Aus, Touch-Geräte und reduzierte Bewegung werden berücksichtigt. Die Berechnung liegt in `shared/motion.ts`.

### Besucherdaten und Discord-Zeitangaben

Jedes anfragebezogene Log enthält die besuchte Seite getrennt von der API-Route, die serverseitig ermittelte IP, Browser und Version, Betriebssystem sowie Gerätetyp (Desktop/Laptop, Smartphone, Tablet oder Bot). Die Erkennung basiert auf dem User-Agent und kann je nach Browser unvollständig oder ungenau sein; beispielsweise unterscheiden viele Browser Windows 10 und 11 nicht. IPs stammen aus Express und nicht aus dem Event-Body. Lokal ist normalerweise die Loopback-IP sichtbar.

`TRUST_PROXY` steuert, welchen vorgeschalteten Proxies Express vertraut: lokal standardmäßig `loopback`, in Produktion ein Proxy-Hop. Für andere Proxy-Ketten einen passenden Wert oder vertrauenswürdige Proxy-Netze konfigurieren. `TRUST_PROXY=false` ignoriert weitergeleitete IPs. Hinter Nginx Proxy Manager/Cloudflare müssen die echten Client-IPs korrekt und nur von vertrauenswürdigen Proxies weitergereicht werden. Es wird kein externer IP- oder Geräte-Erkennungsdienst verwendet.

Discord zeigt die Ereigniszeit mit `<t:UNIXSEKUNDEN:F>` und zusätzlich relativ mit `<t:UNIXSEKUNDEN:R>`. Die Nachrichten werden anhand ihrer Länge gebündelt, damit zusätzliche Besucherdaten die Discord-Nachrichtenbegrenzung nicht überschreiten. IPs und Geräteangaben erscheinen im konfigurierten Discord-Kanal. Query-Parameter, Tickets, Zugangsdaten und Formularinhalte bleiben ausgeschlossen; Datei-/Kurzlink-Keys bleiben maskiert.
