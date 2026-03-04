#!/usr/bin/env bash
#
# ralph.sh — Multi-agent Ralph Loop executor
#
# Modes:
#   --once             Single iteration with fallback chain (codex -> claude -> gemini)
#   --afk [N]          Loop with fallback chain until COMPLETE or N iterations
#   --parallel [N]     Run agents in parallel with isolated progress/log files
#
# Parallel mode files:
#   plan.<agent>.md         (optional, fallback to plan.md)
#   progress.<agent>.md     (auto-created)
#   ralph-<agent>.log       (auto-created)
#   ralph-parallel-summary.txt
#
# Optional env vars:
#   PARALLEL_AGENTS=codex,claude,gemini
#   AGENT_RETRY_LIMIT=2
#   PARALLEL_LIVE_PROGRESS=1
#   FEEDBACK_CMD="pnpm -r --if-present typecheck && pnpm -r --if-present test && pnpm -r --if-present lint"

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

PLAN_FILE="plan.md"
PROGRESS_FILE="progress.md"
LOG_FILE="ralph-log.txt"
PARALLEL_SUMMARY_FILE="ralph-parallel-summary.txt"
STATUS_DIR=".ralph-status"
DEFAULT_MAX_ITERATIONS=10
DEFAULT_PARALLEL_ITERATIONS=1
PARALLEL_AGENTS_DEFAULT="codex,claude,gemini"
AGENT_RETRY_LIMIT="${AGENT_RETRY_LIMIT:-2}"
AGENT_TIMEOUT_SEC="${AGENT_TIMEOUT_SEC:-900}"
AGENT_TIMEOUT_GRACE_SEC="${AGENT_TIMEOUT_GRACE_SEC:-15}"
PARALLEL_MAX_CONSECUTIVE_FAILURES="${PARALLEL_MAX_CONSECUTIVE_FAILURES:-0}"
PARALLEL_LIVE_PROGRESS="${PARALLEL_LIVE_PROGRESS:-1}"
PARALLEL_PROGRESS_INTERVAL_SEC="${PARALLEL_PROGRESS_INTERVAL_SEC:-8}"
PARALLEL_TRACE_FILE="${PARALLEL_TRACE_FILE:-ralph-parallel-trace.log}"
TIMESTAMP_FMT="%Y-%m-%d %H:%M:%S"
PROMPT_TMPFILE=""
PARALLEL_AGENT_LIST=()
DOC_POLICY_REASON=""
TASK_POLICY_REASON=""
INSTRUCTIONS_FILE="${INSTRUCTIONS_FILE:-}"
COMPLETE_WHEN_NO_PATTERN="${COMPLETE_WHEN_NO_PATTERN:-- [ ]}"
TELEGRAM_CONFIG="${TELEGRAM_CONFIG:-$HOME/.claude/skills/telegram-notify/config.json}"
AGENT="${AGENT:-}"
PROJECT_NAME="${PROJECT_NAME:-$(basename "$(pwd)")}"
FEEDBACK_CMD="${FEEDBACK_CMD:-}"

# ─── Colors ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ─── Helpers ─────────────────────────────────────────────────────────────────

strip_ansi() {
    sed $'s/\x1b\[[0-9;]*[a-zA-Z]//g'
}

log() {
    local msg="[$(date +"$TIMESTAMP_FMT")] $*"
    echo -e "$msg"
    echo -e "$msg" | strip_ansi >> "$LOG_FILE"
}

# tee_log: stream stdin to terminal + master log
tee_log() {
    tee >(strip_ansi >> "$LOG_FILE")
}

# tee_agent_log: stream stdin to terminal + master log + agent log
tee_agent_log() {
    local agent_log="$1"
    tee >(strip_ansi >> "$agent_log") >(strip_ansi >> "$LOG_FILE")
}

