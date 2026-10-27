# Deployment mit Portainer – einzelner Docker-Server

Für automatische Image-Builds aus einem GitHub-Repository und anschließende
Portainer-Updates siehe [GITHUB-PORTAINER.md](GITHUB-PORTAINER.md).
Der folgende Ablauf beschreibt alternativ den manuellen Build auf dem Server.

Diese Anleitung verwendet Docker Standalone und einen vorhandenen Nginx Proxy Manager im Docker-Netz `npm_local`. Das App-Image wird direkt auf demselben Docker-Host gebaut, den Portainer verwaltet. Ein Registry-Konto ist dafür nicht nötig. Ein Portainer-Upload nur der Compose-Datei überträgt den Quellcode nicht; deshalb verwendet die separate Stack-Datei ein fertig gebautes Image statt `build: .`.

## Bestehende Installation zuerst prüfen

Bei einem Update die bisherige Stack-Konfiguration und Umgebungsvariablen sichern. In Portainer bei den Containern die Mounts ansehen und den tatsächlichen absoluten Host-Pfad für die Daten übernehmen. Die App erwartet Uploads in `SITE_DATA_DIR/files` und PostgreSQL-Daten in `SITE_DATA_DIR/postgres`. Werden bisher benannte Volumes verwendet, diese unverändert in die neue Stack-Datei übernehmen, statt auf neue Bind-Mounts zu wechseln.

Das vorhandene `SESSION_SECRET` und das tatsächliche Datenbankpasswort beibehalten. Das Setzen von `POSTGRES_PASSWORD` ändert nicht das Passwort einer bereits initialisierten PostgreSQL-Datenbank. Verwendet die bestehende Datenbank einen anderen Benutzernamen/Datenbanknamen als `postgres`/`chrisg`, auch diese Angaben und `DATABASE_URL` in der neuen Datei entsprechend beibehalten. Enthält das Passwort URL-Sonderzeichen, in `DATABASE_URL` die URL-kodierte Form verwenden, während `POSTGRES_PASSWORD` das Original enthält.

Vor einem bestehenden Stack-Update einen PostgreSQL-Dump und eine Sicherung der Uploads an einem separaten Ort anlegen. Die bisherige Konfiguration und das bisherige App-Image für einen Rollback aufbewahren. Migrationen laufen beim App-Start; nach einer nicht rückwärtskompatiblen Migration würde ein Rollback zusätzlich die gesicherte Datenbank benötigen. Nicht mit einem zweiten PostgreSQL-Container gleichzeitig dasselbe Datenverzeichnis öffnen.

## 1. Quellcode übertragen

Den Inhalt des lokalen Ordners `Website` mit WinSCP/SFTP beispielsweise nach `/opt/chrisg-website` übertragen. `package.json`, `package-lock.json`, `apps`, `packages`, `shared`, `scripts` und die Docker-Dateien müssen vorhanden sein.

Nicht übertragen: `node_modules`, `dist`, `.angular`, `.next`, `.migration-backup`, lokale `.env`-Dateien und `data`. Die lokale Windows-Datenbank und lokale Secrets nicht über bestehende Serverdaten kopieren. Soll eine lokale Installation samt Inhalten umziehen, PostgreSQL per Dump/Restore migrieren und die Upload-Dateien separat übertragen; das ist ein zusätzlicher Schritt.

## 2. Image auf dem Server bauen

Per SSH auf dem Docker-Host:

```sh
cd /opt/chrisg-website
docker build -f apps/web/Dockerfile -t chrisg-website:2026-10-24 .
docker network inspect npm_local
```

Das Build-Verzeichnis an den tatsächlichen Upload-Pfad anpassen. Falls `npm_local` fehlt, prüfen, an welchem Netz Nginx Proxy Manager hängt; beide müssen ein gemeinsames Netz verwenden. Nur bei einer neuen passenden Einrichtung das Netz mit `docker network create npm_local` anlegen und NPM daran anschließen.

Nur bei einer frischen Installation die Datenverzeichnisse vorbereiten:

```sh
mkdir -p /opt/chrisg-website/data/files /opt/chrisg-website/data/postgres
openssl rand -hex 32
openssl rand -hex 32
```

