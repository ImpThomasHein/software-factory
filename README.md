# Software Factory — Ralph Loop (Node-RED)

Node-RED-basierte Pipeline-Orchestrierung für den Ralph Loop: Plant → Build →
Review → Fixer-Retries → Verify. Läuft lokal als Dashboard **und** als
GitHub Action in CI.

## Schnellstart (GitHub Action)

1. **`npm run init`** kopiert alle Action-Dateien ins Zielprojekt:
   ```bash
   npm run init -- --repo C:/pfad/zum/projekt
   ```
   Erstellt `action.yml`, `Dockerfile`, `entrypoint.sh`, `.dockerignore`,
   `.github/workflows/software-factory.yml` sowie den `factory/`-Ordner mit
   der Node-RED-Runtime.

2. **Issue labeln:** `ralph:task` auf ein GitHub Issue → Pipeline startet
   automatisch (via `issues: [labeled]` Trigger). Optional: `ralph:batch-<id>`
   für Multi-Ticket-Branches.

3. **Manuell triggern:** `Actions → Software Factory → Run workflow` mit
   Parametern wie `max_iterations`, `task_source`, `batch_label`.

4. **Self-hosted Runner:** Container `myoung34/github-runner` mit
   Docker-Socket-Zugriff. Registriert pro Repo.

## Schnellstart (lokal / Dashboard)

Voraussetzung: `pi` CLI im PATH, `git`, Node 18+.

1. **Installieren**
   ```bash
   cd ralph-node-red
   npm install
   ```