sanitize_stream_line() {
    perl -pe '
        s/\r//g;
        s/\x08//g;
        s/\x1b\[[0-9;]*[a-zA-Z]//g;
        s/[^\t[:print:]]//g;
    '
}

latest_agent_activity() {
    local file="$1"
    local start_line="${2:-0}"
    local from_line=1

    [[ -f "$file" ]] || {
        echo "(no log yet)"
        return 0
    }

    if [[ "$start_line" =~ ^[0-9]+$ ]] && [[ "$start_line" -ge 0 ]]; then
        from_line=$((start_line + 1))
    fi

    sed -n "${from_line},\$p" "$file" \
        | sanitize_stream_line \
        | awk '
            {
                gsub(/[[:space:]]+/, " ");
                gsub(/^ +| +$/, "");
                if (length($0) > 0) {
                    last = $0;
                }
            }
            END {
                if (length(last) > 0) {
                    print last;
                } else {
                    print "(no new output)";
                }
            }
        '
}

build_live_status_snapshot() {
    local meta_file="$1"
    local snapshot_parts=()

    [[ -f "$meta_file" ]] || {
        echo ""
        return 0
    }

    while IFS='|' read -r agent pid agent_log start_line; do
        local state="done"
        local lines="0"
        local delta_lines=0
        local activity=""

        [[ -n "$agent" ]] || continue

        if kill -0 "$pid" 2>/dev/null; then
            state="running"
        fi

        if [[ -f "$agent_log" ]]; then
            lines="$(wc -l < "$agent_log" | tr -d ' ')"
        fi
        if [[ "$lines" =~ ^[0-9]+$ ]] && [[ "$start_line" =~ ^[0-9]+$ ]]; then
            delta_lines=$((lines - start_line))
            if [[ "$delta_lines" -lt 0 ]]; then
                delta_lines=0
            fi
        fi

        activity="$(latest_agent_activity "$agent_log" "$start_line")"
        activity="${activity:0:160}"
        snapshot_parts+=("${agent}=${state}(+${delta_lines}l): ${activity}")
    done < "$meta_file"

    if [[ ${#snapshot_parts[@]} -eq 0 ]]; then
        echo ""
        return 0
    fi

    local IFS=' | '
    echo "${snapshot_parts[*]}"
}

run_parallel_live_monitor() {
    local iteration="$1"
    local meta_file="$2"
    local interval="$PARALLEL_PROGRESS_INTERVAL_SEC"

    if [[ ! "$interval" =~ ^[0-9]+$ ]] || [[ "$interval" -lt 1 ]]; then
        interval=8
    fi

    while true; do
        local snapshot=""
        local any_running=0

        snapshot="$(build_live_status_snapshot "$meta_file")"
        if [[ -n "$snapshot" ]]; then
            log "${BLUE}[Parallel][Live][Iteration ${iteration}]${NC} ${snapshot}"
            echo "[$(date +"$TIMESTAMP_FMT")] iteration=${iteration} ${snapshot}" >> "$PARALLEL_TRACE_FILE"
        fi

        while IFS='|' read -r _agent pid _log _start_line; do
            [[ -n "$pid" ]] || continue
            if kill -0 "$pid" 2>/dev/null; then
                any_running=1
                break
            fi
        done < "$meta_file"

        if [[ "$any_running" -eq 0 ]]; then
            break
        fi

        sleep "$interval"
    done
}

die() {
    log "${RED}FATAL: $*${NC}"
    exit 1
}

cleanup() {
    [[ -n "$PROMPT_TMPFILE" && -f "$PROMPT_TMPFILE" ]] && rm -f "$PROMPT_TMPFILE" || true
}
trap cleanup EXIT

notify_telegram() {
    local msg="$1"
    if [[ -f "$TELEGRAM_CONFIG" ]]; then
        local token chat_id
        token=$(jq -r '.token' "$TELEGRAM_CONFIG" 2>/dev/null || true)
        chat_id=$(jq -r '.chat_id' "$TELEGRAM_CONFIG" 2>/dev/null || true)
        if [[ -n "$token" ]] && [[ -n "$chat_id" ]]; then
            curl -s -X POST "https://api.telegram.org/bot${token}/sendMessage" \
                -H "Content-Type: application/json" \
                -d "$(jq -n --arg cid "$chat_id" --arg txt "$msg" '{chat_id: $cid, text: $txt}')" \
                >/dev/null 2>&1 &
        fi
    fi
}

ensure_progress_file() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        cat > "$file" << 'INIT'
# Progress Log

> Updated by agents during Ralph Loop execution.

---

INIT
    fi
}

check_deps() {
    local missing=()
    local cmd
    for cmd in codex claude gemini; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        log "${YELLOW}WARNING: Missing CLI tools: ${missing[*]}${NC}"
        log "${YELLOW}Available agents will be used.${NC}"
    fi
}

is_complete() {
    if [[ -n "$COMPLETE_WHEN_NO_PATTERN" ]]; then
        [[ -f "$PLAN_FILE" ]] && ! grep -qF -- "$COMPLETE_WHEN_NO_PATTERN" "$PLAN_FILE" 2>/dev/null
    else
        [[ -f "$PROGRESS_FILE" ]] && grep -qi "<COMPLETE>" "$PROGRESS_FILE" 2>/dev/null
    fi
}

is_complete_file() {
    local file="$1"
    if [[ -n "$COMPLETE_WHEN_NO_PATTERN" ]]; then
        [[ -f "$PLAN_FILE" ]] && ! grep -qF -- "$COMPLETE_WHEN_NO_PATTERN" "$PLAN_FILE" 2>/dev/null
    else
        [[ -f "$file" ]] && grep -qi "<COMPLETE>" "$file" 2>/dev/null
    fi
}

build_prompt_file() {
    PROMPT_TMPFILE="$(mktemp "${TMPDIR:-/tmp}/ralph-prompt.XXXXXX")"
    {
        cat "$PLAN_FILE"
        if [[ -n "$INSTRUCTIONS_FILE" && -f "$INSTRUCTIONS_FILE" ]]; then
            printf '\n\n---\n\n'
            cat "$INSTRUCTIONS_FILE"
        fi
        printf '\n\n---\n\n## Ralph Runner Policy (ENFORCED)\n\n'
        printf -- '- If a task is marked complete (next unchecked task changes), you MUST run mandatory feedback loops, update docs, then commit and run `git push`.\n'
        printf -- '- If you update documentation completion state (task checkbox/progress completed), you MUST commit and run `git push`.\n'
        printf -- '- If a task attempt fails, append a failure record to progress with task, command, error excerpt, and log path.\n'
        printf -- '- When ALL tasks in the plan are checked complete, append `<COMPLETE>` on its own line at the end of the progress file.\n'
        printf '\n\n---\n\n## Current Progress\n\n'
        if [[ -f "$PROGRESS_FILE" ]]; then
            cat "$PROGRESS_FILE"
        else
            echo "No progress yet. Start with the first unchecked task."
        fi
    } > "$PROMPT_TMPFILE"
}

build_prompt_file_for() {
    local plan_file="$1"
    local progress_file="$2"
    local tmp_file
    tmp_file="$(mktemp "${TMPDIR:-/tmp}/ralph-prompt.XXXXXX")"

    {
        cat "$plan_file"
        if [[ -n "$INSTRUCTIONS_FILE" && -f "$INSTRUCTIONS_FILE" ]]; then
            printf '\n\n---\n\n'
            cat "$INSTRUCTIONS_FILE"
        fi
        printf '\n\n---\n\n## Ralph Runner Policy (ENFORCED)\n\n'
        printf -- '- If a task is marked complete (next unchecked task changes), you MUST run mandatory feedback loops, update docs, then commit and run `git push`.\n'
        printf -- '- If you update documentation completion state (task checkbox/progress completed), you MUST commit and run `git push`.\n'
        printf -- '- If a task attempt fails, append a failure record to progress with task, command, error excerpt, and log path.\n'
        printf -- '- When ALL tasks in the plan are checked complete, append `<COMPLETE>` on its own line at the end of the progress file.\n'
        printf '\n\n---\n\n## Current Progress\n\n'
        if [[ -f "$progress_file" ]]; then
            cat "$progress_file"
        else
            echo "No progress yet. Start with the first unchecked task."
        fi
    } > "$tmp_file"

    echo "$tmp_file"
}

# ─── Agent Runners (fallback mode) ──────────────────────────────────────────

run_codex() {
    log "${BLUE}[Agent: codex]${NC} Starting execution..."

    if ! command -v codex &>/dev/null; then
        log "${YELLOW}[Agent: codex]${NC} Not installed, skipping."
        return 1
    fi

    script -q /dev/null bash -c "codex exec -s danger-full-access - < '$PROMPT_TMPFILE'" 2>&1 | tee_log
    return "${PIPESTATUS[0]}"
}

run_claude() {
    log "${BLUE}[Agent: claude]${NC} Starting execution..."

    if ! command -v claude &>/dev/null; then
        log "${YELLOW}[Agent: claude]${NC} Not installed, skipping."
        return 1
    fi

    script -q /dev/null bash -c "unset CLAUDECODE; claude -p --verbose --dangerously-skip-permissions < '$PROMPT_TMPFILE'" 2>&1 | tee_log
    return "${PIPESTATUS[0]}"
}

run_gemini() {
    log "${BLUE}[Agent: gemini]${NC} Starting execution..."

    if ! command -v gemini &>/dev/null; then
        log "${YELLOW}[Agent: gemini]${NC} Not installed, skipping."
        return 1
    fi

    script -q /dev/null bash -c "gemini --yolo < '$PROMPT_TMPFILE'" 2>&1 | tee_log
    return "${PIPESTATUS[0]}"
}

# ─── Agent Runners (parallel mode) ──────────────────────────────────────────

plan_file_for_agent() {
    local agent="$1"
    local candidate="plan.${agent}.md"
    if [[ -f "$candidate" ]]; then
        echo "$candidate"
    else
        echo "$PLAN_FILE"
    fi
}

progress_file_for_agent() {
    local agent="$1"
    echo "progress.${agent}.md"
}

log_file_for_agent() {
    local agent="$1"
    echo "ralph-${agent}.log"
}

status_file_for_agent_iteration() {
    local agent="$1"
    local iteration="$2"
    echo "$STATUS_DIR/${agent}.iteration${iteration}.status"
}

agent_command_with_prompt() {
    local agent="$1"
    local prompt_file="$2"
    local quoted_prompt
    quoted_prompt="$(printf '%q' "$prompt_file")"

    case "$agent" in
        codex)
            echo "codex exec -s danger-full-access - < $quoted_prompt"
            ;;
        claude)
            echo "unset CLAUDECODE; claude -p --verbose --dangerously-skip-permissions < $quoted_prompt"
            ;;
        gemini)
            echo "gemini --yolo < $quoted_prompt"
            ;;
        *)
            return 1
            ;;
    esac
}

