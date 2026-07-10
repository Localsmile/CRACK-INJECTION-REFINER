$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
  node (Join-Path $PSScriptRoot 'run-regressions.js')
  if ($LASTEXITCODE -ne 0) { throw "Regression tests failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}