2. **Basis-Dateien sicherstellen** (nur nötig, falls sie im Zielprojekt noch
   fehlen — bestehende Dateien werden nie überschrieben):
   ```bash
   npm run init -- --repo C:/pfad/zum/zielprojekt
   ```
   Legt `.pi/ralph-loop/system-prompt.md`, `docs/anforderungen.md`,
   `docs/glossar.md`, `docs/spec.md` sowie die benötigten Skills unter
   `.pi/skills/` an (siehe [Wiederverwendbarkeit](#wiederverwendbarkeit-in-anderen-projekten)).
   Ohne `--repo` läuft es gegen das aktuelle Verzeichnis.

3. **Tickets bereitstellen:** `docs/tickets.md` muss im Zielprojekt existieren
   und mindestens ein Ticket mit Akzeptanzkriterien als Checkliste (`- [ ]`)
   enthalten. Noch keine Tickets? Nutze die Skills `grilling`/`grill-with-docs`
   → `to-spec` → `to-tickets`, um von einer Idee zu fertigen Tickets zu kommen
   (siehe [Skills](#skills)).

4. **Node-RED starten**
   ```bash
   npm start
   # oder mit anderem Port:
   PORT=1880 npm start
   ```
   Editor: http://localhost:1880/ — Dashboard: http://localhost:1880/ui/

5. **Loop auslösen** — über das Dashboard oder per HTTP, siehe
   [Loop auslösen](#loop-auslösen).

6. **Fortschritt beobachten:** Live-Stream im Dashboard-Tab "Ralph Loop"
   sowie in `.pi/ralph-loop/progress.md` und `.pi/ralph-loop/logs/` des
   Zielprojekts (siehe [Was der Flow tut](#was-der-flow-tut-pro-iteration)).

7. **Stoppen:** "Stop Loop"-Button im Dashboard bricht den laufenden
   Subagenten hart ab und beendet den Loop nach der aktuellen Iteration.

## Architektur

```
software-factory/
  lib/            reine Logik, 1:1 aus .pi/extensions/ralph-loop portiert
                  (tickets, verdict, progress, discovery, tasks, spawn, git, ...)
  nodes/          Custom Nodes für Node-RED:
                  - ralph-run-agent        spawnt `pi --mode json -p --no-session`
                  - ralph-discover-agents  liest .pi/agents/ralph-*.md ein
                  - ralph-run-verify       führt verify_command aus
  flows.json      Orchestrierungs-Flow (Tabs: Loop, Start, Meta, Telemetry, Finish)
  settings.js     Node-RED Runtime-Settings
  templates/      Basis-Dateien für `npm run init`:
                  - github-action/  → .github/workflows/, action.yml, Dockerfile
                  - agents/         → .pi/agents/ralph-*.md
                  - skills/         → .pi/skills/
                  - system-prompt.md, anforderungen.md, glossar.md, spec.md
  bin/init.js     Scaffolding-Skript (`npm run init`) — kopiert Templates + factory/
  test/           node:test — Unit-Tests für die reine Logik in lib/
```

Im Zielprojekt nach `npm run init`:
- `action.yml`, `Dockerfile`, `entrypoint.sh`, `.dockerignore` im Root
- `.github/workflows/software-factory.yml`
- `factory/`-Ordner mit Node-RED Runtime (flows.json, settings.js, lib/, nodes/, templates/, package.json)

## Verify-Task & ralph-ci-fixer (Loop-Ende)

Nach der letzten Iteration (bzw. sobald kein Frontier-Ticket mehr offen ist
oder gestoppt wurde) führt die Pipeline einmalig einen konfigurierbaren
Verify-Task aus — Default: `pnpm build && pnpm test`, identisch zu den
Build/Test-Schritten aus `.github/workflows/ci.yml`. Der `ralph-run-verify`-
Node führt das Kommando per Shell aus und meldet Erfolg/Fehlschlag +
Ausgabe.

Schlägt der Verify-Task fehl, startet automatisch der neue Subagent
`ralph-ci-fixer` (`.pi/agents/ralph-ci-fixer.md`) mit der Fehlerausgabe als
Task, danach wird der Verify-Task erneut ausgeführt. Das wiederholt sich,
bis er erfolgreich ist oder ein Sicherheits-Limit erreicht wird (Default: 5
Versuche, `RALPH_VERIFY_MAX_ATTEMPTS`-Env-Var). Das Endergebnis
(erfolgreich/fehlgeschlagen, Anzahl Versuche) erscheint im Dashboard-Feld
"Loop-Ergebnis" und in einer ntfy-Benachrichtigung.

**Konfigurierbar:**
- Pro Lauf über das Dashboard-Formular "Start Ralph Loop" (Feld
  "Verify-Kommando (Build/Test)", leer = Default) bzw. `verifyCommand` im
  HTTP-Body von `/ralph/start`.
- Global über die Env-Variablen `RALPH_VERIFY_COMMAND` und
  `RALPH_VERIFY_MAX_ATTEMPTS` (siehe `settings.js`).

## Wiederverwendbarkeit in anderen Projekten

`ralph-node-red` ist bewusst projektunabhängig gehalten, ähnlich wie
`.pi/extensions` generische Defaults mitliefert. Dafür gibt es
`templates/`:

| Datei | Zweck |
|-------|-------|
| `templates/github-action/*` | GitHub Action: `action.yml`, `Dockerfile`, `entrypoint.sh`, `.dockerignore`, `.github/workflows/software-factory.yml` — für CI-Pipeline. |
| `templates/system-prompt.md` | Generischer Shared-Prompt, der allen Subagenten vorangestellt wird. |
| `templates/anforderungen.md` | Basis-Vorlage für `docs/anforderungen.md`. |
| `templates/glossar.md` | Basis-Vorlage für `docs/glossar.md`. |
| `templates/spec.md` | Basis-Vorlage für `docs/spec.md`. |
| `templates/agents/ralph-*.md` | Die acht Standard-Subagenten (planner/builder/reviewer/fixer/refactor/improver/summary/ci-fixer). |

**Fallback-Verhalten:** `lib/tasks.js#loadSharedPrompt` lädt zuerst die
projekteigene `.pi/ralph-loop/system-prompt.md`; existiert sie nicht oder ist
leer, wird automatisch `templates/system-prompt.md` verwendet. So läuft die
Pipeline auch in einem frischen Repo ohne weitere Konfiguration.
**Neues Projekt aufsetzen:** `npm run init [-- --repo <pfad>]` kopiert die
Basis-Dateien ins Zielprojekt:
- `.github/` — GitHub Action für CI (Workflow + Docker-Image)
- `action.yml`, `Dockerfile`, `entrypoint.sh`, `.dockerignore` im Root
- `factory/` — Node-RED Runtime (flows.json, settings.js, lib/, nodes/, templates/)
- `.pi/ralph-loop/system-prompt.md`, `docs/` (Anforderungen, Glossar, Spec)
- `.pi/skills/`, `.pi/agents/ralph-*.md`
werden nie überschrieben — das Skript füllt nur, was fehlt.

### Agenten

`templates/agents/` enthält die vollständigen Definitionen aller acht
Standard-Subagenten (Frontmatter + System-Prompt), identisch zu denen unter
`.pi/agents/` in diesem Repo. `npm run init` kopiert sie nach `.pi/agents/`
des Zielprojekts, sofern dort noch keine gleichnamige Datei existiert — so
funktioniert die Pipeline (inkl. `discover_agents`/`assertRequiredAgents`)
in einem frischen Projekt sofort, ohne Agenten von Hand anzulegen. Ein
Projekt kann einzelne Agenten überschreiben, indem es einfach seine eigene
`.pi/agents/ralph-<name>.md` anlegt, bevor `npm run init` läuft (oder danach
manuell anpasst) — `npm run init` fasst diese Datei dann nicht mehr an.
Ein neuer Agent wird verfügbar, sobald seine `.md`-Datei unter
`templates/agents/` liegt — `bin/init.js` liest das Verzeichnis dynamisch
aus, kein Code-Änderung nötig.

### Skills

`templates/skills/` enthält die Skills, auf die sich die Ralph-Loop-Agenten in
ihren System-Prompts per Namen berufen (z.B. "Nutze den Skill
test-driven-development"). `npm run init` kopiert sie nach `.pi/skills/` des
Zielprojekts, sofern dort noch nicht vorhanden:

| Skill | Verwendet von |
|-------|---------------|
| `writing-plans` | ralph-planner |
| `test-driven-development` | ralph-planner, ralph-builder |
| `executing-plans` | ralph-builder |
| `code-review` | ralph-reviewer, `/code-review`-Skill |
| `to-spec` | Spec-Erstellung aus einer Konversation/einem Plan |
| `to-tickets` | Zerlegung eines Specs/Plans in `docs/tickets.md` |
| `grilling` | Interaktives Nachfragen zum Schärfen einer Idee/Anforderung |
| `grill-with-docs` | Wie `grilling`, erzeugt zusätzlich ADRs/Glossar (`domain-modeling`) |
| `domain-modeling` | Abhängigkeit von `grill-with-docs` (ADR-/Glossar-Format) |

So sind alle für die Pipeline nötigen Skills auch in einem frischen Projekt
sofort vorhanden, ohne von global installierten User-Skills abzuhängen.

## Setup

```bash
cd packages/ralph-node-red
npm install
```

Voraussetzung: `pi` CLI im PATH (wird von `ralph-run-agent` per `spawn()`
aufgerufen), `git`, Node 18+. Siehe [Schnellstart](#schnellstart) für den
kompletten Ablauf inkl. `npm run init`.

## Starten

```bash
npm start
# oder mit anderem Port:
PORT=1880 npm start
```

Editor: http://localhost:1880/ — Dashboard: http://localhost:1880/ui/

## Loop auslösen

**Dashboard:** Tab "Ralph Loop" → Formular "Start Ralph Loop" → Iterationen
eingeben (Repo-Pfad optional, Default ist das Monorepo-Root) → Start.
"Stop Loop" bricht den aktuell laufenden Subagenten-Prozess hart ab
(SIGTERM → SIGKILL nach 5s) und stoppt den Loop nach der laufenden Iteration.

**HTTP:**
```bash
curl -X POST http://localhost:1880/ralph/start \
  -H "Content-Type: application/json" \
  -d '{"loops": 3, "repoRoot": "C:/projects/schreib-magie", "verifyCommand": "pnpm build && pnpm test"}'
```
`repoRoot` und `verifyCommand` sind optional (Defaults: Monorepo-Root bzw.
`pnpm build && pnpm test`, siehe [Verify-Task & ralph-ci-fixer](#verify-task--ralph-ci-fixer-loop-ende)).
Antwort ist `202 Accepted` sofort; der Loop läuft danach asynchron
weiter und schreibt in `.pi/ralph-loop/` des Ziel-Repos — exakt wie die
TUI-Extension.

## Was der Flow tut (pro Iteration)

1. `docs/tickets.md` lesen, Frontier-Ticket suchen (niedrigste ID, alle
   Blocker erledigt).
2. `ralph-planner` → `ralph-builder` → `ralph-reviewer` als frische `pi`-
   Prozesse, in dieser Reihenfolge.
3. Verdict aus dem Reviewer-Output parsen. Bei `NEEDS_WORK`: bis zu 2x
   `ralph-fixer` + Re-Review.
4. Bei `READY`: Checkbox(en) des Tickets in `docs/tickets.md` auf `[x]`.
5. Progress-Eintrag in `.pi/ralph-loop/progress.md` anhängen, geänderte
   Dateien per `git status --porcelain` erfassen, ntfy-Benachrichtigung
   senden. (Agenten-Logs unter `.pi/ralph-loop/logs/` werden bereits direkt
   nach jedem Subagenten-Prozess geschrieben, siehe [Debugging](#debugging).)
6. Alle 5 Iterationen: `ralph-refactor` (falls Dateien geändert wurden) und
   `ralph-improver` (schreibt nach `.pi/ralph-loop/improvements.md`).
7. Nächste Iteration oder Abbruch (kein Frontier-Ticket mehr / Iterationen
   erreicht / Stop-Button).
8. **Einmalig am Ende der gesamten Loop:** Verify-Task ausführen; bei
   Fehlschlag `ralph-ci-fixer` + erneuter Verify-Task, bis erfolgreich oder
   Attempt-Limit erreicht (siehe [Verify-Task & ralph-ci-fixer](#verify-task--ralph-ci-fixer-loop-ende)).


Live-Fortschritt (aktueller Agent, Ticket, letzte Ausgabe) läuft über den
zweiten Output jedes `ralph-run-agent`-Nodes ins Dashboard-Template
"Live Agent Stream" sowie in die Node-Status-Zeilen im Editor.

Im Dashboard-Bereich "Status" zeigt der Indikator **"Prozess-Status"** an, ob
der Loop gerade läuft (grüner Punkt, "Läuft"), ein Stopp angefordert wurde
(gelber Punkt, "Wird gestoppt…") oder er beendet ist (grauer Punkt,
"Gestoppt"). Die Anzeige pollt alle 2 Sekunden den globalen Kontext
(`ralphLoopRunning` / `ralphStopRequested`), der beim Start (`init loop
state`), beim Stop-Button (`request stop`) sowie beim regulären/fehlerhaften
Ende (`loop finished summary` / `finalize error`) gesetzt wird.

## Debugging

Der `ralph-run-agent`-Node ist der einzige Ort, durch den **jeder** Subagenten-
Prozess läuft (Planner, Builder, Reviewer, Fixer, Refactorer, Improver oder ein
eigener `ralph-*.md`-Agent) — deshalb protokolliert genau dieser Node für jeden
ausgeführten Prompt/Agenten/Prozess einheitlich:

1. **Node-RED-Log (Konsole/`npm start`-Output):** je eine Zeile beim Start
   (`[ralph-debug] start <agent> iter=... model=... tools=... cwd=... promptChars=...`)
   und beim Ende (`[ralph-debug] end <agent> iter=... exit=... stop=... durationMs=...
   turns=... in=... out=... cost=...`) jedes Laufs.
2. **`<repo>/.pi/ralph-loop/logs/iter-NN-<ticket>-<agent>.md`** — vollständiges
   Transkript (alle Assistant-/Tool-Nachrichten + finaler Output) je Prozess,
   jetzt für **alle** Agenten geschrieben, nicht nur Planner/Builder/Reviewer.
3. **`<repo>/.pi/ralph-loop/logs/debug.jsonl`** — eine JSON-Zeile pro
   ausgeführtem Prozess mit vollständigem Prompt (`task`), aufgelöster
   Agent-Konfiguration (`model`, `tools`), dem exakt gespawnten Kommando
   (`command`, `args`), `exitCode`, `stopReason`, `durationMs`, Token-`usage`
   und einer Vorschau des finalen Outputs. Ideal zum Grep/Filtern, z.B.:
   ```bash
   cat .pi/ralph-loop/logs/debug.jsonl | jq 'select(.agent=="ralph-builder")'
   ```

Diese Logs werden **sofort nach jedem einzelnen Prozess** geschrieben (nicht
erst am Ende der Iteration), sodass auch bei einem Absturz mitten in der
Iteration nichts verloren geht.

### Garantie: jeder Agent schreibt eine Zusammenfassung

Damit für **jede Iteration und jeden Agenten** nachvollziehbar bleibt, was
getan wurde, greifen zwei Mechanismen ineinander:

1. **Prompt-Ebene** (`lib/tasks.js`): Jede Task, die direkt nach
   `load frontier ticket` gebaut wird (`plannerTask`, `builderTask`,
   `reviewerTask`, `buildFixerTask`, `refactorTask`, `improveTask`), bekommt
   automatisch eine angehängte Anweisung: die Antwort **muss** mit einer
   eigenen `## Summary`-Sektion (3–5 Sätze: was wurde getan, welche Dateien
   geändert, welche Entscheidungen getroffen) enden.
2. **Code-Ebene** (`nodes/ralph-run-agent.js`, `lib/tasks.js#ensureSummarySection`):
   Nach jedem erfolgreichen Lauf wird der finale Output geprüft
   (`hasSummarySection`). Fehlt die `## Summary`-Sektion trotz Anweisung,
   ergänzt der Node automatisch einen Fallback-Eintrag (mit Hinweis "automatisch
   ergänzt" + den letzten Ausgabezeilen) und loggt eine Warnung
   (`[ralph-debug] ... lieferte keine "## Summary"-Sektion — Fallback ergänzt`).

Damit landet in jedem Agenten-Transkript (`logs/iter-*.md`) und im
`debug.jsonl` **immer** eine Zusammenfassung — entweder vom Agenten selbst
oder als garantierter Fallback. Zusätzlich schreibt `finalize_iteration`
unabhängig davon deterministisch (nicht LLM-abhängig) einen Eintrag pro
Iteration in `.pi/ralph-loop/progress.md`.

## Eigene Agenten hinzufügen

Neue `ralph-*.md`-Datei unter `.pi/agents/` anlegen (gleiches Frontmatter-
Format wie bestehende: `name`, `description`, `tools`, optional `model`),
dann im Flow einen weiteren `ralph-run-agent`-Node mit diesem `agentName`
einfügen und verdrahten — kein Code nötig.

## Tests

```bash
npm test
```
Deckt die reine Logik in `lib/` ab (Ticket-Parsing/Frontier/Done-Marking,
Verdict-Parsing, Progress-Formatierung) plus einen Regressionstest für
`runAgent` (stellt sicher, dass `finalOutput` aus dem letzten
`message_end`-Event befüllt wird).