run_agent_with_prompt() {
    local agent="$1"
    local prompt_file="$2"
    local agent_log="$3"
    local timeout_sec="${4:-0}"
    local cmd

    if ! command -v "$agent" &>/dev/null; then
        log "${YELLOW}[Parallel][$agent]${NC} Not installed, skipping."
        return 127
    fi

    cmd="$(agent_command_with_prompt "$agent" "$prompt_file")" || {
        log "${RED}[Parallel][$agent] Unsupported agent.${NC}"
        return 2
    }

    if [[ "$timeout_sec" =~ ^[0-9]+$ ]] && [[ "$timeout_sec" -gt 0 ]]; then
        perl -e '
            use strict;
            use warnings;
            use POSIX qw(setsid);

            my ($soft, $grace, @cmd) = @ARGV;
            $soft = int($soft);
            $grace = int($grace);
            $grace = 1 if $grace < 1;

            my $pid = fork();
            die "fork failed: $!" unless defined $pid;

            if ($pid == 0) {
                setsid();
                exec @cmd or die "exec failed: $!";
            }

            my $timed_out = 0;
            my $phase = 0;
            local $SIG{ALRM} = sub {
                if ($phase == 0) {
                    $timed_out = 1;
                    $phase = 1;
                    kill "TERM", -$pid;
                    alarm($grace);
                } else {
                    kill "KILL", -$pid;
                    alarm(0);
                }
            };

            alarm($soft);
            waitpid($pid, 0);
            my $status = $?;
            alarm(0);

            if ($timed_out) {
                exit 124;
            }
            if ($status == -1) {
                exit 1;
            }
            if ($status & 127) {
                exit 128 + ($status & 127);
            }
            exit($status >> 8);
        ' "$timeout_sec" "$AGENT_TIMEOUT_GRACE_SEC" script -q /dev/null bash -lc "$cmd" 2>&1 | tee_agent_log "$agent_log"
    else
        script -q /dev/null bash -lc "$cmd" 2>&1 | tee_agent_log "$agent_log"
    fi

    return "${PIPESTATUS[0]}"
}

timeout_for_attempt() {
    local attempt="$1"

    if [[ ! "$AGENT_TIMEOUT_SEC" =~ ^[0-9]+$ ]] || [[ "$AGENT_TIMEOUT_SEC" -le 0 ]]; then
        echo 0
        return 0
    fi

    echo $((AGENT_TIMEOUT_SEC * attempt))
}

run_agent_with_retries() {
    local iteration="$1"
    local agent="$2"
    local plan_file="$3"
    local progress_file="$4"
    local agent_log="$5"
    local status_file="$6"

    local attempt=1
    local attempts_used=0
    local rc=1
    local delay=1
    local before_head=""
    local before_ahead=0
    local before_docs_state=""
    local before_task=""

    while [[ $attempt -le $AGENT_RETRY_LIMIT ]]; do
        local prompt_file
        local start_line
        local attempt_timeout
        local after_head=""
        prompt_file="$(build_prompt_file_for "$plan_file" "$progress_file")"
        attempts_used="$attempt"
        attempt_timeout="$(timeout_for_attempt "$attempt")"
        if git_is_repo; then
            before_head="$(git_current_head)"
            before_ahead="$(git_ahead_count_or_minus_one)"
            before_docs_state="$(docs_worktree_state "$plan_file")"
            before_task="$(current_task_title "$plan_file")"
        else
            before_head=""
            before_ahead=0
            before_docs_state=""
            before_task=""
        fi

        if [[ -f "$agent_log" ]]; then
            start_line="$(wc -l < "$agent_log" | tr -d ' ')"
        else
            start_line=0
        fi

        log "${BLUE}[Parallel][$agent]${NC} Iteration $iteration, attempt $attempt/${AGENT_RETRY_LIMIT} (timeout=${attempt_timeout}s)"

        if run_agent_with_prompt "$agent" "$prompt_file" "$agent_log" "$attempt_timeout"; then
            rc=0
            if attempt_output_has_critical_errors "$agent_log" "$start_line"; then
                rc=86
                log "${YELLOW}[Parallel][$agent]${NC} Output contains critical error markers, treating as failure."
            fi
            if [[ $rc -eq 0 ]] && git_is_repo; then
                local task_policy_rc=0
                enforce_task_completion_commit_policy \
                    "$before_head" "$before_ahead" "$before_docs_state" "$before_task" \
                    "$plan_file" "$progress_file" "$agent" || task_policy_rc=$?
                if [[ $task_policy_rc -ne 0 ]]; then
                    log "${YELLOW}[Parallel][$agent]${NC} Task policy failed (rc=$task_policy_rc): $TASK_POLICY_REASON"
                    rc=$task_policy_rc
                fi
            fi
            if [[ $rc -eq 0 ]] && git_is_repo; then
                after_head="$(git_current_head)"
                local policy_rc=0
                enforce_doc_push_policy "$before_head" "$before_ahead" "$before_docs_state" "$after_head" "$plan_file" "$progress_file" || policy_rc=$?
                if [[ $policy_rc -ne 0 ]]; then
                    log "${YELLOW}[Parallel][$agent]${NC} Policy check failed (rc=$policy_rc): $DOC_POLICY_REASON"
                    if rescue_doc_policy "$plan_file" "$progress_file" "$policy_rc" "$agent"; then
                        log "${GREEN}[Parallel][$agent]${NC} Rescue succeeded."
                    else
                        rc=$policy_rc
                    fi
                fi
            fi
            rm -f "$prompt_file"
            if [[ $rc -eq 0 ]]; then
                break
            fi
        else
            rc=$?
            rm -f "$prompt_file"
            if [[ "$rc" -eq 124 ]]; then
                log "${YELLOW}[Parallel][$agent]${NC} Timeout (${attempt_timeout}s) reached; process was terminated."
            fi
        fi

        if [[ $attempt -lt $AGENT_RETRY_LIMIT ]]; then
            log "${YELLOW}[Parallel][$agent]${NC} Failed with exit code $rc, retrying in ${delay}s..."
            sleep "$delay"
            delay=$((delay * 2))
        fi

        attempt=$((attempt + 1))
    done

    {
        echo "agent=$agent"
        echo "iteration=$iteration"
        echo "plan_file=$plan_file"
        echo "progress_file=$progress_file"
        echo "log_file=$agent_log"
        echo "attempts=$attempts_used"
        echo "exit_code=$rc"
    } > "$status_file"

    return "$rc"
}

