$ErrorActionPreference = "Stop"
$prompt = [Console]::In.ReadToEnd()
$claude = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claude) { Write-Error "claude binary not found in PATH"; exit 1 }
& claude -p $prompt @args
exit $LASTEXITCODE
