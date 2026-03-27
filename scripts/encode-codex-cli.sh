#!/bin/sh
set -eu

PROMPT="$(cat)"
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

CODEX_BIN="${CODEX_BIN:-$(command -v codex || true)}"
if [ -z "$CODEX_BIN" ] && [ -x "/Applications/Codex.app/Contents/Resources/codex" ]; then
  CODEX_BIN="/Applications/Codex.app/Contents/Resources/codex"
fi

if [ -z "$CODEX_BIN" ]; then
  echo "codex binary not found in PATH" >&2
  exit 1
fi

"$CODEX_BIN" exec "$PROMPT" \
  --skip-git-repo-check \
  --color never \
  -o "$TMP_FILE" \
  "$@" >/dev/null

cat "$TMP_FILE"