status_value() {
    local file="$1"
    local key="$2"
    if [[ ! -f "$file" ]]; then
        return 0
    fi

    grep "^${key}=" "$file" | tail -n 1 | cut -d'=' -f2- || true
}

git_is_repo() {
    git rev-parse --is-inside-work-tree >/dev/null 2>&1
}

git_current_head() {
    git rev-parse HEAD 2>/dev/null || true
}

git_has_upstream() {
    git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1
}

git_ahead_count() {
    if ! git_has_upstream; then
        return 1
    fi
    git rev-list --count @{u}..HEAD 2>/dev/null
}

git_ahead_count_or_minus_one() {
    local count=""
    if count="$(git_ahead_count)"; then
        echo "$count"
    else
        echo "-1"
    fi
}

git_has_worktree_changes() {
    if command -v rg &>/dev/null; then
        git status --porcelain 2>/dev/null | rg -q "."
    else
        [[ -n "$(git status --porcelain 2>/dev/null)" ]]
    fi
}

commit_subject_from_task() {
    local task="$1"
    task="${task//$'\n'/ }"
    task="$(printf '%s' "$task" | tr -s ' ')"
    task="${task% }"
    task="${task# }"
    if [[ -z "$task" || "$task" == "无" || "$task" == "(所有任务已完成)" ]]; then
        task="task-update"
    fi
    echo "${task:0:72}"
}

run_feedback_loops() {
    if [[ -n "$FEEDBACK_CMD" ]]; then
        log "${BLUE}[Policy][Feedback]${NC} Running FEEDBACK_CMD: $FEEDBACK_CMD"
        bash -lc "$FEEDBACK_CMD"
        return $?
    fi

    if [[ -f "package.json" ]] && command -v pnpm &>/dev/null; then
        local cmd
        for cmd in \
            "pnpm -r --if-present typecheck" \
            "pnpm -r --if-present test" \
            "pnpm -r --if-present lint"; do
            log "${BLUE}[Policy][Feedback]${NC} Running: $cmd"
            if ! bash -lc "$cmd"; then
                return 1
            fi
        done
        return 0
    fi

    log "${YELLOW}[Policy][Feedback]${NC} No default feedback loop detected; skipping."
    return 0
}

stage_changes_for_task_commit() {
    git add -A

    # Exclude runner-generated artifacts from task commits.
    git reset --quiet -- "$STATUS_DIR" "$LOG_FILE" "$PARALLEL_SUMMARY_FILE" "$PARALLEL_TRACE_FILE" 2>/dev/null || true

    local artifact=""
    for artifact in ralph-*.log; do
        [[ -e "$artifact" ]] || continue
        git reset --quiet -- "$artifact" 2>/dev/null || true
    done
}

enforce_task_completion_commit_policy() {
    local before_head="$1"
    local before_ahead="$2"
    local before_docs_state="$3"
    local before_task="$4"
    local plan_file="$5"
    local progress_file="$6"
    local agent_name="${7:-runner}"

    local after_task=""
    local completed_task=""
    local after_docs_state=""
    local current_head=""
    local docs_worktree=0
    local docs_committed=0
    local after_ahead=""
    local commit_subject=""

    TASK_POLICY_REASON=""

    if ! git_is_repo; then
        return 0
    fi

    after_task="$(current_task_title "$plan_file")"
    completed_task="$(completed_task_from_transition "$before_task" "$after_task")"
    if [[ "$completed_task" == "无" ]]; then
        return 0
    fi

    log "${BLUE}[Policy][$agent_name]${NC} Task completion detected: $completed_task"

    if ! run_feedback_loops; then
        TASK_POLICY_REASON="Task completed but mandatory feedback loops failed."
        return 91
    fi

    current_head="$(git_current_head)"
    after_docs_state="$(docs_worktree_state "$plan_file")"
    if [[ "$after_docs_state" != "$before_docs_state" ]]; then
        docs_worktree=1
    fi
    if docs_changed_in_commit_range "$before_head" "$current_head" "$plan_file"; then
        docs_committed=1
    fi

    if [[ $docs_worktree -eq 0 && $docs_committed -eq 0 ]]; then
        TASK_POLICY_REASON="Task completed but plan documentation was not updated."
        return 92
    fi

    if git_has_worktree_changes; then
        stage_changes_for_task_commit
        if git diff --cached --quiet 2>/dev/null; then
            TASK_POLICY_REASON="Task completed but no staged changes available for commit."
            return 93
        fi

        commit_subject="$(commit_subject_from_task "$completed_task")"
        if ! git commit -m "ralph: complete task - $commit_subject"; then
            TASK_POLICY_REASON="Auto-commit failed after task completion."
            return 94
        fi
    elif [[ -n "$before_head" && "$before_head" == "$current_head" ]]; then
        TASK_POLICY_REASON="Task completed but no code/doc changes were committed."
        return 93
    fi

    if ! git_has_upstream; then
        TASK_POLICY_REASON="Task completed and committed, but upstream is not configured so push cannot be verified."
        return 95
    fi

    if ! git push 2>&1; then
        TASK_POLICY_REASON="Task completed and committed, but git push failed."
        return 95
    fi

    after_ahead="$(git_ahead_count_or_minus_one)"
    if [[ "$after_ahead" =~ ^-?[0-9]+$ ]]; then
        if [[ "$before_ahead" -lt 0 ]]; then
            before_ahead=0
        fi
        if [[ "$after_ahead" -gt "$before_ahead" ]]; then
            TASK_POLICY_REASON="Task completion commit exists but push verification failed (ahead before=$before_ahead after=$after_ahead)."
            return 95
        fi
    fi

    return 0
}

docs_worktree_state() {
    local plan_file="$1"
    # Only track plan file — progress is a local runtime log, not a deliverable
    git status --porcelain -- "$plan_file" 2>/dev/null || true
}

docs_changed_in_commit_range() {
    local before_head="$1"
    local after_head="$2"
    local plan_file="$3"

    [[ -n "$before_head" && -n "$after_head" ]] || return 1
    [[ "$before_head" != "$after_head" ]] || return 1

    if command -v rg &>/dev/null; then
        git diff --name-only "$before_head..$after_head" -- "$plan_file" 2>/dev/null | rg -q "."
    else
        [[ -n "$(git diff --name-only "$before_head..$after_head" -- "$plan_file" 2>/dev/null)" ]]
    fi
}

