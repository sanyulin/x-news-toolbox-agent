param(
  [Parameter(Mandatory = $true)]
  [string]$PythonExe
)

$ErrorActionPreference = "Stop"
$commit = "80bde6db03008678111fb627b471792c7ac05a94"
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot ".runtime"
$installRoot = Join-Path $runtimeRoot "horizon-$commit"
$manifestPath = Join-Path $runtimeRoot "horizon.json"
$venvPython = Join-Path $installRoot ".venv\Scripts\python.exe"
$workerCommand = Join-Path $installRoot ".venv\Scripts\horizon-mcp.exe"

$PythonExe = (Resolve-Path -LiteralPath $PythonExe).Path
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $installRoot)) {
  New-Item -ItemType Directory -Path $installRoot | Out-Null
}
if (-not (Test-Path -LiteralPath $venvPython)) {
  & $PythonExe -m venv (Join-Path $installRoot ".venv")
  if ($LASTEXITCODE -ne 0) { throw "创建 Horizon Python 环境失败" }
}

$horizonVersion = (& $venvPython -c "from importlib.metadata import version; print(version('horizon'))").Trim()
if ($horizonVersion -ne "0.1.0") {
  & $venvPython -m pip install --disable-pip-version-check --progress-bar off "https://github.com/Thysrael/Horizon/archive/$commit.zip"
  if ($LASTEXITCODE -ne 0) { throw "安装固定版本 Horizon 失败" }
}
$mcpVersion = (& $venvPython -c "from importlib.metadata import version; print(version('mcp'))").Trim()
if ($mcpVersion -ne "1.27.0") {
  & $venvPython -m pip install --disable-pip-version-check --progress-bar off "mcp==1.27.0"
  if ($LASTEXITCODE -ne 0) { throw "安装 Horizon 兼容的 MCP SDK 失败" }
}
if (-not (Test-Path -LiteralPath $workerCommand)) { throw "未生成 horizon-mcp.exe" }

& $venvPython -c "import src.models, src.mcp.server"
if ($LASTEXITCODE -ne 0) { throw "Horizon Python 包不完整" }

$sitePackages = Join-Path $installRoot ".venv\Lib\site-packages"
$packageMarker = Join-Path $sitePackages "pyproject.toml"
if (-not (Test-Path -LiteralPath $packageMarker)) {
  [System.IO.File]::WriteAllText($packageMarker, "[project]`nname = `"horizon-runtime`"`nversion = `"0.1.0`"`n", [System.Text.UTF8Encoding]::new($false))
}

@{
  commit = $commit
  command = "horizon-$commit\.venv\Scripts\horizon-mcp.exe"
  cwd = "horizon-$commit"
  horizonPath = "horizon-$commit\.venv\Lib\site-packages"
  pythonRuntime = (Split-Path -Parent $PythonExe)
} | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Output "HORIZON_MANIFEST=$manifestPath"