Die beiden unterschiedlichen Werte lokal als Datenbankpasswort und SESSION_SECRET verwenden. Bei vorhandenen Daten diese Erzeugung nicht als Passwortwechsel verstehen; die bisherigen Werte weiterverwenden.

## 3. Portainer-Stack anlegen oder bestehenden Stack aktualisieren

In der richtigen Docker-Umgebung unter **Stacks → Add stack** einen Stack `chrisg-website` anlegen. Eine vorhandene Installation im bisherigen Stack aktualisieren; keinen parallel laufenden Datenbank-Stack mit demselben Datenpfad erzeugen.

`docker-compose.portainer.yml` im Webeditor einfügen oder als Compose-Datei hochladen. Unter **Environment variables** die Werte aus `portainer.env.example` eintragen:

- `WEBSITE_IMAGE`: `chrisg-website:2026-10-24`
- `SITE_DATA_DIR`: tatsächlicher absoluter Datenpfad auf dem Docker-Host
- `POSTGRES_PASSWORD`: tatsächliches Datenbankpasswort (für neue Installationen vorzugsweise Hex-Zeichen)
- `SESSION_SECRET`: vorhandenes Secret oder bei einer frischen Installation ein neuer zufälliger Wert
- `PUBLIC_BASE_URL`: `https://chris-g.dev`
- `DISCORD_BOT_TOKEN`: vorhandener Bot-Token, ausschließlich als Umgebungsvariable
- `DISCORD_LOG_CHANNEL_ID`: `1563468783497125990`
- `TRUST_PROXY`: `1` für einen vorgeschalteten Reverse Proxy; bei anderen Proxy-Ketten passend konfigurieren

Keine Platzhalter aus der Beispieldatei stehen lassen. Bei einem rein lokalen Image keinen erneuten Pull aus einer Registry erzwingen. **Deploy the stack** wählen. Bei Swarm stattdessen ein Image über eine Registry bereitstellen und die Stack-Datei für Swarm anpassen; diese Datei ist für Docker Standalone ausgelegt.

## 4. Nginx Proxy Manager

Proxy Host für `chris-g.dev`:

- Scheme: `http`
- Forward Hostname/IP: `chrisg-website`
- Forward Port: `3000`
- Gemeinsames Docker-Netz: `npm_local`
- SSL-Zertifikat für die Domain auswählen/anfordern, anschließend HTTPS erzwingen.

Der Stack veröffentlicht keine Host-Ports. App und Datenbank sind über Docker-Netze erreichbar; NPM stellt den öffentlichen Zugang bereit. Bei Cloudflare muss die Proxy-Kette die echten Client-IPs korrekt weitergeben, damit die erweiterten Logs die Besucher-IP zeigen.

## 5. Prüfen

In Portainer muss `db` gesund sein. In den `app`-Logs sollten die Prisma-Migrationen erfolgreich durchlaufen und anschließend die API starten. Bei einer leeren neuen Datenbank den Admin unter `https://chris-g.dev/setup` anlegen und das Portfolio konfigurieren. Ohne Seed oder vorhandenen Datensatz ist zunächst noch kein persönliches Portfolio gespeichert.

Bei einem Update vorhandenen Login, Portfolio, Uploads und Kurzlinks prüfen. Unter **Admin → Logs** eine Discord-Testnachricht senden. Die Website läuft als Produktionscontainer; `npm run dev` und eine Node-Installation auf dem Host sind nicht erforderlich.

## Spätere Updates

Neue Quellen übertragen, ein neues versioniertes Image bauen, `WEBSITE_IMAGE` im bestehenden Portainer-Stack auf diesen Tag ändern und neu deployen. Datenpfad und Secrets unverändert übernehmen. Die hier vorbereiteten Dateien wurden lokal geprüft; auf dem Server wurde durch ihre Erstellung nichts veröffentlicht.

### Discord im Produktionscontainer prüfen

Bei „Discord ist momentan nicht erreichbar“ zuerst im **App-Container** (nicht im DB- oder Portainer-Container) prüfen:

```sh
node -e 'const t=process.env.DISCORD_BOT_TOKEN||""; console.log("Token gesetzt:",!!t,"Rand-Leerzeichen:",t!==t.trim()); fetch("https://discord.com/api/v10/users/@me",{headers:{Authorization:"Bot "+t.trim()},signal:AbortSignal.timeout(10000)}).then(r=>console.log("Discord HTTP:",r.status)).catch(e=>console.log("Verbindungsfehler:",e.name,e.cause?.code||e.code||"unbekannt"))'
```