enforce_doc_push_policy() {
    local before_head="$1"
    local before_ahead="$2"
    local before_docs_state="$3"
    local after_head="$4"
    local plan_file="$5"
    local progress_file="$6"
    local after_ahead=""
    local after_docs_state=""
    local docs_worktree=0
    local docs_committed=0

    DOC_POLICY_REASON=""

    if ! git_is_repo; then
        return 0
    fi

    after_docs_state="$(docs_worktree_state "$plan_file")"
    if [[ "$after_docs_state" != "$before_docs_state" ]]; then
        docs_worktree=1
    fi
    if docs_changed_in_commit_range "$before_head" "$after_head" "$plan_file"; then
        docs_committed=1
    fi

    if [[ $docs_worktree -eq 0 && $docs_committed -eq 0 ]]; then
        return 0
    fi

    if [[ $docs_worktree -eq 1 ]]; then
        DOC_POLICY_REASON="Documentation completion state was updated but not committed."
        return 88
    fi

    if ! git_has_upstream; then
        DOC_POLICY_REASON="Documentation completion state was committed, but upstream is not configured so push cannot be verified."
        return 89
    fi

    after_ahead="$(git_ahead_count_or_minus_one)"
    if [[ ! "$after_ahead" =~ ^-?[0-9]+$ ]]; then
        DOC_POLICY_REASON="Unable to read git ahead count after documentation update."
        return 89
    fi

    if [[ "$before_ahead" -lt 0 ]]; then
        before_ahead=0
    fi

    if [[ "$after_ahead" -gt "$before_ahead" ]]; then
        DOC_POLICY_REASON="Documentation completion state was committed but not pushed (ahead before=$before_ahead after=$after_ahead)."
        return 90
    fi

    return 0
}

# Auto-rescue uncommitted/unpushed doc changes after agent run
# Returns 0 if rescue succeeded, 1 if failed
rescue_doc_policy() {
    local plan_file="$1"
    local progress_file="$2"
    local policy_rc="$3"
    local agent_name="${4:-runner}"

    case "$policy_rc" in
        88)
            # Uncommitted doc changes — auto-commit
            log "${YELLOW}[Rescue][$agent_name]${NC} Auto-committing uncommitted plan changes..."
            git add -- "$plan_file" 2>/dev/null || true
            if git diff --cached --quiet -- "$plan_file" 2>/dev/null; then
                log "${RED}[Rescue][$agent_name]${NC} Nothing staged after git add, rescue failed."
                return 1
            fi
            if ! git commit -m "docs: auto-commit progress update (ralph rescue)"; then
                log "${RED}[Rescue][$agent_name]${NC} Commit failed."
                return 1
            fi
            log "${GREEN}[Rescue][$agent_name]${NC} Committed. Now pushing..."
            if git_has_upstream; then
                if ! git push 2>&1; then
                    log "${RED}[Rescue][$agent_name]${NC} Push failed."
                    return 1
                fi
                log "${GREEN}[Rescue][$agent_name]${NC} Pushed successfully."
            fi
            return 0
            ;;
        90)
            # Committed but not pushed — auto-push
            log "${YELLOW}[Rescue][$agent_name]${NC} Auto-pushing unpushed commits..."
            if ! git push 2>&1; then
                log "${RED}[Rescue][$agent_name]${NC} Push failed."
                return 1
            fi
            log "${GREEN}[Rescue][$agent_name]${NC} Pushed successfully."
            return 0
            ;;
        *)
            # Not rescuable (e.g. 89 = no upstream)
            return 1
            ;;
    esac
}

error_excerpt_from_log() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        return 0
    fi

    if command -v rg &>/dev/null; then
        tail -n 120 "$file" | rg -i "error|failed|fatal|exception|traceback" | tail -n 5 || true
    else
        tail -n 120 "$file" | grep -Ei "error|failed|fatal|exception|traceback" | tail -n 5 || true
    fi
}

first_open_task_title() {
    local plan_file="$1"
    awk '
        /^#### Task / { task=$0 }
        /^- \[ \]/ { print task; exit }
    ' "$plan_file" 2>/dev/null || true
}

current_task_title() {
    local plan_file="$1"
    local title
    title="$(grep -m1 '^\- \[ \]' "$plan_file" 2>/dev/null | sed 's/^- \[ \] //' || true)"
    if [[ -z "$title" ]]; then
        title="(所有任务已完成)"
    fi
    echo "$title"
}

completed_task_from_transition() {
    local before_task="$1"
    local after_task="$2"

    if [[ -z "$before_task" || "$before_task" == "(所有任务已完成)" ]]; then
        echo "无"
        return 0
    fi

    if [[ "$before_task" != "$after_task" ]]; then
        echo "$before_task"
    else
        echo "无"
    fi
}

# Summary of remaining tasks across all parallel agents
parallel_remaining_summary() {
    local summary=""
    local agent
    for agent in "${PARALLEL_AGENT_LIST[@]}"; do
        local pf
        pf="$(plan_file_for_agent "$agent")"
        local task
        task="$(current_task_title "$pf")"
        if [[ "$task" != "(所有任务已完成)" ]]; then
            summary="${summary}${agent}: ${task}; "
        fi
    done
    if [[ -z "$summary" ]]; then
        echo "全部完成"
    else
        echo "${summary%;*}"
    fi
}

append_failure_record_to_progress() {
    local progress_file="$1"
    local plan_file="$2"
    local agent="$3"
    local iteration="$4"
    local exit_code="$5"
    local attempts="$6"
    local agent_log="$7"
    local excerpt="$8"
    local task_title=""
    local abs_log=""
    local runner_reason=""

    [[ -f "$progress_file" ]] || ensure_progress_file "$progress_file"

    task_title="$(first_open_task_title "$plan_file")"
    [[ -n "$task_title" ]] || task_title="Unknown Task"
    abs_log="$(cd "$(dirname "$agent_log")" && pwd)/$(basename "$agent_log")"
    case "$exit_code" in
        88)
            runner_reason="Documentation completion state updated but not committed."
            ;;
        89)
            runner_reason="Documentation completion state committed, but upstream/push verification is unavailable."
            ;;
        90)
            runner_reason="Documentation completion state committed but not pushed."
            ;;
        124)
            runner_reason="Task execution timed out."
            ;;
        91)
            runner_reason="Task completed but mandatory feedback loops failed."
            ;;
        92)
            runner_reason="Task completed but plan/progress documentation was not updated."
            ;;
        93)
            runner_reason="Task completed but no committable changes were found."
            ;;
        94)
            runner_reason="Auto-commit failed after task completion."
            ;;
        95)
            runner_reason="Task completion commit could not be pushed/verified."
            ;;
    esac

    if ! grep -q "^## Failed Attempts$" "$progress_file" 2>/dev/null; then
        {
            echo ""
            echo "## Failed Attempts"
            echo ""
        } >> "$progress_file"
    else
        echo "" >> "$progress_file"
    fi

    {
        echo "### $(date +"$TIMESTAMP_FMT") | Agent: $agent | Iteration: $iteration"
        echo "- Task: $task_title"
        echo "- Exit code: $exit_code"
        echo "- Attempts: $attempts"
        echo "- Log: \`$abs_log\`"
        if [[ -n "$runner_reason" ]]; then
            echo "- Runner reason: $runner_reason"
        fi
        if [[ -n "$excerpt" ]]; then
            echo "- Error excerpt:"
            echo '```text'
            echo "$excerpt"
            echo '```'
        fi
    } >> "$progress_file"
}

