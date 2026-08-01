# Software Factory — Anforderungen (GitHub Action)

> Stand: 2026-08-01 | Diskutiert & verabschiedet mit dem Auftraggeber.

## 1. Laufzeitumgebung

- **Docker-Container** als Ausführungsumgebung.
- **Node-RED** bleibt Runtime für die Pipeline-Orchestrierung.
- **`pi` CLI (Oh My Pi)** wird ins Image gebacken und von `ralph-run-agent` per `spawn()` aufgerufen.
- LLM-API-Key wird als GitHub Secret (`LLM_API_KEY`) in den Container gereicht.
- Der Container läuft autark; kein externer Agent-Service nötig.

## 2. Task-Quellen

| Quelle | Priorität | Mechanismus |
|--------|-----------|-------------|
| GitHub Issues | Primär | Issues mit Label `ralph:task`, Body = Task-Prompt |
| `docs/tickets.md` | Fallback | Frontier-Ticket-Parsing wie bisher (wenn keine Issues gelabelt) |

**Blocking:** `**Blocked by:** #N` im Issue-Body blockiert Ausführung bis #N geschlossen ist.

## 3. Betriebsmodell

- **Ein Task pro Action-Run (One-Shot).**
- **Sequentiell** — kein paralleler Dispatch mehrerer Runs, um Merge-Konflikte auf dem Shared-Branch zu vermeiden.
- Ablauf pro Run:
  1. Task-Discovery (nächstes offenes Issue oder Frontier-Ticket)
  2. Pipeline (Plan → Build → Review → Fix)
  3. Commit auf Batch-Branch
  4. Noch Tasks offen? → `repository_dispatch` für nächsten Run
  5. Keine Tasks mehr? → PR erstellen

## 4. Branch-Strategie

- Batch-Branch: `ralph/<batch-id>` (z. B. `ralph/batch-42`)
- Basis-Branch (`main`) konfigurierbar via `target_branch`
- Ohne Batch-Label: `ralph/single-<ticket-id>`
- Am Ende: automatischer PR vom Batch-Branch in den Basis-Branch

## 5. Pipeline pro Task

```
Planner → Builder → Reviewer → (Fixer → Re-Review) → Verify
```

- `max_iterations` regelt die **Fixer-Retries** (nicht die Ticket-Anzahl)
- Default `1`: Planner → Builder → Reviewer → Ende
- Bei `NEEDS_WORK`: bis zu `max_iterations`-mal Fixer + Re-Review
- Am Ende: `verify_command` (Build + Test), bei Fehlschlag `ralph-ci-fixer` + Re-Verify

## 6. Termination

- Die Kette terminiert, sobald `finde nächsten Task` nichts mehr findet.
- Kein Coordinator-Job, kein Polling — jeder Run entscheidet selbst, ob er der letzte ist.
- Letzter Run erstellt den PR und beendet den Batch.

## 7. HTTP-Endpoints (Node-RED)

### `POST /ralph/start`
```json
{
  "task": "direkter Prompt-Text (optional, überspringt tickets.md)",
  "ticketId": "42",
  "loops": 1,
  "repoRoot": "/path/to/repo",
  "verifyCommand": "pnpm build && pnpm test"
}
```
→ `202 Accepted`

### `GET /ralph/status`
```json
{
  "running": false,
  "result": { "reason": "...", "completedTickets": 1, "durationSec": 120 },
  "timestamp": "2026-08-01T18:00:00Z"
}
```

## 8. Action-Parameter

| Parameter | Default | Beschreibung |
|-----------|---------|-------------|
| `task_source` | `issues` | `issues` oder `markdown` |
| `issue_label` | `ralph:task` | Label für Task-Issues |
| `batch_label` | — | Optional: `ralph:batch-<id>` für Multi-Task-Branch |
| `task_issue_number` | — | Spezifisches Issue (überspringt Discovery) |
| `tickets_path` | `docs/tickets.md` | Pfad für Markdown-Source |
| `max_iterations` | `1` | Fixer-Retries pro Ticket |
| `target_branch` | `main` | Basis-Branch für PR |
| `verify_command` | `pnpm build && pnpm test` | Shell-Kommando nach Builder |

## 9. Explizit nicht enthalten (YAGNI)

- **Parallele Task-Ausführung** — Race-Conditions auf Shared-Branch.
- **Meta-Agenten (Refactor/Improve)** — nur bei Multi-Task-Läufen im bestehenden Dashboard-Mode sinnvoll.
- **Coordinator-Job** — sequentielle Selbst-Dispatch-Kette braucht keinen Extra-Prozess.
- **Dashboard-UIs** — im CI-Mode nicht benötigt, aber der Node-RED-Editor ist weiterhin erreichbar (Port 1880).

## 10. Offene Punkte

- [ ] `pi` CLI im Dockerfile installieren (Platzhalter in Zeile `# >>> PLACEHOLDER <<<`)
- [ ] `LLM_API_KEY` als GitHub Secret im Ziel-Repo hinterlegen
- [ ] Issues mit `ralph:task` labeln (und optional `ralph:batch-<id>`)