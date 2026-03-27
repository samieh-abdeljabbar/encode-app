#!/bin/sh
set -eu

PROMPT="$(cat)"
CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude || true)}"

if [ -z "$CLAUDE_BIN" ]; then
  echo "claude binary not found in PATH" >&2
  exit 1
fi

exec "$CLAUDE_BIN" -p "$PROMPT" "$@"
