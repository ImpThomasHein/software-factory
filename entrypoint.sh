#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
# Software Factory — Single-Task Runner (GitHub Action)
# ──────────────────────────────────────────────────────────
# Runs inside the Docker container. One invocation = one ticket.
#
# Flow:
#   1. Start Node-RED in background, wait until ready
#   2. Discover next task (GitHub Issue or tickets.md)
#   3. POST /ralph/start with the task
#   4. Poll GET /ralph/status until loop finishes
#   5. If task done: commit changes to batch branch
#   6. If more tasks remain in batch → dispatch next run
#      Otherwise → create PR and finish
# ──────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration (env vars, action inputs) ─────────────
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
REPO="${GITHUB_REPOSITORY:-}"
TARGET_BRANCH="${INPUT_TARGET_BRANCH:-main}"
TASK_SOURCE="${INPUT_TASK_SOURCE:-issues}"
ISSUE_LABEL="${INPUT_ISSUE_LABEL:-ralph:task}"
BATCH_LABEL="${INPUT_BATCH_LABEL:-}"
MAX_ITERATIONS="${INPUT_MAX_ITERATIONS:-1}"
VERIFY_COMMAND="${INPUT_VERIFY_COMMAND:-pnpm build && pnpm test}"
TICKETS_PATH="${INPUT_TICKETS_PATH:-docs/tickets.md}"
TASK_ISSUE_NUMBER="${INPUT_TASK_ISSUE_NUMBER:-}"

# ── Resolved state ──────────────────────────────────────
TASK=""
TICKET_ID=""
ISSUE_NUMBER=""
BATCH_ID=""

# ── Logging ─────────────────────────────────────────────
log()  { echo "[factory] $(date -Iseconds) $*"; }
fail() { log "ERROR: $*"; exit 1; }

# ── Git helpers ─────────────────────────────────────────
ensure_batch_branch() {
  local batch_id="$1"
  local base="$2"
  local batch_branch="ralph/${batch_id}"
  log "Ensuring batch branch: $batch_branch"
  git fetch origin "$base" &>/dev/null || true
  if git ls-remote --heads origin "$batch_branch" | grep -q "$batch_branch"; then
    git checkout -b "$batch_branch" "origin/$batch_branch"
  else
    git checkout -b "$batch_branch" "origin/$base" || git checkout -b "$batch_branch" "$base"
  fi
}

commit_and_push() {
  local issue_num="$1"
  if git diff --quiet && git diff --cached --quiet; then
    log "No changes to commit for #${issue_num}"
    return 0
  fi
  git add -A
  git commit -m "ralph: process issue #${issue_num}

[ralph-loop] automated changes for #${issue_num}" || true
  git push origin HEAD 2>&1 | tail -3
  log "Pushed changes for #${issue_num}"
}

close_issue() {
  local issue_num="$1"
  if [ -z "$GITHUB_TOKEN" ]; then
    log "No GITHUB_TOKEN, skipping issue close for #${issue_num}"
    return 0
  fi
  gh issue close "$issue_num" -c "✅ Bearbeitet durch Ralph Loop." 2>&1 || log "Failed to close #${issue_num}"
}

dispatch_next_or_finish() {
  local batch_id="$1"
  local issue_num="$2"
  local batch_branch="ralph/${batch_id}"

  # Check remaining open issues in this batch
  local remaining
  if [ -n "$GITHUB_TOKEN" ]; then
    remaining=$(gh issue list \
      --label "$ISSUE_LABEL" \
      --label "$BATCH_LABEL" \
      --state open \
      --json number \
      --jq 'length' 2>/dev/null || echo "0")
  else
    remaining="0"
  fi

  if [ "$remaining" -gt 0 ]; then
    log "Batch $batch_id: $remaining issue(s) remaining. Dispatching next run."
    gh workflow run software-factory.yml \
      -f task_source="$TASK_SOURCE" \
      -f batch_label="$BATCH_LABEL" \
      -f issue_label="$ISSUE_LABEL" \
      -f tickets_path="$TICKETS_PATH" \
      -f max_iterations="$MAX_ITERATIONS" \
      -f target_branch="$TARGET_BRANCH" \
      -f verify_command="$VERIFY_COMMAND" \
      2>&1 || log "Failed to dispatch next run"
  else
    log "Batch $batch_id: all issues done. Creating PR."
    git push origin "$batch_branch" 2>&1 || true
    gh pr create \
      --base "$TARGET_BRANCH" \
      --head "$batch_branch" \
      --title "Ralph: Batch ${batch_id}" \
      --body "Automatisch erstellte Änderungen aus Ralph Loop Batch \`${batch_id}\`.

Bearbeitete Issues: $(gh issue list --label "$ISSUE_LABEL" --label "$BATCH_LABEL" --state closed --json number --jq 'map("#\(.number)") | join(", ")' 2>/dev/null || echo "—")

🤖 Dieser PR wurde automatisch von der Software Factory erstellt." \
      2>&1 || log "Failed to create PR"
  fi
}