Der Test zeigt weder Token noch Profildaten. HTTP 200 bestätigt Erreichbarkeit und Bot-Authentifizierung; 401 deutet auf ungültige/fehlende Authentifizierung, 403 auf verweigerten Zugriff und 429 auf eine Anfragelimitierung. ENOTFOUND/EAI_AGAIN betreffen DNS, Timeouts/ENETUNREACH die Verbindung und CERT-/TLS-Codes die Zertifikatsprüfung. Die aktuelle Codeversion unterscheidet diese Fälle direkt in der Fehlermeldung. Änderungen am lokalen Quellcode benötigen einen neuen Image-Build und ein Redeployment, bevor der Live-Container sie verwendet.

In neu gebauten Images kann alternativ `node apps/api/src/discord-check.mjs` ausgeführt werden. Der App-Container benötigt ausgehendes HTTPS und funktionierendes DNS. Das Datenbanknetz darf intern bleiben; die App muss zusätzlich ein nicht internes Netz für ausgehende Verbindungen nutzen. Zertifikatsprüfung nicht abschalten. Änderungen an Portainer-Stack-Variablen erst im aktualisierten/redeployten App-Container prüfen; reine Stack-Einträge belegen nicht, welche Werte ein alter laufender Container verwendet.

### Fehlende Default-Route: EAI_AGAIN und Network unreachable

Wenn `ip route` im App-Container nur direkt angeschlossene Docker-Netze, aber keine `default via ...`-Zeile zeigt und selbst `nslookup discord.com 1.1.1.1` mit „Network unreachable“ endet, fehlt der App der ausgehende Netzwerkpfad. Eine DNS-Server-Änderung allein beseitigt diese fehlende Route nicht.

Die Stack-Dateien verbinden deshalb nur die App zusätzlich mit einem eigenen `egress`-Netz (`driver: bridge`, `internal: false`). Das interne Datenbanknetz sowie das bestehende gemeinsame NPM-Netz bleiben unverändert. Portainers `external: true` bedeutet lediglich, dass ein Netz außerhalb dieses Stacks verwaltet wird; es garantiert keinen Internetzugang.

Im bestehenden Portainer-Stack die folgende Ergänzung mit den vorhandenen Netzen zusammenführen:

```yaml
services:
  app:
    networks:
      backend:
      npm_local:
        aliases:
          - chrisg-website
      egress:

networks:
  backend:
    internal: true
  npm_local:
    external: true
  egress:
    driver: bridge
    internal: false
```

Der Ausschnitt ist keine vollständige Stack-Datei. Bestehende Umgebungsvariablen, Images und Daten-Mounts beibehalten. Anschließend **Update the stack** ausführen, damit der App-Container das zusätzliche Netz erhält. Kein Image-Neubau und kein globaler Docker-Neustart sind dafür erforderlich. Die Website kann bei der Neuerstellung kurz nicht erreichbar sein. Rücknahme: die `egress`-Verbindung der App und die zugehörige Netzdefinition entfernen und den Stack erneut aktualisieren.

Im neu erstellten App-Container prüfen:

```sh
ip route
nslookup discord.com
node -e 'fetch("https://discord.com/api/v10/users/@me",{headers:{Authorization:"Bot "+(process.env.DISCORD_BOT_TOKEN||"").trim()},signal:AbortSignal.timeout(10000)}).then(r=>console.log("Discord HTTP:",r.status)).catch(e=>console.log(e.name,e.cause?.code||e.code||"unbekannt"))'
```

Erwartet werden eine Default-Route, eine erfolgreiche DNS-Auflösung und HTTP 200 bei gültigem Token. Sollte trotz neuer Default-Route die Verbindung weiterhin scheitern, mit der neuen Fehlermeldung anschließend DNS, Host-Firewall oder Provider-Netz prüfen. Die Diagnose und Stack-Korrektur sind lokal vorbereitet; die erfolgreiche Wiederherstellung auf dem Server muss mit diesen Ausgaben bestätigt werden.