attempt_output_has_critical_errors() {
    local file="$1"
    local start_line="$2"
    local from_line=1

    if [[ ! -f "$file" ]]; then
        return 1
    fi

    if [[ "$start_line" =~ ^[0-9]+$ ]]; then
        from_line=$((start_line + 1))
    fi

    if command -v rg &>/dev/null; then
        sed -n "${from_line},\$p" "$file" | rg -i \
            "API Error|Unable to connect to API|ERROR: stream disconnected|An unexpected critical error occurred|Premature close|ECONNRESET|tls handshake eof|Transport error: network error|failed to connect to websocket|socket hang up" \
            >/dev/null
    else
        sed -n "${from_line},\$p" "$file" | grep -Ei \
            "API Error|Unable to connect to API|ERROR: stream disconnected|An unexpected critical error occurred|Premature close|ECONNRESET|tls handshake eof|Transport error: network error|failed to connect to websocket|socket hang up" \
            >/dev/null
    fi
}

init_parallel_agents() {
    local raw="${PARALLEL_AGENTS:-$PARALLEL_AGENTS_DEFAULT}"
    local parsed=()
    local cleaned=()
    local agent

    IFS=',' read -r -a parsed <<< "$raw"

    for agent in "${parsed[@]}"; do
        agent="${agent//[[:space:]]/}"
        [[ -z "$agent" ]] && continue

        case "$agent" in
            codex|claude|gemini)
                cleaned+=("$agent")
                ;;
            *)
                log "${YELLOW}[Parallel]${NC} Unknown agent '$agent', skipping."
                ;;
        esac
    done

    PARALLEL_AGENT_LIST=("${cleaned[@]}")

    if [[ ${#PARALLEL_AGENT_LIST[@]} -eq 0 ]]; then
        die "No valid agents for parallel mode. Set PARALLEL_AGENTS=codex,claude,gemini"
    fi
}

all_parallel_complete() {
    local agent
    for agent in "${PARALLEL_AGENT_LIST[@]}"; do
        if ! is_complete_file "$(progress_file_for_agent "$agent")"; then
            return 1
        fi
    done
    return 0
}

run_one_parallel_iteration() {
    local iteration="$1"
    local pids=()
    local pid_agents=()
    local status_files=()
    local agent_logs=()
    local agent_start_lines=()
    local launched=0
    local agent

    log "${GREEN}═══ Parallel Iteration $iteration ═══${NC}"

    for agent in "${PARALLEL_AGENT_LIST[@]}"; do
        local plan_file
        local progress_file
        local agent_log
        local status_file
        local start_line=0

        plan_file="$(plan_file_for_agent "$agent")"
        progress_file="$(progress_file_for_agent "$agent")"
        agent_log="$(log_file_for_agent "$agent")"
        status_file="$(status_file_for_agent_iteration "$agent" "$iteration")"

        [[ -f "$plan_file" ]] || die "Plan file not found for $agent: $plan_file"
        ensure_progress_file "$progress_file"

        if is_complete_file "$progress_file"; then
            log "${GREEN}[Parallel][$agent]${NC} Already COMPLETE, skipping."
            continue
        fi

        if [[ -f "$agent_log" ]]; then
            start_line="$(wc -l < "$agent_log" | tr -d ' ')"
        fi

        (
            set +e
            run_agent_with_retries "$iteration" "$agent" "$plan_file" "$progress_file" "$agent_log" "$status_file"
            exit "$?"
        ) &

        pids+=("$!")
        pid_agents+=("$agent")
        status_files+=("$status_file")
        agent_logs+=("$agent_log")
        agent_start_lines+=("$start_line")
        launched=$((launched + 1))
    done

    if [[ $launched -eq 0 ]]; then
        log "${GREEN}[Parallel]${NC} No runnable agents in this iteration."
        return 0
    fi

    local live_meta_file=""
    local monitor_pid=""

    if [[ "$PARALLEL_LIVE_PROGRESS" == "1" ]]; then
        live_meta_file="$(mktemp "${TMPDIR:-/tmp}/ralph-live-${iteration}.XXXXXX")"
        for idx in "${!pids[@]}"; do
            echo "${pid_agents[$idx]}|${pids[$idx]}|${agent_logs[$idx]}|${agent_start_lines[$idx]}" >> "$live_meta_file"
        done
        run_parallel_live_monitor "$iteration" "$live_meta_file" &
        monitor_pid="$!"
    fi

    local failures=0
    local idx
    for idx in "${!pids[@]}"; do
        local pid="${pids[$idx]}"
        local agent_name="${pid_agents[$idx]}"
        local status_file="${status_files[$idx]}"
        local wait_rc=0
        local exit_code=""
        local attempts=""
        local plan_file=""
        local progress_file=""
        local agent_log=""
        local excerpt=""

        if wait "$pid"; then
            wait_rc=0
        else
            wait_rc=$?
        fi

        exit_code="$(status_value "$status_file" "exit_code")"
        attempts="$(status_value "$status_file" "attempts")"
        plan_file="$(status_value "$status_file" "plan_file")"
        progress_file="$(status_value "$status_file" "progress_file")"
        agent_log="$(status_value "$status_file" "log_file")"

        if [[ -z "$exit_code" ]]; then
            exit_code="$wait_rc"
        fi
        if [[ -z "$attempts" ]]; then
            attempts="1"
        fi

        if [[ "$exit_code" =~ ^[0-9]+$ ]] && [[ "$exit_code" -eq 0 ]]; then
            log "${GREEN}[Parallel][$agent_name]${NC} Succeeded (attempts=$attempts)."
            {
                echo "[$(date +"$TIMESTAMP_FMT")] agent=$agent_name status=success exit_code=$exit_code attempts=$attempts"
                echo "  plan=$plan_file"
                echo "  progress=$progress_file"
                echo "  log=$agent_log"
            } >> "$PARALLEL_SUMMARY_FILE"
        else
            failures=$((failures + 1))
            log "${RED}[Parallel][$agent_name]${NC} Failed (exit_code=$exit_code, attempts=$attempts)."
            excerpt="$(error_excerpt_from_log "$agent_log")"

            {
                echo "[$(date +"$TIMESTAMP_FMT")] agent=$agent_name status=failed exit_code=$exit_code attempts=$attempts"
                echo "  plan=$plan_file"
                echo "  progress=$progress_file"
                echo "  log=$agent_log"
                if [[ -n "$excerpt" ]]; then
                    echo "  error_excerpt:"
                    echo "$excerpt" | sed 's/^/    /'
                fi
            } >> "$PARALLEL_SUMMARY_FILE"

            append_failure_record_to_progress \
                "$progress_file" "$plan_file" "$agent_name" "$iteration" "$exit_code" "$attempts" "$agent_log" "$excerpt"
        fi
    done

    if [[ -n "$monitor_pid" ]]; then
        wait "$monitor_pid" 2>/dev/null || true
    fi
    if [[ -n "$live_meta_file" && -f "$live_meta_file" ]]; then
        rm -f "$live_meta_file"
    fi

    [[ $failures -eq 0 ]]
}

# ─── Core Loop (fallback mode) ───────────────────────────────────────────────

_try_agent() {
    local agent_name="$1"
    local iteration="$2"
    local before_head="$3"
    local before_ahead="$4"
    local before_docs_state="$5"
    local before_task="$6"
    local runner="run_${agent_name}"
    local after_head=""

    if "$runner"; then
        if git_is_repo; then
            local task_policy_rc=0
            enforce_task_completion_commit_policy \
                "$before_head" "$before_ahead" "$before_docs_state" "$before_task" \
                "$PLAN_FILE" "$PROGRESS_FILE" "$agent_name" || task_policy_rc=$?
            if [[ $task_policy_rc -ne 0 ]]; then
                log "${YELLOW}[Agent: $agent_name]${NC} Task policy failed (rc=$task_policy_rc): $TASK_POLICY_REASON"
                return 1
            fi
        fi

        if git_is_repo; then
            after_head="$(git_current_head)"
            local policy_rc=0
            enforce_doc_push_policy "$before_head" "$before_ahead" "$before_docs_state" "$after_head" "$PLAN_FILE" "$PROGRESS_FILE" || policy_rc=$?
            if [[ $policy_rc -ne 0 ]]; then
                log "${YELLOW}[Agent: $agent_name]${NC} Policy check failed (rc=$policy_rc): $DOC_POLICY_REASON"
                if rescue_doc_policy "$PLAN_FILE" "$PROGRESS_FILE" "$policy_rc" "$agent_name"; then
                    log "${GREEN}[Agent: $agent_name]${NC} Rescue succeeded, continuing."
                else
                    log "${RED}[Agent: $agent_name]${NC} Rescue failed."
                    return 1
                fi
            fi
        fi
        log "${GREEN}[Agent: $agent_name]${NC} Iteration $iteration succeeded."
        return 0
    fi
    return 1
}

run_one_iteration() {
    local iteration="$1"
    local before_head=""
    local before_ahead=0
    local before_docs_state=""
    local before_task=""
    log "${GREEN}═══ Iteration $iteration ═══${NC}"

    if is_complete; then
        log "${GREEN}All tasks marked COMPLETE. Stopping.${NC}"
        return 0
    fi

    build_prompt_file

    if git_is_repo; then
        before_head="$(git_current_head)"
        before_ahead="$(git_ahead_count_or_minus_one)"
        before_docs_state="$(docs_worktree_state "$PLAN_FILE")"
        before_task="$(current_task_title "$PLAN_FILE")"
    fi

    # Single-agent mode: skip fallback chain
    if [[ -n "$AGENT" ]]; then
        if _try_agent "$AGENT" "$iteration" "$before_head" "$before_ahead" "$before_docs_state" "$before_task"; then
            return 0
        fi
        log "${RED}[Agent: $AGENT]${NC} Failed on iteration $iteration."
        append_failure_record_to_progress \
            "$PROGRESS_FILE" "$PLAN_FILE" "$AGENT" "$iteration" "1" "1" "$LOG_FILE" "$(error_excerpt_from_log "$LOG_FILE")"
        return 1
    fi

    # Fallback chain: codex → claude → gemini
    local agent
    for agent in codex claude gemini; do
        if _try_agent "$agent" "$iteration" "$before_head" "$before_ahead" "$before_docs_state" "$before_task"; then
            return 0
        fi
        log "${YELLOW}[Agent: $agent]${NC} Failed.${NC}"
    done

    log "${RED}All agents failed on iteration $iteration.${NC}"
    append_failure_record_to_progress \
        "$PROGRESS_FILE" "$PLAN_FILE" "fallback-chain" "$iteration" "1" "1" "$LOG_FILE" "$(error_excerpt_from_log "$LOG_FILE")"
    return 1
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
    local mode="--once"
    local max_iterations=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --once|--afk|--parallel)
                mode="$1"; shift ;;
            --plan)
                PLAN_FILE="${2:?--plan requires a file path}"; shift 2 ;;
            --progress)
                PROGRESS_FILE="${2:?--progress requires a file path}"; shift 2 ;;
            --instructions)
                INSTRUCTIONS_FILE="${2:?--instructions requires a file path}"; shift 2 ;;
            --complete-when-no)
                COMPLETE_WHEN_NO_PATTERN="${2:?--complete-when-no requires a pattern}"; shift 2 ;;
            --agent)
                AGENT="${2:?--agent requires a name (codex|claude|gemini)}"; shift 2 ;;
            --help|-h)
                cat <<HELP
