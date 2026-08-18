param(
  [string]$NodeExe = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $NodeExe) {
  $NodeExe = (Get-Command node -ErrorAction Stop).Source
}
$NodeExe = (Resolve-Path -LiteralPath $NodeExe).Path
$launcherTemplate = Join-Path $projectRoot "portable\start.cmd"
$readmeTemplate = Join-Path $projectRoot "portable\README.txt"
if (-not (Test-Path -LiteralPath $launcherTemplate)) { throw "Missing portable launcher" }
if (-not (Test-Path -LiteralPath $readmeTemplate)) { throw "Missing portable README" }

Push-Location $projectRoot
try {
  if (-not $SkipBuild) {
    & $NodeExe "node_modules\next\dist\bin\next" build
    if ($LASTEXITCODE -ne 0) { throw "Next.js 构建失败" }
    & $NodeExe "scripts\build-agent.mjs"
    if ($LASTEXITCODE -ne 0) { throw "Agent CLI 构建失败" }
  }

  $standalone = Join-Path $projectRoot ".next\standalone"
  if (-not (Test-Path -LiteralPath (Join-Path $standalone "server.js"))) {
    throw "未找到 .next\standalone\server.js"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "dist\agent\cli.mjs"))) {
    throw "未找到 dist\agent\cli.mjs"
  }

  $distRoot = Join-Path $projectRoot "dist"
  New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
  $outputDir = Join-Path $distRoot "x-news-toolbox-portable-$stamp"
  if (Test-Path -LiteralPath $outputDir) { throw "输出目录已存在：$outputDir" }
  New-Item -ItemType Directory -Path $outputDir | Out-Null

  Copy-Item -LiteralPath (Join-Path $standalone "server.js") -Destination $outputDir
  Copy-Item -LiteralPath (Join-Path $standalone "package.json") -Destination $outputDir
  Copy-Item -LiteralPath (Join-Path $standalone "node_modules") -Destination $outputDir -Recurse -Force
  Copy-Item -Path (Join-Path $standalone "node_modules\.pnpm\node_modules\*") -Destination (Join-Path $outputDir "node_modules") -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $standalone ".next") -Destination $outputDir -Recurse -Force
  New-Item -ItemType Directory -Path (Join-Path $outputDir ".next\static") -Force | Out-Null
  Copy-Item -Path (Join-Path $projectRoot ".next\static\*") -Destination (Join-Path $outputDir ".next\static") -Recurse -Force
  if (Test-Path -LiteralPath (Join-Path $projectRoot "public")) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "public") -Destination $outputDir -Recurse -Force
  }
  if (Test-Path -LiteralPath (Join-Path $projectRoot "config\horizon")) {
    New-Item -ItemType Directory -Path (Join-Path $outputDir "config") -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot "config\horizon") -Destination (Join-Path $outputDir "config") -Recurse -Force
  }
  Copy-Item -LiteralPath $NodeExe -Destination (Join-Path $outputDir "node.exe")
  Copy-Item -LiteralPath $launcherTemplate -Destination $outputDir
  Copy-Item -LiteralPath $readmeTemplate -Destination $outputDir
  Copy-Item -LiteralPath (Join-Path $projectRoot "portable\agent.cmd") -Destination $outputDir
  New-Item -ItemType Directory -Path (Join-Path $outputDir "agent") | Out-Null
  Copy-Item -LiteralPath (Join-Path $projectRoot "dist\agent\cli.mjs") -Destination (Join-Path $outputDir "agent\cli.mjs")
  Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\install-agent-schedule.ps1") -Destination $outputDir
  Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\verify-agent-schedule.ps1") -Destination $outputDir
  New-Item -ItemType Directory -Path (Join-Path $outputDir "data") | Out-Null

  $horizonManifestPath = Join-Path $projectRoot ".runtime\horizon.json"
  if (-not (Test-Path -LiteralPath $horizonManifestPath)) {
    throw "未安装 Horizon Worker，请先运行 scripts\bootstrap-horizon.ps1"
  }
  $horizonManifest = Get-Content -LiteralPath $horizonManifestPath -Encoding UTF8 -Raw | ConvertFrom-Json
  if ($horizonManifest.commit -ne "80bde6db03008678111fb627b471792c7ac05a94") {
    throw "Horizon Worker 不是已审计的固定版本"
  }
  $pythonRuntime = [string]$horizonManifest.pythonRuntime
  $horizonSitePackages = Join-Path $projectRoot ".runtime\horizon-$($horizonManifest.commit)\.venv\Lib\site-packages"
  if (-not (Test-Path -LiteralPath (Join-Path $pythonRuntime "python.exe"))) { throw "Horizon Python 运行时不完整" }
  if (-not (Test-Path -LiteralPath (Join-Path $horizonSitePackages "src\mcp\server.py"))) { throw "Horizon Python 包不完整" }

  $portableHorizon = Join-Path $outputDir "runtime\horizon"
  $portablePython = Join-Path $portableHorizon "python"
  New-Item -ItemType Directory -Path $portableHorizon -Force | Out-Null
  New-Item -ItemType Directory -Path $portablePython | Out-Null
  Copy-Item -Path (Join-Path $pythonRuntime "*") -Destination $portablePython -Recurse -Force
  New-Item -ItemType Directory -Path (Join-Path $portablePython "Lib\site-packages") -Force | Out-Null
  Get-ChildItem -LiteralPath $horizonSitePackages -Force |
    Where-Object { $_.Name -ne "data" } |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $portablePython "Lib\site-packages") -Recurse -Force }
  @{
    commit = [string]$horizonManifest.commit
    command = "python\python.exe"
    args = @("-m", "src.mcp.server")
    cwd = "."
    horizonPath = "python\Lib\site-packages"
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $portableHorizon "manifest.json") -Encoding UTF8
  Copy-Item -LiteralPath (Join-Path $projectRoot "licenses\Horizon-MIT.txt") -Destination $portableHorizon

  $forbiddenPaths = @(
    ".env",
    ".env.local",
    "data\runtime-config.json",
    "data\creator-mind.sqlite",
    "data\x-news-toolbox.sqlite"
  )
  foreach ($relativePath in $forbiddenPaths) {
    if (Test-Path -LiteralPath (Join-Path $outputDir $relativePath)) {
      throw "便携版包含不应分发的本机配置或数据：$relativePath"
    }
  }

  Write-Output "PORTABLE_DIR=$outputDir"
} finally {
  Pop-Location
}
