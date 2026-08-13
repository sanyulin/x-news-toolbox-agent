$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$target = Join-Path $projectRoot ".env.local"
if (Test-Path -LiteralPath $target) {
  throw ".env.local 已存在。为避免覆盖密钥，请手动备份或编辑该文件。"
}

function Read-Secret([string]$Prompt, [bool]$Required = $false) {
  do {
    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  } while ($Required -and [string]::IsNullOrWhiteSpace($value))
  return $value.Trim()
}

function DotEnv([string]$Value) {
  if ($Value.Contains("`r") -or $Value.Contains("`n")) { throw "密钥不能包含换行" }
  return '"' + $Value.Replace('\', '\\').Replace('"', '\"') + '"'
}

$builderKey = Read-Secret "1/5 Minds Builder API Key（必填）" $true
$mindId = (Read-Host "2/5 Mind ID（可留空自动选择）").Trim()
$provider = (Read-Host "3/5 Horizon 服务商 [deepseek/openai/anthropic/gemini/doubao/ali/minimax/azure/ollama]（默认 deepseek）").Trim().ToLowerInvariant()
if (-not $provider) { $provider = "deepseek" }
$providers = @("deepseek", "openai", "anthropic", "gemini", "doubao", "ali", "minimax", "azure", "ollama")
if ($provider -notin $providers) { throw "不支持的 Horizon 服务商：$provider" }
$horizonKey = if ($provider -eq "ollama") { "" } else { Read-Secret "4/5 Horizon API Key（必填）" $true }
$xKey = Read-Secret "5/5 X Bearer Token（可留空）"
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$cronSecret = ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()

$lines = @(
  "MINDS_BUILDER_API_KEY=$(DotEnv $builderKey)",
  "MINDS_MIND_ID=$(DotEnv $mindId)",
  'MINDS_CONVERSATION_ALIAS="creator-main"',
  "HORIZON_ENABLED=true",
  "HORIZON_PROVIDER=$provider",
  "HORIZON_API_KEY=$(DotEnv $horizonKey)",
  "X_BEARER_TOKEN=$(DotEnv $xKey)",
  "CREATOR_MIND_CRON_SECRET=$(DotEnv $cronSecret)"
)
[IO.File]::WriteAllLines($target, $lines, [Text.UTF8Encoding]::new($false))

Write-Output "配置已保存到 .env.local（该文件已被 Git 忽略）。"
Write-Output "下一步：运行 pnpm dev，然后让 Mind 调用 GET /api/agent/status 完成自检。"