Usage: $0 [MODE] [OPTIONS] [MAX_ITERATIONS]

Modes:
  --once                 Run a single fallback iteration (default)
  --afk [N]              Loop fallback mode until complete or N iterations
  --parallel [N]         Run agents in parallel (default N=1)

Options:
  --plan FILE            Plan file (default: plan.md)
  --progress FILE        Progress file (default: progress.md)
  --instructions FILE    Per-turn instructions injected into prompt
  --complete-when-no PAT Stop when PATTERN not found in plan file
                         (uses fixed-string match, e.g. '[建议]')
  --agent NAME           Use only this agent (codex|claude|gemini), no fallback
  --help, -h             Show this help

Parallel mode files:
  plan.<agent>.md        Optional per-agent plan (fallback to plan.md)
  progress.<agent>.md    Per-agent progress file
  ralph-<agent>.log      Per-agent log file

Env vars:
  PARALLEL_AGENTS=codex,claude,gemini
  AGENT_RETRY_LIMIT=2
  AGENT_TIMEOUT_SEC=900
  FEEDBACK_CMD='pnpm -r --if-present typecheck && pnpm -r --if-present test && pnpm -r --if-present lint'
  TELEGRAM_CONFIG=~/.claude/skills/telegram-notify/config.json

Example:
  $0 --afk 50 --plan docs/user-journeys.md --progress progress.md \\
     --instructions ralph-instructions.md --complete-when-no '[建议]'
