[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'OntosDemo'
$pidFile = Join-Path $runtimeRoot 'processes.json'

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host 'Nebyl nalezen žádný proces spuštěný pomocí start-erp-demo.ps1.'
  exit 0
}

$processIds = @((Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json).processIds)
foreach ($processId in $processIds) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($null -ne $process) {
    & taskkill.exe /PID $processId /T /F | Out-Null
  }
}

Remove-Item -LiteralPath $pidFile
Write-Host 'Procesy ERP dema byly zastaveny. Docker databáze zůstaly zachované.' -ForegroundColor Green
