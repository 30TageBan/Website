# GitHub → Container Registry → Portainer

## Repository vorbereiten

Den **Inhalt von `Website` als Wurzel eines eigenen GitHub-Repositories** hochladen.
`package.json`, `.github` und `docker-compose.portainer.yml` müssen direkt in der
Repository-Wurzel liegen. Der vorbereitete Workflow verwendet den Branch `main`.
Die anderen Projekte neben `Website` gehören nicht in dieses Repository.

```powershell
cd D:\Projekte\Chris-G.dev\Website
git init -b main
git add .
git status --short
git diff --cached --stat
git commit -m "Prepare website and automated container deployment"
git remote add origin https://github.com/DEIN-NAME/DEIN-REPOSITORY.git
git push -u origin main
```

Vor dem Commit prüfen: keine lokalen `.env`-Dateien, Daten, Uploads, Backups oder
Schlüssel im Index. `.env.example` und `portainer.env.example` enthalten nur
Beispiele und gehören ins Repository. `.gitignore` entfernt keine Dateien aus
einer bereits vorhandenen Git-Historie. Bereits veröffentlichte Zugangsdaten
müssen ersetzt werden; den früher im Chat geteilten Discord-Token ebenfalls
ersetzen, falls das noch nicht geschehen ist.

## Image automatisch bauen

GitHub Actions prüft bei Pull Requests Formatierung, Typen, Tests und Build.
Nach erfolgreichen Prüfungen auf `main` veröffentlicht der Workflow ein
Linux/AMD64-Image als:

```text
ghcr.io/dein-name/dein-repository:latest
ghcr.io/dein-name/dein-repository:sha-VOLLSTAENDIGE-COMMIT-ID
```

Namen sind kleingeschrieben. GitHub stellt `GITHUB_TOKEN` automatisch bereit;
keine Website-Secrets in den Workflow eintragen. Actions muss im Repository
aktiviert sein. Zuerst den erfolgreichen Lauf abwarten. Für ARM-Server muss die
Build-Plattform zuvor angepasst und geprüft werden.

Das GHCR-Paket kann öffentlich bereitgestellt werden. Bei einem privaten Paket
in Portainer eine Registry `ghcr.io` mit GitHub-Benutzername und einem Token mit
`read:packages` sowie Zugriff auf das Paket hinterlegen. Repository-Zugriff und
Registry-Zugriff sind getrennte Zugangsdaten.

## Stack aus Git in Portainer

Für Docker Standalone: **Stacks → Add stack → Repository**, Repository-URL,
Referenz `refs/heads/main`, Compose path `docker-compose.portainer.yml`.
Bei privaten Repositories zusätzlich die Git-Authentifizierung konfigurieren.
`WEBSITE_IMAGE` auf `ghcr.io/dein-name/dein-repository:latest` setzen. Alle
weiteren Variablen aus `portainer.env.example` in Portainer eintragen; echte
Secrets ausschließlich dort hinterlegen. Der Stack benötigt das vorhandene
NPM-Netz `npm_local`; der Proxy zeigt auf `chrisg-website:3000`.

Bei der bestehenden Installation zuerst die Hinweise in
[DEPLOY-PORTAINER.md](DEPLOY-PORTAINER.md) befolgen: Datenbank und Dateien sichern,
gleichen Stack, dieselben Mounts, Datenpfade, Zugangsdaten und dasselbe
`SESSION_SECRET` beibehalten. Keinen zweiten Stack mit demselben PostgreSQL-Pfad
parallel starten. Falls Portainer den vorhandenen Editor-Stack nicht auf Git
umstellen kann, zunächst dessen bestehende Compose-Datei weiterverwenden und
nur `WEBSITE_IMAGE` ändern; eine spätere Umstellung separat planen.

## Updates nach erfolgreichem Build

Beim Git-Stack **GitOps updates → Webhook** und **Re-pull image** aktivieren.
Die Webhook-URL unter GitHub **Settings → Secrets and variables → Actions** als
Repository-Secret `PORTAINER_WEBHOOK_URL` hinterlegen. Der Workflow ruft diese
URL erst nach erfolgreichem Image-Push auf. Sie muss vom GitHub-Runner per HTTPS
erreichbar sein; die URL wie ein Passwort behandeln. Fehlt das Secret, wird nur
das Image veröffentlicht und das Deployment bleibt manuell.

Polling nicht zusätzlich aktivieren: Es könnte den Quellcode-Commit erkennen,
bevor dessen neues Image fertig ist. Falls deine Portainer-Version keine
GitOps-Webhooks anbietet, nach erfolgreichem Build **Pull and redeploy** mit
erneutem Image-Pull verwenden. Ein erfolgreicher Webhook-Aufruf bestätigt die
Annahme des Updates; anschließend Containerstatus, Migrationslogs und Website
in Portainer prüfen.

Für einen Rollback `WEBSITE_IMAGE` auf einen früheren `sha-...`-Tag setzen und
neu deployen. Datenbankmigrationen können zusätzlich ein Restore der Sicherung
erfordern. Der Workflow veröffentlicht Images; er richtet Portainer oder das
GitHub-Repository nicht selbst ein.

Referenz: [Portainer: Stack aus Repository und GitOps-Updates](https://docs.portainer.io/user/docker/stacks/add).