HELP
                exit 0
                ;;
            *)
                if [[ "$1" =~ ^[0-9]+$ ]]; then
                    max_iterations="$1"; shift
                else
                    die "Unknown option: $1. Use --help for usage."
                fi ;;
        esac
    done

    if [[ -z "$max_iterations" ]]; then
        case "$mode" in
            --parallel) max_iterations="$DEFAULT_PARALLEL_ITERATIONS" ;;
            *) max_iterations="$DEFAULT_MAX_ITERATIONS" ;;
        esac
    fi

    [[ -f "$PLAN_FILE" ]] || die "Plan file not found: $PLAN_FILE"

    ensure_progress_file "$PROGRESS_FILE"
    check_deps

    mkdir -p "$STATUS_DIR"

    log "═══════════════════════════════════════════════"
    log "Ralph Loop — Mode: $mode | Max iterations: $max_iterations"
    log "═══════════════════════════════════════════════"

    case "$mode" in
        --once)
            local _once_before_task _once_after_task _once_done_task
            _once_before_task="$(current_task_title "$PLAN_FILE")"
            if run_one_iteration 1; then
                _once_after_task="$(current_task_title "$PLAN_FILE")"
                _once_done_task="$(completed_task_from_transition "$_once_before_task" "$_once_after_task")"
                if is_complete; then
                    notify_telegram "[$PROJECT_NAME] ✅ 单次执行完成 | 完成任务: $_once_done_task | 状态: 全部任务已完成"
                else
                    notify_telegram "[$PROJECT_NAME] ✅ 单次执行完成 | 完成任务: $_once_done_task | 下一任务: $_once_after_task"
                fi
            else
                notify_telegram "[$PROJECT_NAME] ❌ 单次执行失败 | 完成任务: 无 | 卡在: $_once_before_task"
            fi
            ;;

        --afk)
            local i=1
            local consecutive_failures=0
            local last_completed_task="无"

            while [[ $i -le $max_iterations ]]; do
                if is_complete; then
                    log "${GREEN}═══ ALL TASKS COMPLETE ═══${NC}"
                    notify_telegram "[$PROJECT_NAME] ✅ 全部任务已完成！(共 $((i - 1)) 轮迭代) | 最后完成任务: $last_completed_task"
                    break
                fi

                local _task_before _task_after _done_task
                _task_before="$(current_task_title "$PLAN_FILE")"
                if run_one_iteration "$i"; then
                    consecutive_failures=0
                    _task_after="$(current_task_title "$PLAN_FILE")"
                    _done_task="$(completed_task_from_transition "$_task_before" "$_task_after")"
                    if [[ "$_done_task" != "无" ]]; then
                        last_completed_task="$_done_task"
                    fi
                    notify_telegram "[$PROJECT_NAME] 🔄 Iteration $i/$max_iterations 完成 | 完成任务: $_done_task | 下一任务: $_task_after"
                else
                    consecutive_failures=$((consecutive_failures + 1))
                    if [[ $consecutive_failures -ge 3 ]]; then
                        local _fail_task; _fail_task="$(current_task_title "$PLAN_FILE")"
                        log "${RED}3 consecutive failures. Stopping to prevent waste.${NC}"
                        notify_telegram "[$PROJECT_NAME] 🛑 连续失败 3 次，已停止 (iteration $i/$max_iterations) | 完成任务: 无 | 卡在: $_fail_task"
                        break
                    fi
                fi

                i=$((i + 1))

                if [[ $i -le $max_iterations ]] && ! is_complete; then
                    log "Pausing 5s before next iteration..."
                    sleep 5
                fi
            done

            if [[ $i -gt $max_iterations ]] && ! is_complete; then
                local _remain_task; _remain_task="$(current_task_title "$PLAN_FILE")"
                log "${YELLOW}Reached max iterations ($max_iterations). Some tasks may remain.${NC}"
                notify_telegram "[$PROJECT_NAME] 🛑 已达最大迭代次数 ($max_iterations) | 最近完成任务: $last_completed_task | 剩余任务: $_remain_task"
            fi
            ;;

        --parallel)
            init_parallel_agents

            {
                echo "# Ralph Parallel Summary"
                echo ""
                echo "Generated at: $(date +"$TIMESTAMP_FMT")"
                echo "Agents: ${PARALLEL_AGENT_LIST[*]}"
                echo "Max iterations: $max_iterations"
                echo ""
            } > "$PARALLEL_SUMMARY_FILE"

            if [[ "$PARALLEL_LIVE_PROGRESS" == "1" ]]; then
                log "[Parallel] Live progress enabled (interval=${PARALLEL_PROGRESS_INTERVAL_SEC}s, trace=${PARALLEL_TRACE_FILE})."
            else
                log "[Parallel] Live progress disabled."
            fi

            local i=1
            local consecutive_failures=0
            local parallel_last_completed="无"

            while [[ $i -le $max_iterations ]]; do
                if all_parallel_complete; then
                    log "${GREEN}[Parallel] All agent progress files are COMPLETE.${NC}"
                    notify_telegram "[$PROJECT_NAME] ✅ Parallel Loop 完成！全部 agent 任务已完成。(共 $((i - 1)) 轮迭代) | 最后完成任务: $parallel_last_completed"
                    break
                fi

                local _par_before_tasks=()
                local _par_agent
                for _par_agent in "${PARALLEL_AGENT_LIST[@]}"; do
                    _par_before_tasks+=("$(current_task_title "$(plan_file_for_agent "$_par_agent")")")
                done

                if run_one_parallel_iteration "$i"; then
                    consecutive_failures=0
                    local _par_done_parts=()
                    local _par_done_summary="无"
                    local _par_idx
                    for _par_idx in "${!PARALLEL_AGENT_LIST[@]}"; do
                        local _agent_name="${PARALLEL_AGENT_LIST[$_par_idx]}"
                        local _before_task="${_par_before_tasks[$_par_idx]}"
                        local _after_task
                        local _done_task
                        _after_task="$(current_task_title "$(plan_file_for_agent "$_agent_name")")"
                        _done_task="$(completed_task_from_transition "$_before_task" "$_after_task")"
                        if [[ "$_done_task" != "无" ]]; then
                            _par_done_parts+=("${_agent_name}: ${_done_task}")
                        fi
                    done

                    if [[ ${#_par_done_parts[@]} -gt 0 ]]; then
                        local IFS='; '
                        _par_done_summary="${_par_done_parts[*]}"
                        parallel_last_completed="$_par_done_summary"
                    fi

                    local _par_remaining; _par_remaining="$(parallel_remaining_summary)"
                    notify_telegram "[$PROJECT_NAME] 🔄 Parallel iteration $i/$max_iterations 完成 | 完成任务: $_par_done_summary | 剩余: $_par_remaining"
                else
                    consecutive_failures=$((consecutive_failures + 1))
                    if [[ "$PARALLEL_MAX_CONSECUTIVE_FAILURES" =~ ^[0-9]+$ ]] \
                        && [[ "$PARALLEL_MAX_CONSECUTIVE_FAILURES" -gt 0 ]] \
                        && [[ $consecutive_failures -ge $PARALLEL_MAX_CONSECUTIVE_FAILURES ]]; then
                        log "${RED}[Parallel] $consecutive_failures consecutive failed iterations reached limit ($PARALLEL_MAX_CONSECUTIVE_FAILURES). Stopping.${NC}"
                        local _par_stuck; _par_stuck="$(parallel_remaining_summary)"
                        notify_telegram "[$PROJECT_NAME] 🛑 Parallel Loop 连续失败 $consecutive_failures 次，已停止 | 完成任务: 无 | 卡在: $_par_stuck"
                        break
                    else
                        log "${YELLOW}[Parallel] Iteration failed (streak=$consecutive_failures), continuing to next iteration.${NC}"
                    fi
                fi

                i=$((i + 1))

                if [[ $i -le $max_iterations ]] && ! all_parallel_complete; then
                    log "[Parallel] Pausing 5s before next iteration..."
                    sleep 5
                fi
            done

            if [[ $i -gt $max_iterations ]] && ! all_parallel_complete; then
                log "${YELLOW}[Parallel] Reached max iterations ($max_iterations).${NC}"
                local _par_remain; _par_remain="$(parallel_remaining_summary)"
                notify_telegram "[$PROJECT_NAME] 🛑 Parallel Loop 已达最大迭代次数 ($max_iterations) | 最近完成任务: $parallel_last_completed | 剩余: $_par_remain"
            fi

            log "[Parallel] Summary written to $PARALLEL_SUMMARY_FILE"
            ;;

        *)
            die "Unknown mode: $mode. Use --once, --afk, --parallel, or --help"
            ;;
    esac
}

main "$@"
