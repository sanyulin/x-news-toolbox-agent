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
  }

  $standalone = Join-Path $projectRoot ".next\standalone"
  if (-not (Test-Path -LiteralPath (Join-Path $standalone "server.js"))) {
    throw "未找到 .next\standalone\server.js"
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
  Copy-Item -LiteralPath $NodeExe -Destination (Join-Path $outputDir "node.exe")
  Copy-Item -LiteralPath $launcherTemplate -Destination $outputDir
  Copy-Item -LiteralPath $readmeTemplate -Destination $outputDir
  New-Item -ItemType Directory -Path (Join-Path $outputDir "data") | Out-Null

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