# ── Task Discovery ──────────────────────────────────────
discover_task_from_issues() {
  local label="${1:-$ISSUE_LABEL}"
  local batch="${2:-$BATCH_LABEL}"
  local query="is:open is:issue label:$label"
  if [ -n "$batch" ]; then
    query="$query label:$batch"
  fi

  log "Discovering task: $query"

  # List all matching issues sorted by number (oldest first = FIFO)
  local issues_json
  issues_json=$(gh issue list --search "$query" --limit 100 --json number,title,body,state \
    --jq 'sort_by(.number)' 2>/dev/null)

  if [ -z "$issues_json" ] || [ "$issues_json" = "[]" ]; then
    log "No open issues found with $query"
    return 1
  fi

  # Walk issues in order, skip blocked ones
  local issue_count
  issue_count=$(echo "$issues_json" | jq 'length')
  for i in $(seq 0 $((issue_count - 1))); do
    local issue
    issue=$(echo "$issues_json" | jq ".[$i]")
    local num
    num=$(echo "$issue" | jq -r '.number')
    local body
    body=$(echo "$issue" | jq -r '.body')
    local state
    state=$(echo "$issue" | jq -r '.state')

    if [ "$state" != "OPEN" ]; then
      continue
    fi

    # Check blocking: **Blocked by:** #N
    local blocked_by
    blocked_by=$(echo "$body" | grep -oP '\*\*Blocked by:\*\*\s*#?\K\d+' || true)
    if [ -n "$blocked_by" ]; then
      local all_closed=true
      for bid in $blocked_by; do
        local bstate
        bstate=$(gh issue view "$bid" --json state --jq '.state' 2>/dev/null || echo "OPEN")
        if [ "$bstate" != "CLOSED" ]; then
          log "Issue #${num} is blocked by open #${bid}, skipping"
          all_closed=false
          break
        fi
      done
      if [ "$all_closed" != "true" ]; then
        continue
      fi
      log "Issue #${num}: all blockers (#${blocked_by}) closed"
    fi

    ISSUE_NUMBER="$num"
    TICKET_ID="$ISSUE_NUMBER"
    TASK=$(echo "$issue" | jq -r '.body')
    log "Found issue #${ISSUE_NUMBER}: $(echo "$issue" | jq -r '.title')"
    return 0
  done

  log "All matching issues are blocked or closed"
  return 1
}

discover_task_from_markdown() {
  local tickets_path="${1:-$TICKETS_PATH}"
  if [ ! -f "$tickets_path" ]; then
    log "No tickets file found at $tickets_path"
    return 1
  fi

  log "Parsing $tickets_path for frontier ticket (implemented by Node-RED flow via /ralph/start with markdown source)"
  # When task_source=markdown, we pass the file path and let Node-RED's load_frontier handle it.
  # We extract ticket title for logging.
  TICKET_ID="markdown"
  ISSUE_NUMBER=""
  TASK="__FROM_FILE__:$tickets_path"
  return 0
}

# ── Step 1: Start Node-RED ──────────────────────────────
start_nodered() {
  log "Starting Node-RED on port ${PORT:-1880}..."
  node node_modules/.bin/node-red -u . flows.json \
    -D uiPort="${PORT:-1880}" \
    -D editorTheme.projects.enabled=false \
    &
  NODERED_PID=$!

  # Wait for readiness
  local max_wait=60
  local waited=0
  while [ $waited -lt $max_wait ]; do
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT:-1880}" 2>/dev/null | grep -q "200"; then
      log "Node-RED ready after ${waited}s"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  fail "Node-RED did not start within ${max_wait}s"
}

# ── Step 4: Poll status ─────────────────────────────────
poll_status() {
  # Wait until ralphLoopRunning becomes false
  local max_wait=3600  # 1 hour max
  local waited=0
  local interval=5

  while [ $waited -lt $max_wait ]; do
    local status
    status=$(curl -s "http://localhost:${PORT:-1880}/ralph/status" 2>/dev/null || echo '{"running":true}')

    local running
    running=$(echo "$status" | jq -r '.running // true' 2>/dev/null)

    if [ "$running" != "true" ]; then
      log "Loop finished after ${waited}s. Result:"
      echo "$status" | jq '.'
      return 0
    fi

    sleep $interval
    waited=$((waited + interval))
  done

  fail "Loop did not finish within ${max_wait}s"
}

