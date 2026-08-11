# Software Factory — Setup Guide für AI-Agenten

> Schritt-für-Schritt-Anleitung, um die Ralph-Loop-Pipeline in einem neuen Projekt einzurichten.
> Ziel: `gh workflow run` → Ticket wird verarbeitet, Checkboxen gehäkelt, Änderungen gepusht.

## 1. Basis-Check: Was das Projekt braucht

- [ ] `docs/tickets.md` mit mindestens einem Ticket (`## 1. Title`, `**Blocked by:**`, `- [ ]` Checklist)
- [ ] `CLAUDE.md` oder `.pi/ralph-loop/system-prompt.md` mit Projekt-Konventionen
- [ ] `docs/spec.md` — technische Spec (optional, aber empfohlen)
- [ ] `docs/glossar.md` — Fachbegriffe (optional)

## 2. Software Factory ins Projekt holen

```bash
# Als Submodul
git submodule add https://github.com/ImpThomasHein/software-factory.git software-factory

# Oder: direkt auschecken
git clone https://github.com/ImpThomasHein/software-factory.git
```

```bash
# Basis-Dateien scaffolden (überschreibt keine existierenden Dateien)
cd software-factory && npm run init -- --repo /pfad/zum/projekt
```

Das legt an: `.pi/`, `docs/`, `factory/`, `action.yml`, `Dockerfile`, `entrypoint.sh`, `.github/workflows/software-factory.yml`.

## 3. Workflow anpassen

Folgende Stellen im Workflow (`.github/workflows/software-factory.yml`) projektspezifisch ändern:

| Zeile | Default | Anpassung |
|-------|---------|-----------|
| `runs-on:` | `self-hosted` | Eigenen Runner-Label setzen (z.B. `finapp`), sonst läuft der Job auf einem falschen Runner |
| `verify_command` | `pnpm build && pnpm test` | Auf Projekt-Paketmanager umstellen. In CI ohne DB: nur `npm run build` |
| `permissions:` | nicht vorhanden | `contents: write` ergänzen → **Pflicht im Private-Repo**, sonst `Write access not granted` |
| `tickets_path` | `docs/tickets.md` | Passt meistens, nur ändern wenn Tickets woanders liegen |
| DATABASE_URL (env) | nicht gesetzt | Dummy für `prisma generate`: `-e DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"` |

## 4. GitHub Runner aufsetzen

```bash
# Runner-Token holen (1h gültig)
gh api --method POST /repos/OWNER/REPO/actions/runners/registration-token --jq '.token'

# Runner starten — Volume-Mount für Workspace-Zugriff ist PFLICHT
docker run -d --name github-runner-PROJEKT \
  -e RUNNER_NAME=linuxserver-PROJEKT \
  -e RUNNER_LABELS="self-hosted,linux,x64,docker,PROJEKT" \
  -e REPO_URL=https://github.com/OWNER/REPO \
  -e RUNNER_TOKEN="<TOKEN>" \
  -e DISABLE_AUTO_UPDATE=true \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp/runner/work:/tmp/runner/work \
  myoung34/github-runner:latest
```

⚠️ **Ohne `-v /tmp/runner/work:/tmp/runner/work`** findet der Docker-Container das Workspace-Volume nicht → `docs/tickets.md not found`.

## 5. Secrets prüfen

- `LLM_API_KEY` — API-Key für den AI-Provider (OpenRouter, OpenAI, Anthropic)
- `GITHUB_TOKEN` — wird automatisch von GitHub Actions bereitgestellt

```bash
gh secret set LLM_API_KEY --repo OWNER/REPO
```

## 6. Docker-Image vorbereiten

**Option A — Pre-Built (schneller, empfohlen):**
```bash
# Image auf dem Host bauen
docker build -f Dockerfile.sf -t software-factory:latest .

# Workflow-Zeile ersetzen:
#   docker build -f Dockerfile.sf -t software-factory .
# → echo "[factory] Using pre-built software-factory:latest"
```
Bei Änderungen an `Dockerfile.sf` oder `entrypoint.sh`: Image neu bauen.

**Option B — Build im Workflow (einfacher, langsamer):**
Workflow unverändert lassen — baut bei jedem Lauf neu (~18 Min).

## 7. Ersten Lauf starten

```bash
gh workflow run software-factory.yml -R OWNER/REPO --ref main \
  -f task_source=markdown \
  -f tickets_path=docs/tickets.md \
  -f target_branch=main \
  -f verify_command="npm run build && npm test" \
  -f max_iterations=3
```

## 8. Verifikation

- [ ] `gh run watch` zeigt "Verify OK"
- [ ] `docs/tickets.md` hat `[x]` bei erledigten Checklist-Items
- [ ] `git log` zeigt Commit von "Ralph Loop"
- [ ] `.pi/ralph-loop/logs/` enthält Agent-Transkripte

## Häufige Fehler

| Symptom | Ursache | Fix |
|---------|---------|-----|
| `docs/tickets.md not found` | Volume-Mount fehlt oder Pfad falsch | Runner mit `-v /tmp/runner/work:/tmp/runner/work` starten |
| `not in a git directory` | `git config` vor `cd` | entrypoint.sh: `cd` vor `git config` (✅ gefixt) |
| `detected dubious ownership` | UID-Mismatch im Container | `git config --global --add safe.directory` (✅ gefixt) |
| `Write access not granted` beim Push | `GITHUB_TOKEN` hat kein Write im Private-Repo | `permissions: contents: write` in den Workflow (✅ gefixt) |
| Job läuft auf falschem Runner | `runs-on: self-hosted` matched alle | Eigenen Label setzen |
| Docker-Build dauert ewig | Kein Cache | Pre-Built-Image nutzen |