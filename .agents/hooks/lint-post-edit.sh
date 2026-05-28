#!/usr/bin/env bash
# PostToolUse hook: silently enqueue the touched file for the per-turn
# ESLint check. The actual `eslint` run happens once in the Stop hook
# (.agents/hooks/lint-stop.sh) over the deduped set, so a series of
# edits to the same file collapses into one report instead of N noisy
# warnings that may already be obsolete.
#
# Mutating fixes never happen here. The pre-commit Husky hook
# (.husky/pre-commit) is what runs `eslint --fix`.

set -u

input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')

if [ -z "$file_path" ] || [ -z "$session_id" ]; then exit 0; fi
if [ ! -f "$file_path" ]; then exit 0; fi

case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac

queue="${TMPDIR:-/tmp}/claude-lint-queue-${session_id}.list"
printf '%s\n' "$file_path" >> "$queue"
exit 0