# ── Main ────────────────────────────────────────────────
main() {
  log "Software Factory starting — repo: ${REPO:-unknown}, source: $TASK_SOURCE"

  # gh CLI reads GITHUB_TOKEN from env — no login step needed
  if [ -n "$GITHUB_TOKEN" ]; then
    export GH_TOKEN="$GITHUB_TOKEN"
    # Set up git for commit/push
    gh auth setup-git 2>/dev/null || true
    git config user.email "ralph[bot]@users.noreply.github.com"
    git config user.name "Ralph Loop"
  fi

  # Discover task
  if [ -n "$TASK_ISSUE_NUMBER" ] && [ -n "$GITHUB_TOKEN" ]; then
    # Specific issue number provided (e.g. from workflow_dispatch input)
    local issue_body
    issue_body=$(gh issue view "$TASK_ISSUE_NUMBER" -R "$REPO" --json body --jq '.body' 2>/dev/null || echo "")
    if [ -z "$issue_body" ]; then
      fail "Issue #${TASK_ISSUE_NUMBER} not found or empty"
    fi
    ISSUE_NUMBER="$TASK_ISSUE_NUMBER"
    TICKET_ID="$ISSUE_NUMBER"
    TASK="$issue_body"
    log "Using specified issue #${ISSUE_NUMBER}"
  elif [ "$TASK_SOURCE" = "markdown" ]; then
    discover_task_from_markdown "$TICKETS_PATH" || fail "No tickets found in markdown"
  else
    discover_task_from_issues "$ISSUE_LABEL" "$BATCH_LABEL" || fail "No tasks found"
  fi

  # Determine batch ID
  if [ -n "$BATCH_LABEL" ]; then
BATCH_ID="${BATCH_LABEL#ralph:}"  # ralph:batch-42 → batch-42
  else
    BATCH_ID="single-${TICKET_ID}"
  fi

  # Git: checkout batch branch
  cd "$GITHUB_WORKSPACE" 2>/dev/null || cd /tmp
  if [ -d .git ]; then
    ensure_batch_branch "$BATCH_ID" "$TARGET_BRANCH"
  else
    log "No git repo at $(pwd) — running without git integration"
  fi

  # Start Node-RED
  start_nodered

  # Submit task to Ralph Loop
  log "Submitting task to Ralph Loop..."
  START_PAYLOAD=$(jq -n \
    --arg task "$TASK" \
    --arg ticketId "$TICKET_ID" \
    --argjson maxFixerRetries "$MAX_ITERATIONS" \
    --arg verifyCommand "$VERIFY_COMMAND" \
    --arg cwd "$(pwd)" \
    '{
      task: $task,
      ticketId: $ticketId,
      loops: 1,
      maxFixerRetries: $maxFixerRetries,
      verifyCommand: $verifyCommand,
      repoRoot: $cwd
    }')

  HTTP_CODE=$(curl -s -o /tmp/start_response.json -w "%{http_code}" \
    -X POST "http://localhost:${PORT:-1880}/ralph/start" \
    -H "Content-Type: application/json" \
    -d "$START_PAYLOAD")

  if [ "$HTTP_CODE" != "202" ]; then
    log "Start response: $HTTP_CODE"
    cat /tmp/start_response.json 2>/dev/null || true
    fail "POST /ralph/start failed"
  fi

  log "Loop started. Polling for completion..."

  # Wait for loop to finish
  poll_status

  # Get final result
  FINAL_RESULT=$(curl -s "http://localhost:${PORT:-1880}/ralph/status" 2>/dev/null || echo '{}')
  log "Final result: $(echo "$FINAL_RESULT" | jq -c '.')"

  # Commit and push changes
  if [ -d .git ]; then
    commit_and_push "$ISSUE_NUMBER"
  fi

  # Close the issue if it was completed
  if [ -n "$ISSUE_NUMBER" ] && [ -n "$GITHUB_TOKEN" ]; then
    local verdict
    verdict=$(echo "$FINAL_RESULT" | jq -r '.result.verdict // "unknown"' 2>/dev/null)
    if [ "$verdict" = "READY" ] || [ "$verdict" = "OK" ]; then
      close_issue "$ISSUE_NUMBER"
    fi
  fi

  # Dispatch next or create PR
  if [ -n "$BATCH_LABEL" ] && [ -n "$GITHUB_TOKEN" ]; then
    dispatch_next_or_finish "$BATCH_ID" "$ISSUE_NUMBER"
  fi

  # Cleanup
  kill "$NODERED_PID" 2>/dev/null || true
  log "Done."
}

main "$@"
