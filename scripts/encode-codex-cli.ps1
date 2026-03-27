$ErrorActionPreference = "Stop"
$prompt = [Console]::In.ReadToEnd()
$tmpFile = [IO.Path]::GetTempFileName()
try {
  $codex = Get-Command codex -ErrorAction SilentlyContinue
  if (-not $codex) { Write-Error "codex binary not found in PATH"; exit 1 }
  & codex exec $prompt --skip-git-repo-check --color never -o $tmpFile @args | Out-Null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Get-Content $tmpFile -Raw
} finally {
  Remove-Item $tmpFile -ErrorAction SilentlyContinue
}
