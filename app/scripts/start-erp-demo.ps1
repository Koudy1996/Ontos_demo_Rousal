[CmdletBinding()]
param(
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$appRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'OntosDemo'
$toolsRoot = Join-Path $runtimeRoot 'tools'
$logsRoot = Join-Path $runtimeRoot 'logs'
$pidFile = Join-Path $runtimeRoot 'processes.json'
$pnpmPath = Join-Path $toolsRoot 'pnpm.cmd'

New-Item -ItemType Directory -Force -Path $toolsRoot, $logsRoot | Out-Null

function Resolve-MiseToolHome {
  param([Parameter(Mandatory)][string]$Tool)

  $miseCommand = Get-Command mise.exe -ErrorAction SilentlyContinue
  if ($null -eq $miseCommand) {
    throw 'Nástroj mise nebyl nalezen. Nainstalujte jej příkazem: winget install jdx.mise'
  }

  # Windows PowerShell 5 converts stderr from native programs to an error record.
  # Temporarily keep that non-terminating so a missing runtime can be installed below.
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $toolHomeOutput = @(& $miseCommand.Source where $Tool 2>$null)
    $miseExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($miseExitCode -ne 0 -or $toolHomeOutput.Count -eq 0) {
    Write-Host "Instaluji požadovaný runtime $Tool..." -ForegroundColor Cyan
    try {
      $ErrorActionPreference = 'Continue'
      & $miseCommand.Source install $Tool 2>&1 | ForEach-Object { Write-Host $_ }
      $miseExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($miseExitCode -ne 0) {
      throw "Runtime $Tool se nepodařilo nainstalovat pomocí mise."
    }

    try {
      $ErrorActionPreference = 'Continue'
      $toolHomeOutput = @(& $miseCommand.Source where $Tool 2>$null)
      $miseExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
  }

  $toolHome = ($toolHomeOutput | Select-Object -Last 1)
  if ($miseExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($toolHome)) {
    throw "Mise nenalezlo instalační cestu pro $Tool."
  }

  $resolvedToolHome = $toolHome.Trim()
  if (-not (Test-Path -LiteralPath $resolvedToolHome -PathType Container)) {
    throw "Instalační adresář pro $Tool neexistuje: $resolvedToolHome"
  }

  return $resolvedToolHome
}

$nodeHome = Resolve-MiseToolHome -Tool 'node@26.7.0'

if (-not (Test-Path -LiteralPath $pnpmPath)) {
  & (Join-Path $nodeHome 'npm.cmd') install --global --prefix $toolsRoot pnpm@12.4.2
}

$env:Path = "$toolsRoot;$nodeHome;$env:Path"
$env:DATABASE_ADMIN_URL = 'postgresql://ontos_admin:ontos_admin@localhost:5433/ontos'
$env:DATABASE_URL = 'postgresql://ontos_runtime:ontos_runtime@localhost:5433/ontos'
$env:COMMERCE_PORTAL_AUTH_DATABASE_ADMIN_URL = $env:DATABASE_ADMIN_URL
$env:COMMERCE_PORTAL_AUTH_DATABASE_URL = $env:DATABASE_URL
$env:BETTER_AUTH_URL = 'http://localhost:3020'
$env:BETTER_AUTH_SECRET = 'ontos-local-development-secret-at-least-32-characters-long'
$env:SPICEDB_ENDPOINT = 'localhost:50051'
$env:SPICEDB_INSECURE = 'true'
$env:SPICEDB_PRESHARED_KEY = 'ontos-local-development-key'
$env:ONTOS_DEPLOYMENT_ENVIRONMENT = 'local'
$env:ONTOS_GATEWAY_ISSUER = 'http://localhost:3020'
$env:ONTOS_GATEWAY_PRIVATE_JWK = '{"crv":"Ed25519","d":"UoaeSCRqtNBHKhIQ-gzuhaTWwch5wyr5JUp0NOV_zR0","x":"QnsRCV4QqDIWrlIw_7gfUmHsm_VYzkOzxkaaQllPXqg","kty":"OKP","alg":"EdDSA","use":"sig","kid":"ontos-local-dev"}'
$env:ONTOS_GATEWAY_PUBLIC_JWKS = '{"keys":[{"crv":"Ed25519","x":"QnsRCV4QqDIWrlIw_7gfUmHsm_VYzkOzxkaaQllPXqg","kty":"OKP","alg":"EdDSA","use":"sig","kid":"ontos-local-dev"}]}'
$env:ONTOS_PARTY_REGISTRY_API_URL = 'http://localhost:4102/party-registry-api'
$env:ONTOS_SALES_INQUIRIES_API_URL = 'http://localhost:4108/sales-inquiries-api'
$env:ONTOS_SERVICE_JOBS_API_URL = 'http://localhost:4109/service-jobs-api'

function Test-DockerEngine {
  $dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
  if ($null -eq $dockerCommand) {
    return $false
  }

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'SilentlyContinue'
    & $dockerCommand.Source info --format '{{.ServerVersion}}' *> $null
    return $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

function Ensure-DockerEngine {
  if (Test-DockerEngine) {
    return
  }

  $dockerDesktopPath = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path -LiteralPath $dockerDesktopPath -PathType Leaf)) {
    throw 'Docker Desktop nebyl nalezen. Nainstalujte Docker Desktop a spusťte ERP demo znovu.'
  }

  Write-Host 'Spouštím Docker Desktop...' -ForegroundColor Cyan
  Start-Process -FilePath $dockerDesktopPath -ArgumentList '--minimized' -WindowStyle Hidden | Out-Null

  $deadline = (Get-Date).AddSeconds(180)
  while ((Get-Date) -lt $deadline) {
    if (Test-DockerEngine) {
      return
    }
    Start-Sleep -Seconds 3
  }

  throw 'Docker Desktop se nepodařilo připravit do 180 sekund. Otevřete Docker Desktop a zkontrolujte jeho chybové hlášení.'
}

function Test-Endpoint {
  param([Parameter(Mandatory)][string]$Url)

  & curl.exe --silent --fail --max-time 2 --output NUL $Url
  return $LASTEXITCODE -eq 0
}

function Wait-Endpoint {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Url,
    [int]$TimeoutSeconds = 420
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Endpoint -Url $Url) {
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "$Name se nespustil do $TimeoutSeconds sekund. Logy jsou v $logsRoot."
}

Push-Location $appRoot
try {
  Ensure-DockerEngine
  docker compose up -d

  $deadline = (Get-Date).AddSeconds(90)
  do {
    $databaseHealth = docker inspect --format '{{.State.Health.Status}}' ontos-db 2>$null
    $spiceDbHealth = docker inspect --format '{{.State.Health.Status}}' ontos-spicedb 2>$null
    if ($databaseHealth -eq 'healthy' -and $spiceDbHealth -eq 'healthy') {
      break
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  if ($databaseHealth -ne 'healthy' -or $spiceDbHealth -ne 'healthy') {
    throw 'Databáze nebo SpiceDB se nepodařilo připravit.'
  }

  $startedProcesses = @()
  $remoteEndpoints = @(
    @{ Name = 'Party Registry'; Package = '@app/party-registry'; Url = 'http://localhost:4102/bundles/remoteEntry.js' },
    @{ Name = 'Sales Inquiries'; Package = '@app/sales-inquiries'; Url = 'http://localhost:4108/bundles/remoteEntry.js' },
    @{ Name = 'Service Jobs'; Package = '@app/service-jobs'; Url = 'http://localhost:4109/bundles/remoteEntry.js' },
    @{ Name = 'Workforce'; Package = '@app/workforce'; Url = 'http://localhost:4110/bundles/remoteEntry.js' },
    @{ Name = 'Job Expenses'; Package = '@app/job-expenses'; Url = 'http://localhost:4111/bundles/remoteEntry.js' }
  )
  & $pnpmPath local:initialize
  if ($LASTEXITCODE -ne 0) {
    throw 'Lokální demo kontext SOS vyklízení se nepodařilo inicializovat.'
  }

  $missingPackages = @($remoteEndpoints | Where-Object { -not (Test-Endpoint -Url $_.Url) } | ForEach-Object { $_.Package })

  if ($missingPackages.Count -gt 0) {
    $arguments = @('--parallel')
    foreach ($package in $missingPackages) {
      $arguments += @('--filter', $package)
    }
    $arguments += @('run', 'dev')
    $remoteProcess = Start-Process -FilePath $pnpmPath -ArgumentList $arguments -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logsRoot 'remotes.out.log') -RedirectStandardError (Join-Path $logsRoot 'remotes.err.log') -PassThru
    $startedProcesses += $remoteProcess.Id
  }

  foreach ($endpoint in $remoteEndpoints) {
    Wait-Endpoint -Name $endpoint.Name -Url $endpoint.Url
  }
  Start-Sleep -Seconds 5

  $shellReadinessUrl = 'http://localhost:3020/shell-super-app-api/auth/session'
  if (-not (Test-Endpoint -Url $shellReadinessUrl)) {
    $generatedPaths = @(
      (Join-Path $appRoot 'apps/shell-super-app/node_modules/.cache/rspack-shell-super-app-web'),
      (Join-Path $appRoot 'apps/shell-super-app/node_modules/.modern-js-shell-super-app-web')
    )
    foreach ($generatedPath in $generatedPaths) {
      $resolvedPath = [IO.Path]::GetFullPath($generatedPath)
      if (-not $resolvedPath.StartsWith($appRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Odmítnuto odstranění generovaného adresáře mimo workspace: $resolvedPath"
      }
      if (Test-Path -LiteralPath $resolvedPath) {
        Remove-Item -LiteralPath $resolvedPath -Recurse -Force
      }
    }
    $shellProcess = Start-Process -FilePath $pnpmPath -ArgumentList @('--filter', '@app/shell-super-app', 'dev') -WorkingDirectory $appRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logsRoot 'shell.out.log') -RedirectStandardError (Join-Path $logsRoot 'shell.err.log') -PassThru
    $startedProcesses += $shellProcess.Id
  }

  Wait-Endpoint -Name 'OntOS shell' -Url $shellReadinessUrl
  Start-Sleep -Seconds 3
  if (-not (Test-Endpoint -Url $shellReadinessUrl)) {
    throw "OntOS shell se po spuštění ukončil. Logy jsou v $logsRoot."
  }

  if ($startedProcesses.Count -gt 0) {
    $knownProcessIds = if (Test-Path -LiteralPath $pidFile) {
      @((Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json).processIds)
    } else {
      @()
    }
    $activeProcessIds = @($knownProcessIds + $startedProcesses | Sort-Object -Unique | Where-Object {
      $null -ne (Get-Process -Id $_ -ErrorAction SilentlyContinue)
    })
    @{ processIds = $activeProcessIds; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding utf8
  }

  Write-Host 'ERP demo běží na http://localhost:3020/cs' -ForegroundColor Green
  Write-Host 'Přihlášení: demo@test.com / password1234'
  Write-Host "Logy: $logsRoot"

  if (-not $NoBrowser) {
    Start-Process 'http://localhost:3020/cs'
  }
} finally {
  Pop-Location
}
